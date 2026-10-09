#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod window;
use ai_companion::{
    aggregate, csv,
    data::{Reader, Sources},
    limits,
};
use notify::{RecursiveMode, Watcher};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

struct DataState {
    reader: Reader,
    sources: Sources,
    /// Outcome of the latest Claude allowance check: ok, off, no-credentials, expired or error.
    claude_status: &'static str,
    poll_now: Arc<AtomicBool>,
}
type SharedData = Arc<Mutex<DataState>>;
const LIMITS_INTERVAL: Duration = Duration::from_secs(300);
fn config_dir() -> Result<std::path::PathBuf, String> {
    Ok(dirs::config_dir()
        .ok_or("No application data directory")?
        .join("ai-companion"))
}
fn snapshot(state: &mut DataState) -> Value {
    let DataState {
        reader,
        sources,
        claude_status,
        ..
    } = state;
    let mut value = aggregate::all(reader, sources);
    value["claudeLimitsStatus"] = json!(claude_status);
    value
}
#[tauri::command]
fn renderer_preferences() -> Result<Value, String> {
    let path = config_dir()?.join("renderer-preferences.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn save_renderer_preferences(
    values: std::collections::BTreeMap<String, String>,
) -> Result<(), String> {
    if values
        .keys()
        .any(|k| {
            !["dashboard.hiddenProjects", "mini-alerts", "claude-limits"].contains(&k.as_str())
        })
    {
        return Err("Unknown preference".into());
    }
    let dir = config_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("renderer-preferences.json.tmp");
    std::fs::write(
        &tmp,
        serde_json::to_vec(&values).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, dir.join("renderer-preferences.json")).map_err(|e| e.to_string())
}
#[tauri::command]
async fn refresh_data(state: tauri::State<'_, SharedData>) -> Result<Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.poll_now.store(true, Ordering::Relaxed);
        Ok(snapshot(&mut state))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Deserialize)]
struct Range {
    from: f64,
    to: f64,
}
#[tauri::command]
async fn export_csv(
    state: tauri::State<'_, SharedData>,
    range: Range,
    hidden: Vec<String>,
    provider: String,
) -> Result<String, String> {
    if !["all", "claude", "codex"].contains(&provider.as_str())
        || !range.from.is_finite()
        || !range.to.is_finite()
    {
        return Err("Invalid export filter".into());
    }
    let data = refresh_data(state).await?;
    Ok(csv::export(&data, range.from, range.to, &hidden, &provider))
}
fn start_watcher(app: tauri::AppHandle, state: SharedData) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if let Ok(event) = event {
                    if !matches!(event.kind, notify::EventKind::Access(_)) {
                        let _ = tx.send(());
                    }
                }
            })
            .ok();
        let mut watched = std::collections::HashSet::new();
        let mut last = Instant::now() - Duration::from_secs(60);
        loop {
            // Retry missing roots so newly installed providers are discovered without a restart.
            if let Ok(data) = state.lock() {
                let mut roots = vec![data.sources.claude(), data.sources.codex.clone()];
                roots.extend(data.sources.desktop_roots());
                if let Some(w) = watcher.as_mut() {
                    for path in roots {
                        if path.is_dir()
                            && !watched.contains(&path)
                            && w.watch(&path, RecursiveMode::Recursive).is_ok()
                        {
                            watched.insert(path);
                        }
                    }
                }
            }
            let changed = rx.recv_timeout(Duration::from_secs(1)).is_ok();
            if changed {
                // Debounce writes, but do not starve refreshes during a long streaming response.
                let started = Instant::now();
                while started.elapsed() < Duration::from_secs(2)
                    && rx.recv_timeout(Duration::from_millis(350)).is_ok()
                {}
            }
            if changed || last.elapsed() >= Duration::from_secs(60) {
                if let Ok(mut data) = state.lock() {
                    let value = snapshot(&mut data);
                    let _ = app.emit("data:update", value);
                }
                last = Instant::now();
            }
        }
    });
}
/// Poll the Claude usage endpoint for the account allowance, the one outbound call the app makes.
/// Runs every five minutes, immediately after a manual refresh, and whenever the preference is switched.
fn start_limits_poller(app: tauri::AppHandle, state: SharedData) {
    std::thread::spawn(move || {
        let mut last: Option<Instant> = None;
        let mut was_enabled: Option<bool> = None;
        loop {
            let Ok(dir) = config_dir() else {
                std::thread::sleep(Duration::from_secs(60));
                continue;
            };
            let enabled = limits::polling_enabled(&dir);
            let (claude_dir, poll_now) = match state.lock() {
                Ok(data) => (data.sources.claude(), data.poll_now.clone()),
                Err(_) => return,
            };
            // A manual refresh re-checks at most every 30 seconds.
            let due = (poll_now.swap(false, Ordering::Relaxed)
                && last.is_none_or(|t| t.elapsed() >= Duration::from_secs(30)))
                || was_enabled != Some(enabled)
                || last.is_none_or(|t| t.elapsed() >= LIMITS_INTERVAL);
            if due {
                let now = chrono::Local::now().timestamp_millis();
                let (status, live) = if !enabled {
                    ("off", None)
                } else {
                    match limits::credentials(&claude_dir) {
                        None => ("no-credentials", None),
                        Some(c) if c.expires_at > 0 && c.expires_at <= now => ("expired", None),
                        Some(c) => match limits::fetch(&c.token) {
                            Ok(body) => match limits::from_usage(&body, now) {
                                Some(snapshot) => ("ok", Some(snapshot)),
                                None => ("error", None),
                            },
                            Err(error) => {
                                eprintln!("Claude allowance check failed: {error}");
                                ("error", None)
                            }
                        },
                    }
                };
                if let Ok(mut data) = state.lock() {
                    let changed = data.claude_status != status || live.is_some() || !enabled;
                    data.claude_status = status;
                    if live.is_some() || !enabled {
                        data.reader.claude_live = live;
                    }
                    if changed {
                        let value = snapshot(&mut data);
                        let _ = app.emit("data:update", value);
                    }
                }
                last = Some(Instant::now());
                was_enabled = Some(enabled);
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}
fn main() {
    let data = Arc::new(Mutex::new(DataState {
        reader: Reader::default(),
        sources: Sources::local(),
        claude_status: "pending",
        poll_now: Arc::new(AtomicBool::new(false)),
    }));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(data.clone())
        .invoke_handler(tauri::generate_handler![
            refresh_data,
            export_csv,
            renderer_preferences,
            save_renderer_preferences,
            window::get_window_state,
            window::window_action,
            window::resize_mini
        ])
        .setup(move |app| {
            let win = app
                .get_webview_window("main")
                .ok_or("Main window missing")?;
            window::setup(&win)?;
            start_watcher(app.handle().clone(), data.clone());
            start_limits_poller(app.handle().clone(), data.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not start AI Companion");
}

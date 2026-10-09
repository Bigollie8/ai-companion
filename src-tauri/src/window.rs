use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
impl Bounds {
    fn valid(self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|x| x.is_finite())
            && self.width > 0.
            && self.height > 0.
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Controls {
    compact: bool,
    pinned: bool,
    mini_bounds: Option<Bounds>,
    full_bounds: Option<Bounds>,
    full_maximized: bool,
    #[serde(skip)]
    dir: PathBuf,
}
impl Default for Controls {
    fn default() -> Self {
        Self {
            compact: false,
            pinned: true,
            mini_bounds: None,
            full_bounds: None,
            full_maximized: false,
            dir: PathBuf::new(),
        }
    }
}
#[derive(Clone, Serialize)]
pub struct WindowState {
    compact: bool,
    pinned: bool,
}
fn state(c: &Controls) -> WindowState {
    WindowState {
        compact: c.compact,
        pinned: c.compact || c.pinned,
    }
}
fn bounds(w: &WebviewWindow) -> tauri::Result<Bounds> {
    let scale = w.scale_factor()?;
    let pos = w.outer_position()?.to_logical::<f64>(scale);
    let size = w.inner_size()?.to_logical::<f64>(scale);
    Ok(Bounds {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}
fn fit(w: &WebviewWindow, mut b: Bounds) -> tauri::Result<Bounds> {
    let monitors = w.available_monitors()?;
    let monitor = monitors
        .iter()
        .find(|m| {
            let p = m.position().to_logical::<f64>(m.scale_factor());
            let s = m.size().to_logical::<f64>(m.scale_factor());
            b.x >= p.x && b.x < p.x + s.width && b.y >= p.y && b.y < p.y + s.height
        })
        .cloned()
        .or(w.primary_monitor()?);
    if let Some(m) = monitor {
        let area = m.work_area();
        let p = area.position.to_logical::<f64>(m.scale_factor());
        let size = area.size.to_logical::<f64>(m.scale_factor());
        b.width = b.width.min(size.width);
        b.height = b.height.min(size.height);
        b.x = b.x.clamp(p.x, p.x + size.width - b.width);
        b.y = b.y.clamp(p.y, p.y + size.height - b.height);
    }
    Ok(b)
}
fn apply_bounds(w: &WebviewWindow, b: Bounds) -> tauri::Result<()> {
    let b = fit(w, b)?;
    w.set_size(LogicalSize::new(b.width, b.height))?;
    w.set_position(LogicalPosition::new(b.x, b.y))?;
    Ok(())
}
fn persist(c: &Controls) {
    if let Ok(text) = serde_json::to_vec(c) {
        let tmp = c.dir.join("window-state.json.tmp");
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(tmp, c.dir.join("window-state.json"));
        }
    }
    if let Some(b) = c.full_bounds {
        if let Ok(text) = serde_json::to_vec(&b) {
            let _ = fs::write(c.dir.join("dashboard-bounds.json"), text);
        }
    }
}
fn shape(w: &WebviewWindow, compact: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Gdi::{CreateEllipticRgn, DeleteObject, SetWindowRgn};
        let hwnd = w.hwnd().map_err(|e| e.to_string())?;
        let size = w.inner_size().map_err(|e| e.to_string())?;
        unsafe {
            let region = if compact {
                CreateEllipticRgn(0, 0, size.width as i32, size.height as i32)
            } else {
                std::ptr::null_mut()
            };
            if compact && region.is_null() {
                return Err("Could not create circular window region".into());
            }
            if SetWindowRgn(hwnd.0 as _, region, 1) == 0 {
                if !region.is_null() {
                    DeleteObject(region);
                }
                return Err("Could not apply window region".into());
            }
            // Windows owns the region after a successful SetWindowRgn.
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (w, compact);
    }
    Ok(())
}
fn publish(w: &WebviewWindow, c: &Controls) {
    let _ = w.emit("window:state", state(c));
}
fn toggle(w: &WebviewWindow, c: &mut Controls) -> Result<(), String> {
    let result = (|| -> tauri::Result<()> {
        if !c.compact {
            c.full_maximized = w.is_maximized()?;
            if !c.full_maximized {
                c.full_bounds = Some(bounds(w)?)
            }
            w.unmaximize()?;
            let full = c.full_bounds.unwrap_or(bounds(w)?);
            let mini = c.mini_bounds.unwrap_or(Bounds {
                x: full.x + full.width - 340.,
                y: full.y,
                width: 340.,
                height: 340.,
            });
            let size = mini.width.clamp(240., 640.);
            w.set_min_size(Some(LogicalSize::new(240., 240.)))?;
            apply_bounds(
                w,
                Bounds {
                    width: size,
                    height: size,
                    ..mini
                },
            )?;
            w.set_resizable(false)?;
            w.set_maximizable(false)?;
            w.set_always_on_top(true)?;
            c.compact = true;
        } else {
            c.mini_bounds = Some(bounds(w)?);
            w.set_resizable(true)?;
            w.set_maximizable(true)?;
            w.set_min_size(Some(LogicalSize::new(360., 360.)))?;
            if let Some(b) = c.full_bounds {
                apply_bounds(w, b)?
            }
            if c.full_maximized {
                w.maximize()?
            }
            w.set_always_on_top(c.pinned)?;
            c.compact = false;
        }
        Ok(())
    })();
    result.map_err(|e| e.to_string())?;
    shape(w, c.compact)?;
    persist(c);
    publish(w, c);
    Ok(())
}
#[tauri::command]
pub fn get_window_state(c: tauri::State<'_, Mutex<Controls>>) -> Result<WindowState, String> {
    let c = c.lock().map_err(|e| e.to_string())?;
    Ok(state(&c))
}
#[tauri::command]
pub fn window_action(
    w: WebviewWindow,
    c: tauri::State<'_, Mutex<Controls>>,
    action: String,
) -> Result<(), String> {
    let mut c = c.lock().map_err(|e| e.to_string())?;
    match action.as_str() {
        "compact" => return toggle(&w, &mut c),
        "pin" if !c.compact => {
            let pinned = !c.pinned;
            w.set_always_on_top(pinned).map_err(|e| e.to_string())?;
            c.pinned = pinned;
        }
        "minimize" => w.minimize().map_err(|e| e.to_string())?,
        "maximize" => {
            if c.compact {
                return toggle(&w, &mut c);
            }
            if w.is_maximized().map_err(|e| e.to_string())? {
                w.unmaximize()
            } else {
                w.maximize()
            }
            .map_err(|e| e.to_string())?;
        }
        "close" => {
            persist(&c);
            drop(c);
            return w.close().map_err(|e| e.to_string());
        }
        "pin" => {}
        _ => return Err("Unknown window action".into()),
    }
    persist(&c);
    publish(&w, &c);
    Ok(())
}
#[tauri::command]
pub fn resize_mini(
    w: WebviewWindow,
    c: tauri::State<'_, Mutex<Controls>>,
    size: f64,
) -> Result<(), String> {
    if !size.is_finite() {
        return Err("Invalid size".into());
    }
    let mut c = c.lock().map_err(|e| e.to_string())?;
    if !c.compact {
        return Ok(());
    }
    let size = size.round().clamp(240., 640.);
    let b = bounds(&w).map_err(|e| e.to_string())?;
    apply_bounds(
        &w,
        Bounds {
            width: size,
            height: size,
            ..b
        },
    )
    .map_err(|e| e.to_string())?;
    shape(&w, true)?;
    c.mini_bounds = Some(bounds(&w).map_err(|e| e.to_string())?);
    persist(&c);
    Ok(())
}
pub fn setup(w: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let dir = dirs::config_dir()
        .ok_or("No application data directory")?
        .join("ai-companion");
    fs::create_dir_all(&dir)?;
    let legacy = dirs::config_dir()
        .unwrap()
        .join("claude-productivity-monitor/window-state.json");
    if !dir.join("window-state.json").exists() && legacy.exists() {
        let _ = fs::copy(legacy, dir.join("window-state.json"));
    }
    let mut c: Controls = fs::read(dir.join("window-state.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    c.dir = dir.clone();
    c.mini_bounds = c.mini_bounds.filter(|b| b.valid());
    c.full_bounds = c.full_bounds.filter(|b| b.valid());
    let saved: Option<Bounds> = fs::read(dir.join("dashboard-bounds.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok());
    let full = c
        .full_bounds
        .or(saved.filter(|b| b.valid()))
        .unwrap_or(Bounds {
            x: 100.,
            y: 50.,
            width: 1140.,
            height: 900.,
        });
    apply_bounds(
        w,
        Bounds {
            width: full.width.max(360.),
            height: full.height.max(360.),
            ..full
        },
    )?;
    c.full_bounds = Some(bounds(w)?);
    w.set_always_on_top(c.pinned)?;
    let compact = c.compact;
    c.compact = false;
    if compact {
        toggle(w, &mut c).map_err(std::io::Error::other)?
    }
    w.app_handle().manage(Mutex::new(c));
    let handle = w.clone();
    w.on_window_event(move |event| {
        let state = handle.state::<Mutex<Controls>>();
        // Window setters may dispatch resize/move events synchronously.
        if let Ok(mut c) = state.try_lock() {
            if matches!(
                event,
                tauri::WindowEvent::Moved(_)
                    | tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::CloseRequested { .. }
            ) && !handle.is_minimized().unwrap_or(true)
            {
                if c.compact {
                    c.mini_bounds = bounds(&handle).ok();
                    let _ = shape(&handle, true);
                } else if !handle.is_maximized().unwrap_or(true) {
                    c.full_bounds = bounds(&handle).ok();
                }
                persist(&c);
            }
            if matches!(event, tauri::WindowEvent::Focused(true)) {
                let _ = handle.set_always_on_top(c.compact || c.pinned);
            }
        };
    });
    // Windows may clear the topmost flag after shell, display or sleep changes.
    // Never hold the controls mutex while querying the UI thread from this worker.
    let pin_window = w.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(3));
        let wanted = {
            let controls = pin_window.state::<Mutex<Controls>>();
            let Ok(c) = controls.try_lock() else { continue };
            c.compact || c.pinned
        };
        match pin_window.is_visible() {
            Ok(true) if wanted && !pin_window.is_minimized().unwrap_or(true) => {
                if !pin_window.is_always_on_top().unwrap_or(true) {
                    let _ = pin_window.set_always_on_top(true);
                }
            }
            Err(_) => break,
            _ => {}
        }
    });
    w.show()?;
    Ok(())
}

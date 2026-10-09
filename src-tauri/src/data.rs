use crate::{limits, model::*, parser};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};
use walkdir::WalkDir;

pub type Metadata = HashMap<String, (i64, String)>;
pub struct Sources {
    pub home: PathBuf,
    pub codex: PathBuf,
}
impl Sources {
    pub fn local() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        let codex = std::env::var_os("CODEX_HOME")
            .filter(|x| !x.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".codex"));
        Self { home, codex }
    }
    pub fn claude(&self) -> PathBuf {
        self.home.join(".claude")
    }
    pub fn desktop_roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![self
            .home
            .join("AppData/Roaming/Claude/claude-code-sessions")];
        if let Ok(entries) = fs::read_dir(self.home.join("AppData/Local/Packages")) {
            for e in entries.flatten() {
                if e.file_name().to_string_lossy().starts_with("Claude_") {
                    roots.push(
                        e.path()
                            .join("LocalCache/Roaming/Claude/claude-code-sessions"),
                    );
                }
            }
        }
        roots.into_iter().filter(|p| p.is_dir()).collect()
    }
}
pub fn files(root: &Path, extension: &str, depth: usize) -> Vec<PathBuf> {
    let mut files: Vec<_> = WalkDir::new(root)
        .max_depth(depth)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && e.path().extension().is_some_and(|x| x == extension))
        .map(|e| e.into_path())
        .collect();
    files.sort();
    files
}
fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}
#[derive(Clone)]
struct Cached {
    len: u64,
    modified: Option<SystemTime>,
    session: Option<Session>,
    limits: Option<Value>,
}
/// Latest allowance snapshot per provider; the newest observation wins.
#[derive(Clone, Debug, Default)]
pub struct Limits {
    pub claude: Option<Value>,
    pub codex: Option<Value>,
}
#[derive(Default)]
pub struct Reader {
    cache: HashMap<PathBuf, Cached>,
    /// Newest live snapshot from the Claude usage endpoint, set by the poller.
    pub claude_live: Option<Value>,
}
impl Reader {
    pub fn read(
        &mut self,
        sources: &Sources,
    ) -> (
        Vec<Session>,
        Vec<Session>,
        Metadata,
        Limits,
        Option<Value>,
    ) {
        let mut seen = HashSet::new();
        let mut claude = vec![];
        let mut codex: BTreeMap<String, Session> = BTreeMap::new();
        let mut limits = Limits::default();
        for (root, provider, archived, depth) in [
            (sources.claude().join("projects"), "claude", false, 2),
            (sources.codex.join("sessions"), "codex", false, usize::MAX),
            (
                sources.codex.join("archived_sessions"),
                "codex",
                true,
                usize::MAX,
            ),
        ] {
            for path in files(&root, "jsonl", depth) {
                seen.insert(path.clone());
                let Ok(meta) = fs::metadata(&path) else {
                    continue;
                };
                let modified = meta.modified().ok();
                if self
                    .cache
                    .get(&path)
                    .is_none_or(|c| c.len != meta.len() || c.modified != modified)
                {
                    let Ok(text) = fs::read_to_string(&path) else {
                        continue;
                    };
                    let fallback = path
                        .file_stem()
                        .and_then(|x| x.to_str())
                        .unwrap_or("unknown");
                    let (session, limits) = if provider == "codex" {
                        parser::codex(&text, fallback)
                    } else {
                        parser::claude(&text, fallback)
                    };
                    self.cache.insert(
                        path.clone(),
                        Cached {
                            len: meta.len(),
                            modified,
                            session,
                            limits,
                        },
                    );
                }
                let Some(entry) = self.cache.get(&path) else {
                    continue;
                };
                if let Some(mut session) = entry.session.clone() {
                    if archived {
                        session.attention = None
                    }
                    if provider == "claude" {
                        claude.push(session)
                    } else if codex
                        .get(&session.session_id)
                        .is_none_or(|old| session.messages.len() > old.messages.len())
                    {
                        codex.insert(session.session_id.clone(), session);
                    }
                }
                if let Some(l) = &entry.limits {
                    let slot = if provider == "claude" {
                        &mut limits.claude
                    } else {
                        &mut limits.codex
                    };
                    *slot = limits::newest(slot.take(), Some(l.clone()));
                }
            }
        }
        self.cache.retain(|path, _| seen.contains(path));
        let mut metadata = Metadata::new();
        for path in files(&sources.claude().join("sessions"), "json", 1) {
            if let Some(v) = read_json(&path) {
                if !s(&v["sessionId"]).is_empty() {
                    metadata.insert(
                        s(&v["sessionId"]).into(),
                        (
                            timestamp(&v["startedAt"]).unwrap_or(0),
                            s(&v["entrypoint"]).into(),
                        ),
                    );
                }
            }
        }
        let mut history: BTreeMap<String, (String, Vec<i64>)> = BTreeMap::new();
        if let Ok(text) = fs::read_to_string(sources.claude().join("history.jsonl")) {
            for v in parser::records(&text) {
                let (Some(id), Some(time)) = (v["sessionId"].as_str(), v["timestamp"].as_i64())
                else {
                    continue;
                };
                if time <= 0 {
                    continue;
                }
                history
                    .entry(id.into())
                    .or_insert_with(|| (s(&v["project"]).into(), vec![]))
                    .1
                    .push(time);
            }
        }
        let mut ids: HashSet<_> = claude.iter().map(|x| x.session_id.clone()).collect();
        for (id, (path, mut times)) in history {
            times.sort();
            metadata
                .entry(id.clone())
                .or_insert((times[0], "unknown".into()));
            if ids.insert(id.clone()) {
                claude.push(historical(&id, &path, times, "history"))
            }
        }
        for root in sources.desktop_roots() {
            for path in files(&root, "json", usize::MAX) {
                if !path
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with("local_"))
                {
                    continue;
                }
                let Some(v) = read_json(&path) else { continue };
                let Some(start) = timestamp(&v["createdAt"]).filter(|t| *t > 0) else {
                    continue;
                };
                let end = timestamp(&v["lastActivityAt"]).unwrap_or(start).max(start);
                let id = if !s(&v["cliSessionId"]).is_empty() {
                    s(&v["cliSessionId"]).to_owned()
                } else if !s(&v["sessionId"]).is_empty() {
                    format!("desktop:{}", s(&v["sessionId"]))
                } else {
                    continue;
                };
                let cwd = v["originCwd"]
                    .as_str()
                    .or_else(|| v["cwd"].as_str())
                    .unwrap_or("");
                if ids.insert(id.clone()) {
                    claude.push(historical(
                        &id,
                        cwd,
                        if start == end {
                            vec![start]
                        } else {
                            vec![start, end]
                        },
                        "desktop",
                    ))
                }
            }
        }
        limits.claude = limits::newest(limits.claude.take(), self.claude_live.clone());
        let archive =
            read_json(&sources.claude().join("stats-cache.json")).and_then(|v| archive(&v));
        (
            claude,
            codex.into_values().collect(),
            metadata,
            limits,
            archive,
        )
    }
}
fn historical(id: &str, path: &str, times: Vec<i64>, source: &str) -> Session {
    let mut session = Session::new("claude", id);
    session.project_path = path.into();
    session.project_name = parser::project_name(path, true);
    session.data_quality = "history-only".into();
    session.history_source = Some(source.into());
    session.cost_known = false;
    session.primary_model = "Not recorded".into();
    session.entrypoint = format!("claude-{source}");
    for time in times {
        session.push(Message::new(
            if source == "desktop" {
                "activity"
            } else {
                "user"
            },
            time,
        ))
    }
    session
}
pub fn archive(v: &Value) -> Option<Value> {
    let start = timestamp(&v["firstSessionDate"])?;
    let date = s(&v["lastComputedDate"]);
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let mut total = Tokens::default();
    let mut models = vec![];
    if let Some(usage) = v["modelUsage"].as_object() {
        for (model, u) in usage {
            let tokens = Tokens {
                input_tokens: n(&u["inputTokens"]),
                output_tokens: n(&u["outputTokens"]),
                cache_read_tokens: n(&u["cacheReadInputTokens"]),
                cache_creation_tokens: n(&u["cacheCreationInputTokens"]),
            };
            total.add(tokens);
            models.push(json!({"model":model,"tokenUsage":tokens}));
        }
    }
    let daily:Vec<_>=v["dailyActivity"].as_array().into_iter().flatten().filter(|d|chrono::NaiveDate::parse_from_str(s(&d["date"]),"%Y-%m-%d").is_ok())
        .map(|d|json!({"date":d["date"],"sessionCount":n(&d["sessionCount"]),"messageCount":n(&d["messageCount"])})).collect();
    Some(
        json!({"firstSessionAt":start,"throughDate":date,"sessionCount":n(&v["totalSessions"]),"messageCount":n(&v["totalMessages"]),"tokenUsage":total,"models":models,"dailyActivity":daily}),
    )
}

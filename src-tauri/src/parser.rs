use crate::{model::*, pricing};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

pub fn records(text: &str) -> Vec<Value> {
    text.lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(Value::is_object)
        .collect()
}

pub fn attention(records: &[Value], provider: &str) -> Option<Value> {
    let mut active = false;
    let mut pending: BTreeMap<String, (Value, bool)> = BTreeMap::new();
    fn request(
        pending: &mut BTreeMap<String, (Value, bool)>,
        active: bool,
        id: &Value,
        name: &Value,
        time: i64,
    ) {
        let (Some(id), Some(name)) = (id.as_str(), name.as_str()) else {
            return;
        };
        if !active {
            return;
        }
        let tool = name
            .rsplit('.')
            .next()
            .unwrap_or(name)
            .rsplit("__")
            .next()
            .unwrap_or(name);
        if [
            "request_user_input",
            "request_user_input_async",
            "AskUserQuestion",
            "ExitPlanMode",
        ]
        .contains(&tool)
        {
            pending.insert(id.into(),(json!({"requestId":id,"requestedAt":time,"kind":if tool=="ExitPlanMode" {"approval"} else {"question"}}),tool=="request_user_input_async"));
        }
    }
    for r in records {
        let Some(time) = timestamp(&r["timestamp"]) else {
            continue;
        };
        let p = &r["payload"];
        let kind = s(&r["type"]);
        if provider == "codex" {
            if kind == "session_meta" && p["source"].is_object() {
                return None;
            }
            if kind == "event_msg" {
                if ["task_started", "user_message"].contains(&s(&p["type"])) {
                    pending.clear();
                    active = true;
                }
                if [
                    "task_complete",
                    "turn_aborted",
                    "task_aborted",
                    "session_end",
                ]
                .contains(&s(&p["type"]))
                {
                    pending.clear();
                    active = false;
                }
            }
            if kind != "response_item" {
                continue;
            }
            if p["type"] == "message" && p["role"] == "user" {
                pending.clear();
                active = true;
            }
            if p["type"] == "message" && p["role"] == "assistant" && p["phase"] == "final" {
                pending.clear();
                active = false;
            }
            if ["function_call", "custom_tool_call"].contains(&s(&p["type"])) {
                request(&mut pending, active, &p["call_id"], &p["name"], time)
            }
            if ["function_call_output", "custom_tool_call_output"].contains(&s(&p["type"]))
                && !pending.get(s(&p["call_id"])).is_some_and(|x| x.1)
            {
                pending.remove(s(&p["call_id"]));
            }
        } else {
            if r["isSidechain"] == true {
                return None;
            }
            let content = r["message"]["content"].as_array();
            if kind == "user" {
                if content.is_some_and(|c| c.iter().any(|b| b["type"] == "tool_result")) {
                    for b in content.unwrap() {
                        if b["type"] == "tool_result" {
                            pending.remove(s(&b["tool_use_id"]));
                        }
                    }
                } else {
                    pending.clear();
                    active = true;
                }
            }
            if kind == "assistant" {
                if let Some(content) = content {
                    for b in content {
                        if b["type"] == "tool_use" {
                            request(&mut pending, active, &b["id"], &b["name"], time)
                        }
                    }
                    if r["message"]["stop_reason"] == "end_turn" {
                        pending.clear();
                        active = false;
                    }
                }
            }
            if kind == "system"
                && ["turn_duration", "interrupt", "session_end"].contains(&s(&r["subtype"]))
            {
                pending.clear();
                active = false;
            }
        }
    }
    pending
        .into_values()
        .max_by_key(|x| x.0["requestedAt"].as_i64().unwrap_or(0))
        .map(|x| x.0)
}
pub fn normalize_codex(raw: &Value) -> Tokens {
    let input = n(&raw["input_tokens"]);
    let read = n(&raw["cached_input_tokens"]).min(input);
    let write = n(&raw["cache_write_input_tokens"]).min(input - read);
    Tokens {
        input_tokens: input - read - write,
        output_tokens: n(&raw["output_tokens"]),
        cache_read_tokens: read,
        cache_creation_tokens: write,
    }
}
fn limit(raw: &Value) -> Value {
    if !raw["used_percent"].is_number() || !raw["window_minutes"].is_number() {
        return Value::Null;
    }
    json!({"usedPercent":n(&raw["used_percent"]).min(100.),"windowMinutes":n(&raw["window_minutes"]),"resetsAt":raw["resets_at"].as_f64().map(|t|t*1000.)})
}
fn primary(models: &[(String, usize)], fallback: &str) -> String {
    let mut name = fallback.to_owned();
    let mut count = 0;
    for (m, n) in models {
        if *n > count {
            count = *n;
            name = m.clone();
        }
    }
    name
}
fn add_model(models: &mut Vec<(String, usize)>, model: &str) {
    if let Some((_, n)) = models.iter_mut().find(|(m, _)| m == model) {
        *n += 1
    } else {
        models.push((model.into(), 1))
    }
}
pub fn project_name(path: &str, claude: bool) -> String {
    if path.is_empty() {
        return "Unknown".into();
    }
    let parts: Vec<_> = path
        .split(['\\', '/'])
        .filter(|p| !p.is_empty() && (!claude || !["Users", "Documents", "Github"].contains(p)))
        .collect();
    if parts.is_empty() {
        return "Home".into();
    }
    parts[parts.len().saturating_sub(2)..].join("/")
}
pub fn codex(text: &str, fallback: &str) -> (Option<Session>, Option<Value>) {
    let rows = records(text);
    let mut session = Session::new("codex", &format!("codex:{fallback}"));
    session.entrypoint = "codex".into();
    let mut limits: Option<Value> = None;
    let mut model = "unknown".to_owned();
    let mut context_window = 0.;
    let mut previous = Tokens::default();
    let mut previous_total = 0.;
    let mut models = vec![];
    let mut seen = HashSet::new();
    let counts = rows.iter().any(|r| {
        r["type"] == "event_msg"
            && r["payload"]["type"] == "token_count"
            && r["payload"]["info"]["total_token_usage"].is_object()
    });
    let user_events = rows
        .iter()
        .any(|r| r["type"] == "event_msg" && r["payload"]["type"] == "user_message");
    for r in &rows {
        let p = &r["payload"];
        let kind = s(&r["type"]);
        if kind == "session_meta" {
            let id = s(&p["id"]);
            let id = if id.is_empty() {
                s(&p["session_id"])
            } else {
                id
            };
            session.session_id = format!("codex:{}", if id.is_empty() { fallback } else { id });
            if !s(&p["cwd"]).is_empty() {
                session.project_path = s(&p["cwd"]).into()
            }
            session.entrypoint = p["source"]
                .as_str()
                .map(|x| format!("codex-{x}"))
                .unwrap_or("codex-agent".into());
            session.git_branch = s(&p["git"]["branch"]).into();
            context_window = n(&p["context_window"]);
        }
        if kind == "turn_context" {
            if !s(&p["model"]).is_empty() {
                model = s(&p["model"]).into()
            }
            if session.project_path.is_empty() {
                session.project_path = s(&p["cwd"]).into()
            }
        }
        let Some(time) = timestamp(&r["timestamp"]) else {
            continue;
        };
        if kind == "compacted" || (kind == "event_msg" && p["type"] == "context_compacted") {
            session.auto_compactions += 1
        }
        if (user_events && kind == "event_msg" && p["type"] == "user_message")
            || (!user_events
                && kind == "response_item"
                && p["type"] == "message"
                && p["role"] == "user")
        {
            session.push(Message::new("user", time));
        }
        if kind == "event_msg"
            && p["type"] == "token_count"
            && p["rate_limits"].is_object()
            && (s(&p["rate_limits"]["limit_id"]).is_empty()
                || p["rate_limits"]["limit_id"] == "codex")
            && limits
                .as_ref()
                .is_none_or(|l| time >= l["observedAt"].as_i64().unwrap_or(0))
        {
            limits = Some(
                json!({"observedAt":time,"primary":limit(&p["rate_limits"]["primary"]),"secondary":limit(&p["rate_limits"]["secondary"])}),
            );
        }
        let (usage, context) = if counts
            && kind == "event_msg"
            && p["type"] == "token_count"
            && p["info"]["total_token_usage"].is_object()
        {
            let raw = &p["info"]["total_token_usage"];
            let next = normalize_codex(raw);
            let total = n(&raw["input_tokens"]) + n(&raw["output_tokens"]);
            if total <= previous_total {
                continue;
            }
            let usage = next.delta(previous);
            previous = next;
            previous_total = total;
            if n(&p["info"]["model_context_window"]) > 0. {
                context_window = n(&p["info"]["model_context_window"])
            }
            (usage, n(&p["info"]["last_token_usage"]["input_tokens"]))
        } else if !counts && kind == "token_usage_record" && p["usage"].is_object() {
            let id = s(&p["response_id"]);
            if !id.is_empty() && !seen.insert(id.to_owned()) {
                continue;
            }
            (normalize_codex(&p["usage"]), n(&p["usage"]["input_tokens"]))
        } else {
            continue;
        };
        session.cost_known &= pricing::rates(&model).is_some();
        let mut msg = Message::new("assistant", time);
        msg.token_usage = Some(usage);
        msg.cost = pricing::cost(&model, usage);
        msg.cache_savings = pricing::savings(&model, usage);
        if context_window > 0. {
            msg.context_tokens = Some(context);
            msg.context_pct = Some(context / context_window * 100.);
        }
        session.push(msg);
        add_model(&mut models, &model);
    }
    session.project_name = project_name(&session.project_path, false);
    session.primary_model = primary(&models, &model);
    session.messages.sort_by_key(|m| m.timestamp);
    session.attention = attention(&rows, "codex");
    (
        if session.messages.is_empty() {
            None
        } else {
            Some(session)
        },
        limits,
    )
}
pub fn claude(text: &str, fallback: &str) -> (Option<Session>, Option<Value>) {
    let rows = records(text);
    let limits = crate::limits::from_transcript(&rows);
    let mut latest = HashMap::new();
    for (i, r) in rows.iter().enumerate() {
        if r["type"] == "assistant"
            && r["message"]["usage"].is_object()
            && !s(&r["message"]["id"]).is_empty()
        {
            latest.insert(s(&r["message"]["id"]), i);
        }
    }
    let mut session = Session::new("claude", "");
    let mut models = vec![];
    for (i, r) in rows.iter().enumerate() {
        if session.project_path.is_empty() {
            session.project_path = s(&r["cwd"]).into()
        }
        if session.entrypoint.is_empty() {
            session.entrypoint = s(&r["entrypoint"]).into()
        }
        if session.session_id.is_empty() {
            session.session_id = s(&r["sessionId"]).into()
        }
        if session.git_branch.is_empty() && r["gitBranch"] != "HEAD" {
            session.git_branch = s(&r["gitBranch"]).into()
        }
        if session.slug.is_empty() {
            session.slug = s(&r["slug"]).into()
        }
        if r["type"] == "system"
            && r["subtype"] == "compact_boundary"
            && r["compactMetadata"]["trigger"] == "auto"
        {
            session.auto_compactions += 1
        }
        let Some(time) = timestamp(&r["timestamp"]) else {
            continue;
        };
        if r["type"] == "assistant" && r["message"]["usage"].is_object() {
            let id = s(&r["message"]["id"]);
            if !id.is_empty() && latest.get(id) != Some(&i) {
                continue;
            }
            let raw = &r["message"]["usage"];
            let model = r["message"]["model"].as_str().unwrap_or("unknown");
            let usage = Tokens {
                input_tokens: n(&raw["input_tokens"]),
                output_tokens: n(&raw["output_tokens"]),
                cache_creation_tokens: n(&raw["cache_creation_input_tokens"]),
                cache_read_tokens: n(&raw["cache_read_input_tokens"]),
            };
            if usage.total() > 0. && pricing::rates(model).is_none() {
                session.cost_known = false
            }
            let mut msg = Message::new("assistant", time);
            msg.token_usage = Some(usage);
            msg.cost = pricing::cost(model, usage);
            msg.cache_savings = pricing::savings(model, usage);
            msg.web_searches = n(&raw["server_tool_use"]["web_search_requests"]);
            msg.web_fetches = n(&raw["server_tool_use"]["web_fetch_requests"]);
            let context =
                usage.input_tokens + usage.cache_creation_tokens + usage.cache_read_tokens;
            msg.context_tokens = Some(context);
            msg.context_pct = Some(context / 200000. * 100.);
            session.push(msg);
            add_model(&mut models, model);
        } else if r["type"] == "user" {
            session.push(Message::new("user", time))
        }
    }
    if session.messages.is_empty() {
        return (None, limits);
    }
    if session.session_id.is_empty() {
        session.session_id = fallback.into()
    }
    if session.git_branch.is_empty() {
        session.git_branch = "main".into()
    }
    session.project_name = project_name(&session.project_path, true);
    session.primary_model = primary(&models, "unknown");
    session.messages.sort_by_key(|m| m.timestamp);
    session.attention = attention(&rows, "claude");
    (Some(session), limits)
}

//! Claude account allowance: the live usage endpoint Claude Code's `/usage` reads,
//! plus a transcript fallback built from recorded rate-limit notices.
use crate::model::{n, timestamp};
use serde_json::{json, Value};
use std::{path::Path, time::Duration};

pub const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const FIVE_HOURS: f64 = 300.;
const SEVEN_DAYS: f64 = 10080.;

fn reset(raw: &Value) -> Value {
    if let Some(seconds) = raw.as_f64() {
        return json!((seconds * 1000.) as i64);
    }
    timestamp(raw).map(Value::from).unwrap_or(Value::Null)
}
fn window(raw: &Value, minutes: f64) -> Value {
    if !raw["utilization"].is_number() {
        return Value::Null;
    }
    json!({"usedPercent":n(&raw["utilization"]).min(100.),"windowMinutes":minutes,"resetsAt":reset(&raw["resets_at"])})
}
/// Normalize the usage endpoint body into the dashboard's limit snapshot shape.
pub fn from_usage(body: &Value, observed_at: i64) -> Option<Value> {
    let primary = window(&body["five_hour"], FIVE_HOURS);
    let secondary = window(&body["seven_day"], SEVEN_DAYS);
    if primary.is_null() && secondary.is_null() {
        return None;
    }
    Some(json!({"observedAt":observed_at,"source":"live","primary":primary,"secondary":secondary}))
}
/// The newest rate-limit rejection recorded in a Claude transcript, as a 100% snapshot.
pub fn from_transcript(records: &[Value]) -> Option<Value> {
    let mut latest: Option<Value> = None;
    for r in records {
        let quota = &r["quotaLimits"];
        if quota["status"] != "rejected" {
            continue;
        }
        let Some(time) = timestamp(&r["timestamp"]) else {
            continue;
        };
        if latest
            .as_ref()
            .is_some_and(|l| l["observedAt"].as_i64().unwrap_or(0) > time)
        {
            continue;
        }
        let minutes = if quota["rateLimitType"]
            .as_str()
            .is_some_and(|t| t.starts_with("seven_day"))
        {
            SEVEN_DAYS
        } else {
            FIVE_HOURS
        };
        latest = Some(json!({"observedAt":time,"source":"transcript",
            "primary":{"usedPercent":100.,"windowMinutes":minutes,"resetsAt":reset(&quota["resetsAt"])},
            "secondary":Value::Null}));
    }
    latest
}
/// Keep whichever snapshot was observed most recently.
pub fn newest(a: Option<Value>, b: Option<Value>) -> Option<Value> {
    match (a, b) {
        (Some(a), Some(b)) => Some(if n(&b["observedAt"]) > n(&a["observedAt"]) {
            b
        } else {
            a
        }),
        (a, b) => a.or(b),
    }
}
pub struct Credentials {
    pub token: String,
    pub expires_at: i64,
}
/// Read Claude Code's OAuth access token. The refresh token is never loaded.
pub fn credentials(claude_dir: &Path) -> Option<Credentials> {
    let text = std::fs::read_to_string(claude_dir.join(".credentials.json")).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    let oauth = &value["claudeAiOauth"];
    let token = oauth["accessToken"].as_str().filter(|t| !t.is_empty())?;
    Some(Credentials {
        token: token.to_owned(),
        expires_at: oauth["expiresAt"].as_i64().unwrap_or(0),
    })
}
/// Live polling is on unless the renderer preference says `off`.
pub fn polling_enabled(config_dir: &Path) -> bool {
    std::fs::read_to_string(config_dir.join("renderer-preferences.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .is_none_or(|v| v["claude-limits"] != "off")
}
pub fn fetch_from(url: &str, token: &str) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(15))
        .build();
    let response = agent
        .get(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("anthropic-beta", "oauth-2025-04-20")
        .set("Accept", "application/json")
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("HTTP {code}"),
            other => other.to_string(),
        })?;
    response.into_json::<Value>().map_err(|e| e.to_string())
}
pub fn fetch(token: &str) -> Result<Value, String> {
    fetch_from(USAGE_URL, token)
}

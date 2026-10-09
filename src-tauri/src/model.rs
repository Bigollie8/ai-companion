use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub input_tokens: f64,
    pub output_tokens: f64,
    pub cache_creation_tokens: f64,
    pub cache_read_tokens: f64,
}
impl Tokens {
    pub fn add(&mut self, b: Self) {
        self.input_tokens += b.input_tokens;
        self.output_tokens += b.output_tokens;
        self.cache_creation_tokens += b.cache_creation_tokens;
        self.cache_read_tokens += b.cache_read_tokens;
    }
    pub fn delta(self, b: Self) -> Self {
        Self {
            input_tokens: (self.input_tokens - b.input_tokens).max(0.),
            output_tokens: (self.output_tokens - b.output_tokens).max(0.),
            cache_creation_tokens: (self.cache_creation_tokens - b.cache_creation_tokens).max(0.),
            cache_read_tokens: (self.cache_read_tokens - b.cache_read_tokens).max(0.),
        }
    }
    pub fn total(self) -> f64 {
        self.input_tokens + self.output_tokens + self.cache_creation_tokens + self.cache_read_tokens
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    #[serde(rename = "type")]
    pub kind: String,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<Tokens>,
    pub cost: f64,
    pub cache_savings: f64,
    pub web_searches: f64,
    pub web_fetches: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_pct: Option<f64>,
}
impl Message {
    pub fn new(kind: &str, timestamp: i64) -> Self {
        Self {
            kind: kind.into(),
            timestamp,
            token_usage: None,
            cost: 0.,
            cache_savings: 0.,
            web_searches: 0.,
            web_fetches: 0.,
            context_tokens: None,
            context_pct: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub provider: String,
    pub cost_known: bool,
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub entrypoint: String,
    pub git_branch: String,
    pub slug: String,
    pub messages: Vec<Message>,
    pub total_tokens: Tokens,
    pub total_cost: f64,
    pub total_cache_savings: f64,
    pub total_web_searches: f64,
    pub total_web_fetches: f64,
    pub primary_model: String,
    pub auto_compactions: u32,
    pub attention: Option<Value>,
    pub data_quality: String,
    pub history_source: Option<String>,
}
impl Session {
    pub fn new(provider: &str, id: &str) -> Self {
        Self {
            provider: provider.into(),
            cost_known: true,
            session_id: id.into(),
            project_path: String::new(),
            project_name: "Unknown".into(),
            entrypoint: String::new(),
            git_branch: String::new(),
            slug: String::new(),
            messages: vec![],
            total_tokens: Tokens::default(),
            total_cost: 0.,
            total_cache_savings: 0.,
            total_web_searches: 0.,
            total_web_fetches: 0.,
            primary_model: "unknown".into(),
            auto_compactions: 0,
            attention: None,
            data_quality: "full".into(),
            history_source: None,
        }
    }
    pub fn push(&mut self, m: Message) {
        if let Some(t) = m.token_usage {
            self.total_tokens.add(t)
        }
        self.total_cost += m.cost;
        self.total_cache_savings += m.cache_savings;
        self.total_web_searches += m.web_searches;
        self.total_web_fetches += m.web_fetches;
        self.messages.push(m);
    }
}
pub fn s(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
pub fn n(v: &Value) -> f64 {
    v.as_f64().filter(|n| n.is_finite()).unwrap_or(0.).max(0.)
}
pub fn timestamp(v: &Value) -> Option<i64> {
    if let Some(n) = v.as_i64() {
        return Some(n);
    }
    let text = v.as_str()?;
    if let Ok(t) = chrono::DateTime::parse_from_rfc3339(text) {
        return Some(t.timestamp_millis());
    }
    use chrono::TimeZone;
    chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S%.f")
        .ok()
        .and_then(|d| chrono::Local.from_local_datetime(&d).earliest())
        .map(|d| d.timestamp_millis())
}

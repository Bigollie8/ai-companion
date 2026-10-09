use crate::{
    data::{Metadata, Reader, Sources},
    model::*,
};
use chrono::{Datelike, Duration, Local, TimeZone};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn day(time: i64) -> String {
    Local
        .timestamp_millis_opt(time)
        .single()
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}
fn summary(p: &Session, meta: &Metadata) -> Value {
    let first = p.messages.first().unwrap().timestamp;
    let last = p.messages.last().unwrap().timestamp;
    let (start, entry) = meta
        .get(&p.session_id)
        .map(|(t, e)| (if *t == 0 { first } else { *t }, e.as_str()))
        .unwrap_or((first, "unknown"));
    let active = if p.data_quality == "history-only" {
        0
    } else {
        p.messages
            .windows(2)
            .map(|m| (m[1].timestamp - m[0].timestamp).clamp(0, 300000))
            .sum::<i64>()
    };
    let points:Vec<_>=p.messages.iter().filter(|m|m.kind=="assistant").filter_map(|m|Some(json!({"timestamp":m.timestamp,"contextTokens":m.context_tokens?,"contextPct":m.context_pct?}))).collect();
    let peak = points
        .iter()
        .map(|p| n(&p["contextTokens"]))
        .fold(0., f64::max);
    let peak_pct = points
        .iter()
        .map(|p| n(&p["contextPct"]))
        .fold(0., f64::max);
    let avg = if points.is_empty() {
        0.
    } else {
        points.iter().map(|p| n(&p["contextPct"])).sum::<f64>() / points.len() as f64
    };
    let score = if points.is_empty() {
        100
    } else {
        (100 - p.auto_compactions as i64 * 15
            - if peak_pct > 80. { 20 } else { 0 }
            - if avg > 50. { 10 } else { 0 })
        .clamp(0, 100)
    };
    let mut v = json!({"dataQuality":p.data_quality,"provider":p.provider,"costKnown":p.cost_known,"sessionId":p.session_id,"projectName":p.project_name,"projectPath":p.project_path,
        "startedAt":start,"lastMessageAt":last,"durationMs":last-start,"activeTimeMs":active,"messageCount":p.messages.iter().filter(|m|m.kind!="activity").count(),
        "userMessageCount":p.messages.iter().filter(|m|m.kind=="user").count(),"assistantMessageCount":p.messages.iter().filter(|m|m.kind=="assistant").count(),
        "model":p.primary_model,"tokenUsage":p.total_tokens,"estimatedCost":p.total_cost,"cacheSavings":p.total_cache_savings,"entrypoint":if p.entrypoint.is_empty() {entry} else {&p.entrypoint},
        "gitBranch":p.git_branch,"slug":p.slug,"webSearches":p.total_web_searches,"webFetches":p.total_web_fetches,"peakContextTokens":peak,"peakContextPct":peak_pct,
        "avgContextPct":avg,"autoCompactions":p.auto_compactions,"contextEfficiencyScore":score,"contextPoints":points});
    if let Some(a) = &p.attention {
        v["attention"] = a.clone()
    }
    if let Some(h) = &p.history_source {
        v["historySource"] = json!(h)
    }
    v
}
#[derive(Default)]
struct Daily {
    tokens: Tokens,
    cost: f64,
    savings: f64,
    sessions: BTreeSet<String>,
    messages: u64,
    projects: BTreeSet<String>,
    searches: f64,
    fetches: f64,
    has_tokens: bool,
    history: BTreeSet<String>,
}
pub fn snapshot(parsed: &[Session], meta: &Metadata, now: i64) -> Value {
    let mut sessions: Vec<Value> = parsed
        .iter()
        .filter(|p| !p.messages.is_empty())
        .map(|p| summary(p, meta))
        .collect();
    sessions.sort_by(|a, b| n(&b["startedAt"]).total_cmp(&n(&a["startedAt"])));
    let mut groups: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for s in &sessions {
        let path = s["projectPath"]
            .as_str()
            .filter(|p| !p.is_empty())
            .unwrap_or(crate::model::s(&s["projectName"]));
        groups.entry(path.into()).or_default().push(s.clone());
    }
    let mut projects = vec![];
    for items in groups.into_values() {
        let mut tokens = Tokens::default();
        let mut branches = vec![];
        for s in &items {
            tokens.add(serde_json::from_value(s["tokenUsage"].clone()).unwrap_or_default());
            let branch = crate::model::s(&s["gitBranch"]);
            if !branch.is_empty()
                && !["main", "master"].contains(&branch)
                && !branches.contains(&branch)
                && branches.len() < 10
            {
                branches.push(branch)
            }
        }
        let sum = |key: &str| items.iter().map(|s| n(&s[key])).sum::<f64>();
        projects.push(json!({"historyOnlySessions":items.iter().filter(|s|s["dataQuality"]=="history-only").count(),"projectName":items[0]["projectName"],"projectPath":items[0]["projectPath"],
            "sessionCount":items.len(),"totalDurationMs":sum("durationMs"),"totalActiveTimeMs":sum("activeTimeMs"),"totalTokens":tokens,"totalCost":sum("estimatedCost"),"totalMessages":sum("messageCount"),"branches":branches,"sessions":items}));
    }
    projects.sort_by(|a, b| n(&b["totalCost"]).total_cmp(&n(&a["totalCost"])));
    let mut days: BTreeMap<String, Daily> = BTreeMap::new();
    for p in parsed {
        for m in &p.messages {
            let d = days.entry(day(m.timestamp)).or_default();
            if let Some(t) = m.token_usage {
                d.tokens.add(t);
                d.has_tokens = true
            }
            if p.data_quality == "history-only" {
                d.history.insert(p.session_id.clone());
            }
            d.cost += m.cost;
            d.savings += m.cache_savings;
            d.sessions.insert(p.session_id.clone());
            if m.kind != "activity" {
                d.messages += 1
            }
            d.projects.insert(p.project_name.clone());
            d.searches += m.web_searches;
            d.fetches += m.web_fetches;
        }
    }
    let daily:Vec<_>=days.iter().map(|(date,d)|json!({"date":date,"hasTokenData":d.has_tokens,"historyOnlySessionCount":d.history.len(),"tokenUsage":d.tokens,"cost":d.cost,"cacheSavings":d.savings,"sessionCount":d.sessions.len(),"messageCount":d.messages,"activeProjects":d.projects,"webSearches":d.searches,"webFetches":d.fetches})).collect();
    let today = Local
        .timestamp_millis_opt(now)
        .single()
        .unwrap_or_else(Local::now)
        .date_naive();
    let mut current = today;
    let mut streak = 0;
    if !days.contains_key(&current.to_string()) {
        current -= Duration::days(1)
    }
    while days.contains_key(&current.to_string()) {
        streak += 1;
        current -= Duration::days(1)
    }
    let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let week = |from: chrono::NaiveDate, to: chrono::NaiveDate| {
        let list: Vec<_> = days
            .iter()
            .filter(|(date, _)| **date >= from.to_string() && **date <= to.to_string())
            .map(|(_, d)| d)
            .collect();
        json!({"tokens":list.iter().map(|d|d.tokens.total()).sum::<f64>(),"cost":list.iter().map(|d|d.cost).sum::<f64>(),"sessions":list.iter().map(|d|d.sessions.len()).sum::<usize>(),"activeTimeMs":0})
    };
    json!({"firstSessionAt":sessions.iter().filter_map(|s|s["startedAt"].as_i64()).min().unwrap_or(now),"allTimeActiveMs":sessions.iter().map(|s|n(&s["activeTimeMs"])).sum::<f64>(),
        "sessions":sessions,"projects":projects,"dailyMetrics":daily,"streak":streak,"weekComparison":{"thisWeek":week(monday,today),"lastWeek":week(monday-Duration::days(7),monday-Duration::days(1))},"lastUpdated":now})
}
pub fn all(reader: &mut Reader, sources: &Sources) -> Value {
    let (claude, codex, meta, limits, archive) = reader.read(sources);
    let now = Local::now().timestamp_millis();
    let mut c = snapshot(&claude, &meta, now);
    c["claudeArchive"] = json!(archive);
    let x = snapshot(&codex, &Metadata::new(), now);
    let mut combined = claude;
    combined.extend(codex);
    let mut result = snapshot(&combined, &meta, now);
    result["claudeArchive"] = json!(archive);
    result["providers"] = json!({"claude":c,"codex":x});
    result["codexLimits"] = json!(limits.codex);
    result["claudeLimits"] = json!(limits.claude);
    result
}

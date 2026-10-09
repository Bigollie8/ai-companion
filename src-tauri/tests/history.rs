use ai_companion::{
    aggregate,
    data::{Reader, Sources},
    model::n,
};
use serde_json::{json, Value};
use std::fs;
fn write(path: impl AsRef<std::path::Path>, text: &str) {
    let path = path.as_ref();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
#[test]
fn history_desktop_archive_and_cache_updates() {
    let dir = tempfile::tempdir().unwrap();
    let sources = Sources {
        home: dir.path().into(),
        codex: dir.path().join(".codex"),
    };
    write(sources.claude().join("history.jsonl"),&json!({"sessionId":"old","timestamp":1768564800000i64,"project":"C:/Projects/Old","display":"private prompt"}).to_string());
    write(dir.path().join("AppData/Local/Packages/Claude_example/LocalCache/Roaming/Claude/claude-code-sessions/local_one.json"),&json!({"sessionId":"local-one","cliSessionId":"desktop-1","originCwd":"C:/Projects/Desktop","createdAt":"2026-04-01T12:00:00Z","lastActivityAt":"2026-04-02T12:00:00Z","title":"private title","completedTurns":8}).to_string());
    write(sources.claude().join("stats-cache.json"),&json!({"firstSessionDate":"2026-01-16T12:00:00Z","lastComputedDate":"2026-02-16","totalSessions":120,"totalMessages":2400,"modelUsage":{"old":{"inputTokens":10,"outputTokens":20,"cacheReadInputTokens":100,"cacheCreationInputTokens":30}},"dailyActivity":[{"date":"2026-01-16","sessionCount":7,"messageCount":50}]}).to_string());
    let mut reader = Reader::default();
    let data = aggregate::all(&mut reader, &sources);
    assert_eq!(data["sessions"].as_array().unwrap().len(), 2);
    assert_eq!(n(&data["allTimeActiveMs"]), 0.);
    assert_eq!(n(&data["claudeArchive"]["sessionCount"]), 120.);
    assert_eq!(
        n(&data["claudeArchive"]["tokenUsage"]["cacheReadTokens"]),
        100.
    );
    assert!(!data.to_string().contains("private"));
    let desktop = data["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["sessionId"] == "desktop-1")
        .unwrap();
    assert_eq!(n(&desktop["messageCount"]), 0.);
    assert_eq!(desktop["dataQuality"], "history-only");
    let row = |kind: &str, p: Value| {
        json!({"timestamp":"2026-09-04T12:00:00Z","type":kind,"payload":p}).to_string()
    };
    let text = [
        row("session_meta", json!({"id":"test","source":"cli"})),
        row("turn_context", json!({"model":"gpt-6-astra"})),
        row("event_msg", json!({"type":"user_message"})),
        row(
            "token_usage_record",
            json!({"response_id":"one","usage":{"input_tokens":100,"output_tokens":10}}),
        ),
        row(
            "response_item",
            json!({"type":"function_call","name":"request_user_input","call_id":"q"}),
        ),
    ]
    .join("\n");
    let active = sources.codex.join("sessions/one.jsonl");
    let archive = sources.codex.join("archived_sessions/two.jsonl");
    write(&active, &text);
    write(&archive, &text);
    let data = aggregate::all(&mut reader, &sources);
    let codex = &data["providers"]["codex"]["sessions"];
    assert_eq!(codex.as_array().unwrap().len(), 1);
    assert_eq!(codex[0]["attention"]["requestId"], "q");
    write(
        &active,
        &format!(
            "{text}\n{}",
            row(
                "token_usage_record",
                json!({"response_id":"two","usage":{"input_tokens":100,"output_tokens":20}})
            )
        ),
    );
    assert_eq!(
        n(
            &aggregate::all(&mut reader, &sources)["providers"]["codex"]["sessions"][0]
                ["tokenUsage"]["outputTokens"]
        ),
        30.
    );
    fs::remove_file(active).unwrap();
    let data = aggregate::all(&mut reader, &sources);
    assert_eq!(
        n(&data["providers"]["codex"]["sessions"][0]["tokenUsage"]["outputTokens"]),
        10.
    );
    assert!(data["providers"]["codex"]["sessions"][0]["attention"].is_null());
    fs::remove_file(archive).unwrap();
    assert_eq!(
        aggregate::all(&mut reader, &sources)["providers"]["codex"]["sessions"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
}

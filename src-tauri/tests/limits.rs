use ai_companion::{
    aggregate,
    data::{Reader, Sources},
    limits,
    model::n,
};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
};
fn write(path: impl AsRef<std::path::Path>, text: &str) {
    let path = path.as_ref();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn sources() -> (tempfile::TempDir, Sources) {
    let dir = tempfile::tempdir().unwrap();
    let sources = Sources {
        home: dir.path().into(),
        codex: dir.path().join(".codex"),
    };
    (dir, sources)
}
fn notice(time: &str, window: &str, resets_at: i64) -> String {
    json!({"timestamp":time,"type":"assistant","sessionId":"s1","cwd":"C:/Projects/Example",
        "message":{"id":"err1","role":"assistant","content":[{"type":"text","text":"private limit text"}]},
        "quotaLimits":{"status":"rejected","resetsAt":resets_at,"rateLimitType":window},
        "error":"rate_limit","isApiErrorMessage":true,"apiErrorStatus":429})
    .to_string()
}

#[test]
fn usage_response_maps_to_five_hour_and_seven_day_windows() {
    let body = json!({
        "five_hour":{"utilization":42.5,"resets_at":"2026-10-03T18:00:00+00:00"},
        "seven_day":{"utilization":130.0,"resets_at":1791000000},
        "seven_day_opus":{"utilization":3.0,"resets_at":null}
    });
    let limits = limits::from_usage(&body, 1_700_000_000_000).unwrap();
    assert_eq!(limits["observedAt"], 1_700_000_000_000i64);
    assert_eq!(limits["source"], "live");
    assert_eq!(n(&limits["primary"]["usedPercent"]), 42.5);
    assert_eq!(n(&limits["primary"]["windowMinutes"]), 300.);
    assert_eq!(limits["primary"]["resetsAt"], 1_791_050_400_000i64);
    assert_eq!(n(&limits["secondary"]["usedPercent"]), 100.);
    assert_eq!(n(&limits["secondary"]["windowMinutes"]), 10080.);
    assert_eq!(limits["secondary"]["resetsAt"], 1_791_000_000_000i64);
    let partial = limits::from_usage(&json!({"five_hour":{"utilization":5}}), 1).unwrap();
    assert!(partial["secondary"].is_null());
    assert!(partial["primary"]["resetsAt"].is_null());
    assert!(limits::from_usage(&json!({"error":"unauthorized"}), 1).is_none());
    assert!(limits::from_usage(&json!({"five_hour":{"utilization":"soon"}}), 1).is_none());
}

#[test]
fn transcript_rate_limit_notice_becomes_claude_limits() {
    let (_dir, sources) = sources();
    let user = json!({"timestamp":"2026-09-04T12:00:00Z","type":"user","sessionId":"s1","cwd":"C:/Projects/Example","message":{"content":"private prompt"}}).to_string();
    write(
        sources.claude().join("projects/example/s1.jsonl"),
        &[
            user,
            notice("2026-09-04T12:05:00Z", "seven_day", 1_789_000_000),
            notice("2026-09-04T12:10:00Z", "five_hour", 1_789_579_800),
        ]
        .join("\n"),
    );
    let data = aggregate::all(&mut Reader::default(), &sources);
    let limits = &data["claudeLimits"];
    assert_eq!(limits["source"], "transcript");
    assert_eq!(limits["observedAt"], 1_788_523_800_000i64);
    assert_eq!(n(&limits["primary"]["usedPercent"]), 100.);
    assert_eq!(n(&limits["primary"]["windowMinutes"]), 300.);
    assert_eq!(limits["primary"]["resetsAt"], 1_789_579_800_000i64);
    assert!(limits["secondary"].is_null());
    assert!(data["codexLimits"].is_null());
    assert!(!data.to_string().contains("private"));
}

#[test]
fn no_notice_means_no_claude_limits_but_the_key_exists() {
    let (_dir, sources) = sources();
    let data = aggregate::all(&mut Reader::default(), &sources);
    assert!(data.as_object().unwrap().contains_key("claudeLimits"));
    assert!(data["claudeLimits"].is_null());
}

#[test]
fn newest_snapshot_wins_between_live_and_transcript() {
    let (_dir, sources) = sources();
    write(
        sources.claude().join("projects/example/s1.jsonl"),
        &notice("2026-09-04T12:10:00Z", "five_hour", 1_789_579_800),
    );
    let mut reader = Reader::default();
    reader.claude_live =
        limits::from_usage(&json!({"five_hour":{"utilization":10}}), 1_788_523_700_000);
    let data = aggregate::all(&mut reader, &sources);
    assert_eq!(data["claudeLimits"]["source"], "transcript");
    reader.claude_live =
        limits::from_usage(&json!({"five_hour":{"utilization":10}}), 1_788_523_900_000);
    let data = aggregate::all(&mut reader, &sources);
    assert_eq!(data["claudeLimits"]["source"], "live");
    assert_eq!(n(&data["claudeLimits"]["primary"]["usedPercent"]), 10.);
}

#[test]
fn credentials_file_yields_token_and_expiry_without_refresh_token() {
    let (_dir, sources) = sources();
    assert!(limits::credentials(&sources.claude()).is_none());
    write(
        sources.claude().join(".credentials.json"),
        &json!({"claudeAiOauth":{"accessToken":"sk-ant-oat01-example","refreshToken":"sk-ant-ort01-secret","expiresAt":1_800_000_000_000i64}}).to_string(),
    );
    let creds = limits::credentials(&sources.claude()).unwrap();
    assert_eq!(creds.token, "sk-ant-oat01-example");
    assert_eq!(creds.expires_at, 1_800_000_000_000);
    write(
        sources.claude().join(".credentials.json"),
        &json!({"claudeAiOauth":{"refreshToken":"only"}}).to_string(),
    );
    assert!(limits::credentials(&sources.claude()).is_none());
}

#[test]
fn live_polling_preference_defaults_on_and_can_be_switched_off() {
    let dir = tempfile::tempdir().unwrap();
    assert!(limits::polling_enabled(dir.path()));
    write(
        dir.path().join("renderer-preferences.json"),
        &json!({"claude-limits":"on"}).to_string(),
    );
    assert!(limits::polling_enabled(dir.path()));
    write(
        dir.path().join("renderer-preferences.json"),
        &json!({"claude-limits":"off"}).to_string(),
    );
    assert!(!limits::polling_enabled(dir.path()));
}

#[test]
fn fetch_sends_bearer_token_and_parses_json() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/api/oauth/usage", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 4096];
        let read = stream.read(&mut buf).unwrap();
        let request = String::from_utf8_lossy(&buf[..read]).to_string();
        let body = r#"{"five_hour":{"utilization":12.5,"resets_at":"2026-10-03T18:00:00Z"}}"#;
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        request
    });
    let body: Value = limits::fetch_from(&url, "sk-ant-oat01-example").unwrap();
    let request = server.join().unwrap().to_ascii_lowercase();
    assert!(request.starts_with("get /api/oauth/usage "));
    assert!(request.contains("authorization: bearer sk-ant-oat01-example"));
    assert!(request.contains("anthropic-beta: oauth-2025-04-20"));
    assert_eq!(n(&body["five_hour"]["utilization"]), 12.5);
}

#[test]
fn fetch_reports_http_failures_as_errors() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/api/oauth/usage", listener.local_addr().unwrap());
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 4096];
        let _ = stream.read(&mut buf);
        write!(stream, "HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").unwrap();
    });
    let error = limits::fetch_from(&url, "expired").unwrap_err();
    assert!(error.contains("401"), "{error}");
}

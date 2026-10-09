use crate::model::{n, s};
use chrono::{SecondsFormat, TimeZone, Utc};
use serde_json::Value;
pub fn export(data: &Value, from: f64, to: f64, hidden: &[String], provider: &str) -> String {
    let headers = [
        "Session ID",
        "Provider",
        "Data coverage",
        "Pricing coverage",
        "Project",
        "Started At",
        "Duration (min)",
        "Active Time (min)",
        "Messages",
        "Model",
        "Input Tokens",
        "Output Tokens",
        "Cache Write Tokens",
        "Cache Read Tokens",
        "Estimated Cost ($)",
        "Entrypoint",
    ];
    let mut rows = vec![headers.iter().map(|s| s.to_string()).collect::<Vec<_>>()];
    for v in data["sessions"].as_array().into_iter().flatten() {
        let start = n(&v["startedAt"]);
        if start < from || start > to || (provider != "all" && v["provider"] != provider) {
            continue;
        }
        let key = if s(&v["projectPath"]).is_empty() {
            s(&v["projectName"])
        } else {
            s(&v["projectPath"])
        };
        let masked = hidden.iter().any(|k| k == key);
        let history = v["dataQuality"] == "history-only";
        let known = v["costKnown"] == true;
        let date = Utc
            .timestamp_millis_opt(start as i64)
            .single()
            .map(|d| d.to_rfc3339_opts(SecondsFormat::Millis, true))
            .unwrap_or_default();
        let mut row = vec![
            if masked { "Hidden" } else { s(&v["sessionId"]) }.into(),
            s(&v["provider"]).into(),
            if history {
                "historical metadata; usage unavailable"
            } else {
                "detailed transcript"
            }
            .into(),
            if known {
                "standard API estimate"
            } else {
                "partial or unavailable"
            }
            .into(),
            if masked {
                "Hidden Project"
            } else {
                s(&v["projectName"])
            }
            .into(),
            date,
            format!("{:.1}", n(&v["durationMs"]) / 60000.),
            if history {
                String::new()
            } else {
                format!("{:.1}", n(&v["activeTimeMs"]) / 60000.)
            },
            if v["historySource"] == "desktop" {
                String::new()
            } else {
                n(&v["messageCount"]).to_string()
            },
            s(&v["model"]).into(),
        ];
        for key in [
            "inputTokens",
            "outputTokens",
            "cacheCreationTokens",
            "cacheReadTokens",
        ] {
            row.push(if history {
                String::new()
            } else {
                n(&v["tokenUsage"][key]).to_string()
            })
        }
        row.push(if known || n(&v["estimatedCost"]) > 0. {
            format!("{:.4}", n(&v["estimatedCost"]))
        } else {
            String::new()
        });
        row.push(s(&v["entrypoint"]).into());
        rows.push(row);
    }
    rows.into_iter()
        .map(|r| {
            r.into_iter()
                .map(|mut text| {
                    if text.trim_start().starts_with(['=', '+', '@', '-']) {
                        text.insert(0, '\'')
                    }
                    format!("\"{}\"", text.replace('"', "\"\""))
                })
                .collect::<Vec<_>>()
                .join(",")
        })
        .collect::<Vec<_>>()
        .join("\r\n")
}

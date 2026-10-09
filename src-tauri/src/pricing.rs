use crate::model::Tokens;

// Existing standard API-equivalent estimates, verified in the original app
// 2026-09-04. These are not subscription charges or live price quotes.
pub fn rates(model: &str) -> Option<(f64, f64, f64)> {
    Some(match model {
        "claude-sonnet-4-6" => (3., 15., 0.3),
        "claude-opus-4-6" | "claude-opus-4-5-20251101" | "claude-opus-4-8" | "claude-opus-5" => {
            (5., 25., 0.5)
        }
        "claude-fable-5" => (10., 50., 1.),
        "claude-fable-5-1" => (10., 50., 0.25),
        "claude-haiku-4-5-20251001" => (1., 5., 0.1),
        "gpt-6-astra" => (10., 50., 1.),
        "gpt-5.3-codex" => (1.75, 14., 0.175),
        _ => return None,
    })
}
pub fn cost(model: &str, t: Tokens) -> f64 {
    let Some((input, output, read)) = rates(model) else {
        return 0.;
    };
    let long = model == "gpt-6-astra"
        && t.input_tokens + t.cache_creation_tokens + t.cache_read_tokens > 272000.;
    ((t.input_tokens * input + t.cache_creation_tokens * input * 1.25 + t.cache_read_tokens * read)
        * if long { 2. } else { 1. }
        + t.output_tokens * output * if long { 1.5 } else { 1. })
        / 1e6
}
pub fn savings(model: &str, t: Tokens) -> f64 {
    rates(model)
        .map(|(input, _, read)| t.cache_read_tokens * (input - read) / 1e6)
        .unwrap_or(0.)
}

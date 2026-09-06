# AI Companion

A local desktop companion for **Codex and Claude**. Keep an eye on usage, recent activity, and chats that need your input with a resizable circular widget.

Independent community software; not affiliated with OpenAI or Anthropic.

![The circular AI Companion widget showing synthetic sample data](docs/images/mini.png)

[See the full dashboard with sample data](docs/images/dashboard.png).

## Download

Get the Windows x64 installer or ZIP from this repository's **Releases** page.

- **Setup.exe:** installs AI Companion and creates shortcuts.
- **Windows-x64.zip:** extract the entire ZIP, then run `AI Companion.exe`. Node.js is not required.
- The first release is unsigned. Windows may show an unknown-publisher warning.
- Windows 11 is the tested platform. macOS and Linux installers are not included.

## What it does

- Combined and separate Codex / Claude usage dashboards: tokens, sessions, projects, activity, and estimated API-equivalent costs.
- A circular, always-on-top mini widget. Drag its background to move it; drag the bottom grip to resize. Size, position, and pin preferences persist across launches.
- Local session history, project privacy controls, charts, cache insights, and CSV / clipboard exports.
- Codex allowance snapshots with reset times and amber pulses at newly reported 80% and 95% crossings.
- Blue pulses for new, explicit unanswered questions or approval requests in an active chat turn.

**Mini** opens the widget. **Expand** restores the dashboard. **Alerts on/off** controls pulses; reduced-motion settings are respected. Hover a chat notice to see its project, or click to dismiss the notice without answering the chat.

## Chat alerts: deliberately conservative

Supported signals are Codex `request_user_input` / `request_user_input_async` and Claude `AskUserQuestion` / `ExitPlanMode` tool calls in local transcripts.

A request must first appear while the app is running, be less than two minutes old when discovered, and remain unanswered for three seconds. Recorded replies, tool results, completion, cancellation, and a ten-minute expiry clear it. Existing startup requests, archived/background sessions, ordinary final answers, and inactivity alone do not generate notifications.

This depends on the client's log format. Plain-text questions, generic permission dialogs, and tools hidden inside execution wrappers are not inferred. A silently closed chat cannot be identified if its client writes no close/cancel event. AI Companion never submits answers or approvals.

## Local data and privacy

No account login or API key is required. The app reads local files and does not upload chat histories or usage data.

| Provider | Sources |
| --- | --- |
| Codex | `$CODEX_HOME/sessions` and `archived_sessions`, defaulting to `~/.codex` |
| Claude | `~/.claude/projects`, `sessions`, `history.jsonl`, optional aggregate stats cache, and available Desktop session metadata |

Conversation message bodies are not sent to the dashboard renderer. Local project names, session identifiers, branch names, and session slugs may be displayed; use project privacy controls before sharing screenshots or exports.

Missing transcripts remain missing: metadata-only history can contribute session dates and project counts, but unknown usage is never invented. Older aggregate snapshots are displayed separately because their overlap cannot be reconciled reliably.

App preferences live in the operating system's per-user `ai-companion` application-data directory. Legacy local dashboard preferences are migrated when available.

## Understanding the numbers

Dollar values are estimates at known standard API rates, **not subscription charges**. Unknown model prices are excluded. Pricing can become outdated; rates are maintained in `src/main/pricing.ts`.

Codex allowance values are the last locally recorded snapshots, not live account queries. Cloud activity without local records is not included. Cached input and reasoning counts are normalized to avoid double counting.

Active time and context-health scores are heuristics. Recent activity means a message was recorded in the last two minutes; it does not prove a model is still running.

## Run from source

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run build
npm start
```

For development: `npm run dev`. On Windows, `start-dashboard.bat` builds and launches the app; `create-shortcut.ps1` creates a source-checkout shortcut using the current folder.

## Build and test

```sh
npm run typecheck
npm test
npm run build
npm run test:mini
npm run test:ui
npm run dist:win
```

Windows artifacts are written to `release/`. UI tests use an isolated profile and synthetic fixtures; the full UI suite also performs a read-only local-source smoke check. Generated screenshots and local histories are excluded from Git.

Run these checks locally before publishing release artifacts. Automated GitHub Actions builds are not enabled for this release.

## License

ISC. See [LICENSE](LICENSE).

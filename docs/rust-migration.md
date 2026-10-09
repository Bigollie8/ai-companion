# Rust migration

The production desktop runtime is Tauri 2 / Rust. React, Recharts and Tailwind remain the interface, rendered by the Windows system WebView2. There is no Electron or Node sidecar in the packaged application.

## Code map

- `src-tauri/src/parser.rs`: Claude and Codex transcript normalization and explicit unanswered input requests.
- `src-tauri/src/data.rs`: local source discovery, file caches, historical metadata recovery and saved Claude aggregates.
- `src-tauri/src/aggregate.rs`: sessions, projects, daily metrics and weekly comparisons.
- `src-tauri/src/pricing.rs` and `csv.rs`: existing pricing estimates and privacy-aware CSV exports.
- `src-tauri/src/main.rs`: bounded IPC commands, preferences and background filesystem watcher.
- `src-tauri/src/window.rs`: pinning, normal/mini mode, sizing, persisted bounds and Windows circular hit region.
- `src/renderer/lib/desktop.ts`: typed Tauri bridge, subscription cleanup, explicit dragging and preferences.
- `tests/reference/`: previous TypeScript data implementation, retained only for regression comparison.

The renderer receives usage summaries, not conversation message bodies. Commands do not expose arbitrary filesystem access or shell execution. Production content is bundled locally and the CSP restricts network access.

## Validation performed on Windows

- TypeScript typecheck and production Vite build.
- Rust compiler, formatting and Clippy with warnings treated as errors.
- 19 original regression tests, a Rust source/cache/history integration test, and 27 cross-language parity scenarios.
- Read-only comparison against local sources: 591 sessions found by both implementations; all 589 stable sessions matched. Two active/changing sessions were excluded from the value comparison.
- Release executable and NSIS installer built successfully.
- Live UI checks: initial data loading, provider filtering, full/mini transitions, maximize, circular resize grip, persisted window preferences and restarting into the release executable.

One initial development test lost its WebView process. It did not recur after restarting the development test with redirected logs or during the production UI checks; its cause was not established. The production app was tested independently of the Vite server.

The previous Electron UI automation harness was removed. UI behavior currently requires a Windows smoke check; automated parser parity is not a substitute for native window tests. Windows is the supported target of this migration; Linux/macOS packaging and circular hit regions have not been validated.

## Running and distributing

`npm run build` produces `src-tauri/target/release/ai-companion.exe`. `npm start` and `start-dashboard.bat` launch that binary. `npm run dev` starts Tauri with Vite. `npm run dist:win` produces the NSIS installer in `src-tauri/target/release/bundle/nsis/`.

Window preferences remain in `%APPDATA%/ai-companion`. Privacy and alert settings now use `renderer-preferences.json` in that directory. The migration helper described in the README can export settings from the old Electron profile before its dependencies are removed. Original profile data is not deleted.

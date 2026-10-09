import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
import { parseCodexText, parseAllCodexSessions, normalizeCodexUsage } from './reference/parser/codex'
import { parseJsonlFile } from './reference/parser/conversations'
import { aggregateSessions } from './reference/parser/aggregator'
import { exportSessionsCSV } from './reference/csv'
import { calculateCost } from './reference/pricing'
import { parseChatAttention } from './reference/parser/attention'
const removeFixture = (dir: string) => {
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep) && basename(dir).startsWith('usage-'))
  rmSync(dir, { recursive: true, force: true })
}
const time = '2026-09-04T12:00:00Z'
const record = (type: string, payload: any, timestamp = time) => JSON.stringify({ type, payload, timestamp })
const meta = record('session_meta', { id: 'test', cwd: 'C:\\Projects\\Example', source: 'cli' })
const context = record('turn_context', { model: 'gpt-6-astra' })
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: Math.min(output, 5) })
const count = (raw: any, timestamp = time) => record('event_msg', { type: 'token_count', info: { total_token_usage: raw, last_token_usage: usage(100, 40, 10), model_context_window: 1000 } }, timestamp)
const parse = (...lines: string[]) => parseCodexText([meta, context, ...lines].join('\n'))

test('Chat attention requires an explicit unanswered request in an active turn', () => {
  const event = (payload: any) => ({ timestamp: time, type: 'event_msg', payload })
  const item = (payload: any) => ({ timestamp: time, type: 'response_item', payload })
  const start = event({ type: 'task_started' })
  const ask = item({ type: 'function_call', name: 'request_user_input', call_id: 'question-1' })
  assert.equal(parseChatAttention([ask], 'codex'), undefined)
  assert.equal(parseChatAttention([start, item({ type: 'message', role: 'assistant', content: [{ text: 'Would you like anything else?' }] })], 'codex'), undefined)
  assert.equal(parseChatAttention([start, item({ type: 'function_call', name: 'exec_command', call_id: 'shell-1' })], 'codex'), undefined)
  assert.equal(parseChatAttention([start, ask], 'codex')?.requestId, 'question-1')
  for (const resolved of [item({ type: 'function_call_output', call_id: 'question-1', output: '{}' }), item({ type: 'message', role: 'user' }), item({ type: 'message', role: 'assistant', phase: 'final' }), event({ type: 'task_complete' }), event({ type: 'turn_aborted' })]) {
    assert.equal(parseChatAttention([start, ask, resolved], 'codex'), undefined)
  }
  assert.equal(parseChatAttention([{ timestamp: time, type: 'session_meta', payload: { source: { subagent: {} } } }, start, ask], 'codex'), undefined)
  const asyncAsk = item({ type: 'function_call', name: 'functions.request_user_input_async', call_id: 'async-1' })
  const queued = item({ type: 'function_call_output', call_id: 'async-1', output: '{"queued":true}' })
  assert.equal(parseChatAttention([start, asyncAsk, queued], 'codex')?.requestId, 'async-1')
})

test('Claude tool results resolve questions without confusing idle or background chats', () => {
  const user = { timestamp: time, type: 'user', message: { content: 'Please help' } }
  const ask = { timestamp: time, type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', id: 'q' }] } }
  const answer = { timestamp: time, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'q', content: 'answered' }] } }
  assert.equal(parseChatAttention([user, ask], 'claude')?.kind, 'question')
  assert.equal(parseChatAttention([user, ask, answer], 'claude'), undefined)
  assert.equal(parseChatAttention([user, ask, { timestamp: time, type: 'system', subtype: 'turn_duration' }], 'claude'), undefined)
  assert.equal(parseChatAttention([user, { ...ask, isSidechain: true }], 'claude'), undefined)
  assert.equal(parseChatAttention([user, { timestamp: time, type: 'assistant', message: { content: [{ type: 'text', text: 'All done. Anything else?' }], stop_reason: 'end_turn' } }], 'claude'), undefined)
})

test('Codex parser carries pending input into dashboard session data', () => {
  const pending = parse(record('event_msg', { type: 'task_started' }), record('event_msg', { type: 'user_message' }), record('response_item', { type: 'function_call', name: 'request_user_input', call_id: 'pending' }))
  assert.equal(aggregateSessions([pending.session!]).sessions[0].attention?.requestId, 'pending')
})

test('Codex cached input and reasoning are subsets, not extra tokens', () => {
  assert.deepEqual(normalizeCodexUsage(usage(100, 60, 20)), { inputTokens: 40, cacheReadTokens: 60, cacheCreationTokens: 0, outputTokens: 20 })
})
test('Repeated cumulative counts and mirrored usage records count once', () => {
  const session = parse(count(usage(100, 40, 10)), count(usage(100, 40, 10)), record('token_usage_record', { usage: usage(100, 40, 10) }), count(usage(250, 100, 30))).session!
  assert.deepEqual(session.totalTokens, { inputTokens: 150, cacheReadTokens: 100, cacheCreationTokens: 0, outputTokens: 30 })
  assert.equal(session.messages.length, 2)
  assert.equal(session.projectName, 'Projects/Example')
  assert.equal(aggregateSessions([session]).sessions[0].peakContextPct, 10)
})
test('Null-info allowance notifications still update snapshot and partial lines are ignored', () => {
  const result = parse(count(usage(100, 40, 10)), record('event_msg', { type: 'token_count', info: null, rate_limits: { primary: { used_percent: 32, window_minutes: 10080, resets_at: 1800000000 } } }), '{"type":')
  assert.equal(result.limits?.primary?.usedPercent, 32)
  assert.equal(result.session?.messages.length, 1)
})
test('Response usage fallback deduplicates response IDs', () => {
  const row = record('token_usage_record', { response_id: 'one', usage: usage(120, 60, 15) })
  assert.equal(parse(row, row).session?.totalTokens.outputTokens, 15)
})
test('Unknown models preserve tokens without inventing a price', () => {
  const session = parse(record('turn_context', { model: 'unpriced-model' }), count(usage(100, 40, 10))).session!
  assert.equal(session.costKnown, false)
  assert.equal(session.totalCost, 0)
  assert.equal(session.totalTokens.outputTokens, 10)
})
test('Multiple models are priced per usage event', () => {
  const session = parse(count(usage(100, 40, 10)), record('turn_context', { model: 'unpriced-model' }), count(usage(200, 80, 20))).session!
  assert.equal(session.costKnown, false)
  assert.equal(session.totalCost, calculateCost('gpt-6-astra', 60, 10, 0, 40))
})
test('Daily rollups attribute deltas to the day of the event across midnight', () => {
  const session = parse(count(usage(100, 40, 10), '2026-09-03T23:59:00'), count(usage(200, 80, 20), '2026-09-04T00:01:00')).session!
  const data = aggregateSessions([session])
  assert.deepEqual(data.dailyMetrics.map(d => [d.date, d.tokenUsage.outputTokens]), [['2026-09-03', 10], ['2026-09-04', 10]])
  assert.equal(data.projects[0].totalTokens.outputTokens, 20)
})
test('Archive duplicates are deduplicated; changed, removed and missing files handled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-test-'))
  try {
    mkdirSync(join(dir, 'sessions')); mkdirSync(join(dir, 'archived_sessions'))
    const text = [meta, context, count(usage(100, 40, 10))].join('\n')
    writeFileSync(join(dir, 'sessions', 'one.jsonl'), text)
    writeFileSync(join(dir, 'archived_sessions', 'two.jsonl'), text)
    assert.equal(parseAllCodexSessions(dir).sessions.length, 1)
    writeFileSync(join(dir, 'sessions', 'one.jsonl'), text + '\n' + count(usage(200, 80, 20)))
    assert.equal(parseAllCodexSessions(dir).sessions[0].totalTokens.outputTokens, 20)
    rmSync(join(dir, 'sessions', 'one.jsonl'))
    assert.equal(parseAllCodexSessions(dir).sessions[0].totalTokens.outputTokens, 10)
  } finally { removeFixture(dir) }
  assert.deepEqual(parseAllCodexSessions(join(dir, 'missing')).sessions, [])
})
test('Claude streaming updates use final usage once, retaining other messages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-claude-'))
  try {
    const row = (output: number) => JSON.stringify({ type: 'assistant', timestamp: time, sessionId: 'claude-test', cwd: 'C:\\Projects\\Example', message: { id: 'msg1', model: 'claude-opus-4-6', usage: { input_tokens: 100, output_tokens: output } } })
    const file = join(dir, 'test.jsonl')
    writeFileSync(file, row(1) + '\n' + row(20) + '\n' + row(20))
    const session = parseJsonlFile(file)!
    assert.equal(session.messages.length, 1)
    assert.equal(session.totalTokens.outputTokens, 20)
    assert.equal(session.totalCost, .001)
  } finally { removeFixture(dir) }
})
test('CSV respects provider filter, masks IDs, escapes quotes and prevents formula cells', () => {
  const codex = parse(count(usage(100, 40, 10))).session!
  const claude = { ...codex, provider: 'claude' as const, sessionId: 'claude-1', projectPath: 'other', projectName: '=unsafe,"quoted"' }
  const data = aggregateSessions([codex, claude])
  const csv = exportSessionsCSV(data, { from: 0, to: Infinity }, [codex.projectPath], 'codex')
  assert.match(csv, /Hidden Project/); assert.doesNotMatch(csv, /codex:test|Example|claude-1/)
  assert.match(exportSessionsCSV(data, { from: 0, to: Infinity }, [], 'claude'), /'=unsafe,""quoted""/)
})
test('Standard rates handle Astra long context and unknown models explicitly', () => {
  assert.equal(calculateCost('unknown', 1000000, 1, 0, 0), 0)
  assert.ok(Math.abs(calculateCost('gpt-6-astra', 300000, 1000, 0, 0) - 6.075) < 1e-10)
})

// Historical recovery must not depend on the retention window of transcript files.
import { parseHistory } from './reference/parser/history'
import { recoverClaudeHistory, parseClaudeArchive, parseDesktopHistory, claudeDesktopSessionRoots } from './reference/parser/claudeArchive'

test('January history remains visible when only September transcripts survive, with no duplicate IDs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-history-'))
  try {
    const file = join(dir, 'history.jsonl')
    writeFileSync(file, [
      { sessionId: 'old', timestamp: Date.parse('2026-01-16T12:00:00'), project: 'C:\\Projects\\Old', display: 'private prompt' },
      { sessionId: 'old', timestamp: Date.parse('2026-03-01T12:00:00'), project: 'C:\\Projects\\Old', display: 'another private prompt' },
      { sessionId: 'codex:test', timestamp: Date.parse(time), project: 'C:\\Projects\\Example' },
      { sessionId: 'invalid', timestamp: 'bad' }
    ].map(JSON.stringify).join('\n') + '\n{"partial":')
    const detailed = parse(count(usage(100, 40, 10))).session!
    const history = parseHistory(file)
    const recovered = recoverClaudeHistory([detailed], history, [{ sessionId: 'old', projectPath: 'ignored', startedAt: 1, lastActivityAt: 2 }])
    assert.equal(recovered.length, 2)
    assert.equal(recovered.find(s => s.sessionId === detailed.sessionId), detailed)
    assert.equal(history.get('old')?.timestamps.length, 2)
    assert.ok(!JSON.stringify(recovered).includes('private prompt'))
    const data = aggregateSessions(recovered)
    const old = data.sessions.find(s => s.sessionId === 'old')!
    assert.equal(old.dataQuality, 'history-only'); assert.equal(old.activeTimeMs, 0)
    assert.equal(data.dailyMetrics.find(d => d.date === '2026-01-16')?.hasTokenData, false)
    assert.equal(data.dailyMetrics.find(d => d.date === '2026-03-01')?.sessionCount, 1)
    assert.equal(data.sessions.reduce((n, s) => n + s.tokenUsage.outputTokens, 0), 10)
    const csv = exportSessionsCSV(data, { from: 0, to: Date.parse('2026-02-01') })
    assert.match(csv, /historical metadata; usage unavailable/)
    assert.match(csv, /"Not recorded","","","","",""/)
  } finally { removeFixture(dir) }
})

test('Desktop metadata adds older sessions without inventing message counts or token usage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-desktop-'))
  try {
    const data = { sessionId: 'local_1', cliSessionId: 'cli-1', originCwd: 'C:\\Projects\\Desktop', createdAt: Date.parse('2026-04-01T12:00:00'), lastActivityAt: Date.parse('2026-04-02T12:00:00'), title: 'private title', completedTurns: 8 }
    writeFileSync(join(dir, 'local_1.json'), JSON.stringify(data))
    writeFileSync(join(dir, 'local_bad.json'), '{"partial":')
    const metadata = parseDesktopHistory([dir])
    assert.equal(metadata.length, 1); assert.equal(metadata[0].sessionId, 'cli-1')
    const summary = aggregateSessions(recoverClaudeHistory([], new Map(), metadata))
    assert.equal(summary.sessions[0].entrypoint, 'claude-desktop')
    assert.equal(summary.sessions[0].messageCount, 0)
    assert.equal(summary.sessions[0].activeTimeMs, 0)
    assert.equal(summary.dailyMetrics.length, 2)
    assert.ok(!JSON.stringify(summary).includes('private title'))
  } finally { removeFixture(dir) }
})

test('Saved Claude cache preserves token categories and aggregate counts separately from sessions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-cache-'))
  try {
    const file = join(dir, 'stats-cache.json')
    writeFileSync(file, JSON.stringify({ firstSessionDate: '2026-01-16T12:00:00Z', lastComputedDate: '2026-02-16', totalSessions: 120, totalMessages: 2400, modelUsage: { old: { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 100, cacheCreationInputTokens: 30 } }, dailyActivity: [{ date: '2026-01-16', sessionCount: 7, messageCount: 50 }] }))
    const cache = parseClaudeArchive(file)!
    assert.equal(cache.sessionCount, 120)
    assert.deepEqual(cache.tokenUsage, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 100, cacheCreationTokens: 30 })
    assert.equal(cache.dailyActivity[0].sessionCount, 7)
    assert.equal(aggregateSessions([]).sessions.length, 0)
    writeFileSync(file, '{}'); assert.equal(parseClaudeArchive(file), null)
    assert.equal(parseClaudeArchive(join(dir, 'missing')), null)
  } finally { removeFixture(dir) }
})

test('Store Desktop session-root discovery does not require a hard-coded package ID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-discovery-'))
  try {
    const root = join(dir, 'AppData/Local/Packages/Claude_example/LocalCache/Roaming/Claude/claude-code-sessions')
    mkdirSync(root, { recursive: true })
    assert.deepEqual(claudeDesktopSessionRoots(dir), [root])
  } finally { removeFixture(dir) }
})

test('All real historical Claude model families have explicit rates', () => {
  for (const model of ['claude-fable-5', 'claude-fable-5-1', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-5-20251101']) {
    assert.ok(calculateCost(model, 1000, 100, 0, 0) > 0, model)
  }
  assert.equal(calculateCost('claude-fable-5-1', 0, 0, 0, 1000000), .25)
})

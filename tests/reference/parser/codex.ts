import { readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { ParsedSession } from './conversations'
import type { CodexLimits, TokenUsage, UsageLimit } from './types'
import { calculateCost, MODEL_PRICING } from '../pricing'
import { parseChatAttention } from './attention'

export const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')
const zero = (): TokenUsage => ({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })
const count = (n: unknown): number => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0

function limit(raw: any): UsageLimit | null {
  if (!raw || !Number.isFinite(raw.used_percent) || !Number.isFinite(raw.window_minutes)) return null
  return { usedPercent: Math.min(100, count(raw.used_percent)), windowMinutes: count(raw.window_minutes),
    resetsAt: Number.isFinite(raw.resets_at) ? raw.resets_at * 1000 : null }
}

// Codex includes cached input in input_tokens and reasoning in output_tokens.
// Keep the four dashboard token buckets mutually exclusive.
export function normalizeCodexUsage(raw: any): TokenUsage {
  const input = count(raw?.input_tokens)
  const read = Math.min(input, count(raw?.cached_input_tokens))
  const write = Math.min(input - read, count(raw?.cache_write_input_tokens))
  return { inputTokens: input - read - write, cacheReadTokens: read,
    cacheCreationTokens: write, outputTokens: count(raw?.output_tokens) }
}

export function parseCodexText(text: string, fallbackId = 'unknown'): { session: ParsedSession | null; limits: CodexLimits | null } {
  const records: any[] = []
  for (const line of text.split('\n')) {
    try { const r = JSON.parse(line); if (r && typeof r === 'object') records.push(r) } catch { /* partial write */ }
  }
  const session: ParsedSession = { provider: 'codex', costKnown: true, sessionId: `codex:${fallbackId}`,
    projectPath: '', projectName: 'Unknown', entrypoint: 'codex', gitBranch: '', slug: '', messages: [],
    totalTokens: zero(), totalCost: 0, totalCacheSavings: 0, totalWebSearches: 0, totalWebFetches: 0,
    primaryModel: 'unknown', autoCompactions: 0 }
  let limits: CodexLimits | null = null
  let model = 'unknown', contextWindow = 0
  let previous = zero()
  let previousRawTotal = 0
  const models = new Map<string, number>()
  const seenResponses = new Set<string>()
  const hasCounts = records.some(r => r.type === 'event_msg' && r.payload?.type === 'token_count' && r.payload.info?.total_token_usage)
  const hasUserEvents = records.some(r => r.type === 'event_msg' && r.payload?.type === 'user_message')

  for (const record of records) {
    const p = record.payload || {}
    const timestamp = Date.parse(record.timestamp)
    if (record.type === 'session_meta') {
      session.sessionId = `codex:${p.id || p.session_id || fallbackId}`
      session.projectPath = p.cwd || session.projectPath
      session.entrypoint = typeof p.source === 'string' ? `codex-${p.source}` : 'codex-agent'
      session.gitBranch = p.git?.branch || ''
      contextWindow = count(p.context_window)
    }
    if (record.type === 'turn_context') {
      model = p.model || model
      session.projectPath ||= p.cwd || ''
    }
    if (!Number.isFinite(timestamp)) continue
    if (record.type === 'compacted' || (record.type === 'event_msg' && p.type === 'context_compacted')) session.autoCompactions++
    if ((hasUserEvents && record.type === 'event_msg' && p.type === 'user_message') ||
        (!hasUserEvents && record.type === 'response_item' && p.type === 'message' && p.role === 'user')) {
      session.messages.push({ type: 'user', timestamp })
    }
    if (record.type === 'event_msg' && p.type === 'token_count' && p.rate_limits &&
        (!p.rate_limits.limit_id || p.rate_limits.limit_id === 'codex')) {
      if (!limits || timestamp >= limits.observedAt) limits = { observedAt: timestamp,
        primary: limit(p.rate_limits.primary), secondary: limit(p.rate_limits.secondary) }
    }
    let usage: TokenUsage | null = null
    let contextTokens: number | undefined
    if (hasCounts && record.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
      const raw = p.info.total_token_usage
      const next = normalizeCodexUsage(raw)
      const rawTotal = count(raw.input_tokens) + count(raw.output_tokens)
      // Cumulative snapshots are repeated by notifications. Ignore duplicates and older snapshots.
      if (rawTotal <= previousRawTotal) continue
      usage = zero()
      for (const key of Object.keys(usage) as (keyof TokenUsage)[]) usage[key] = Math.max(0, next[key] - previous[key])
      previous = next
      previousRawTotal = rawTotal
      contextWindow = count(p.info.model_context_window) || contextWindow
      contextTokens = count(p.info.last_token_usage?.input_tokens)
    } else if (!hasCounts && record.type === 'token_usage_record' && p.usage) {
      if (p.response_id && seenResponses.has(p.response_id)) continue
      if (p.response_id) seenResponses.add(p.response_id)
      usage = normalizeCodexUsage(p.usage)
      contextTokens = count(p.usage.input_tokens)
    }
    if (!usage) continue
    const cost = calculateCost(model, usage.inputTokens, usage.outputTokens, usage.cacheCreationTokens, usage.cacheReadTokens)
    const rates = MODEL_PRICING[model]
    const cacheSavings = rates ? usage.cacheReadTokens * (rates.input - rates.cacheRead) : 0
    session.costKnown &&= !!rates
    session.messages.push({ type: 'assistant', timestamp, model, tokenUsage: usage, cost, cacheSavings,
      ...(contextWindow > 0 && contextTokens !== undefined ? { contextTokens, contextPct: contextTokens / contextWindow * 100 } : {}) })
    for (const key of Object.keys(usage) as (keyof TokenUsage)[]) session.totalTokens[key] += usage[key]
    session.totalCost += cost
    session.totalCacheSavings += cacheSavings
    models.set(model, (models.get(model) || 0) + 1)
  }
  session.projectName = session.projectPath.split(/[\\/]/).filter(Boolean).slice(-2).join('/') || 'Unknown'
  session.primaryModel = [...models].sort((a, b) => b[1] - a[1])[0]?.[0] || model
  session.messages.sort((a, b) => a.timestamp - b.timestamp)
  session.attention = parseChatAttention(records, 'codex')
  return { session: session.messages.length ? session : null, limits }
}

const cache = new Map<string, { stamp: string; result: ReturnType<typeof parseCodexText> }>()
export function parseAllCodexSessions(root = CODEX_HOME): { sessions: ParsedSession[]; limits: CodexLimits | null } {
  const sessions = new Map<string, ParsedSession>()
  const seen = new Set<string>()
  let limits: CodexLimits | null = null
  for (const directory of ['sessions', 'archived_sessions']) {
    const dir = join(root, directory)
    let files: string[] = []
    try { files = readdirSync(dir, { recursive: true }) as string[] } catch { continue }
    for (const name of files.filter(f => f.endsWith('.jsonl'))) {
      const file = join(dir, name)
      seen.add(file)
      try {
        const stat = statSync(file), stamp = `${stat.size}:${stat.mtimeMs}`
        let entry = cache.get(file)
        if (!entry || entry.stamp !== stamp) {
          entry = { stamp, result: parseCodexText(readFileSync(file, 'utf8'), basename(name, '.jsonl')) }
          cache.set(file, entry)
        }
        const result = entry.result
        if (result.session) {
          const candidate = directory === 'archived_sessions' ? { ...result.session, attention: undefined } : result.session
          const existing = sessions.get(result.session.sessionId)
          if (!existing || candidate.messages.length > existing.messages.length) sessions.set(candidate.sessionId, candidate)
        }
        if (result.limits && (!limits || result.limits.observedAt > limits.observedAt)) limits = result.limits
      } catch { /* file removed or unavailable */ }
    }
  }
  for (const file of cache.keys()) if (!seen.has(file)) cache.delete(file)
  return { sessions: [...sessions.values()], limits }
}

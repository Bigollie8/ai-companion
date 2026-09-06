import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { deriveProjectName, type ParsedSession } from './conversations'
import type { HistorySession } from './history'
import type { ClaudeArchive, TokenUsage } from './types'

const emptyTokens = (): TokenUsage => ({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })
const count = (n: unknown): number => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
export const CLAUDE_STATS_PATH = join(homedir(), '.claude', 'stats-cache.json')

export function parseClaudeArchive(file = CLAUDE_STATS_PATH): ClaudeArchive | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const firstSessionAt = Date.parse(raw.firstSessionDate)
    if (!Number.isFinite(firstSessionAt) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.lastComputedDate || '')) return null
    const models = Object.entries(raw.modelUsage || {}).map(([model, value]) => {
      const usage = value as any
      return { model, tokenUsage: { inputTokens: count(usage?.inputTokens), outputTokens: count(usage?.outputTokens),
        cacheReadTokens: count(usage?.cacheReadInputTokens), cacheCreationTokens: count(usage?.cacheCreationInputTokens) } }
    })
    const tokenUsage = emptyTokens()
    for (const model of models) for (const key of Object.keys(tokenUsage) as (keyof TokenUsage)[]) tokenUsage[key] += model.tokenUsage[key]
    return { firstSessionAt, throughDate: raw.lastComputedDate, sessionCount: count(raw.totalSessions), messageCount: count(raw.totalMessages), tokenUsage, models,
      dailyActivity: (Array.isArray(raw.dailyActivity) ? raw.dailyActivity : []).filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d?.date || '')).map((d: any) => ({ date: d.date, sessionCount: count(d.sessionCount), messageCount: count(d.messageCount) })) }
  } catch { return null }
}

// The Store build keeps Desktop session metadata inside its package's roaming directory.
export function claudeDesktopSessionRoots(home = homedir()): string[] {
  const roots = [join(home, 'AppData', 'Roaming', 'Claude', 'claude-code-sessions')]
  const packages = join(home, 'AppData', 'Local', 'Packages')
  try {
    for (const name of readdirSync(packages).filter(n => n.startsWith('Claude_'))) roots.push(join(packages, name, 'LocalCache', 'Roaming', 'Claude', 'claude-code-sessions'))
  } catch { /* Non-Windows or Desktop not installed. */ }
  return roots.filter(existsSync)
}

export interface DesktopHistorySession { sessionId: string; projectPath: string; startedAt: number; lastActivityAt: number }
export function parseDesktopHistory(roots = claudeDesktopSessionRoots()): DesktopHistorySession[] {
  const sessions: DesktopHistorySession[] = []
  for (const root of roots) {
    let files: string[] = []
    try { files = readdirSync(root, { recursive: true }) as string[] } catch { continue }
    for (const file of files.filter(f => /^local_[^/\\]+\.json$/.test(basename(f)))) {
      try {
        const raw = JSON.parse(readFileSync(join(root, file), 'utf8'))
        const startedAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.parse(raw.createdAt)
        const last = typeof raw.lastActivityAt === 'number' ? raw.lastActivityAt : Date.parse(raw.lastActivityAt)
        if (!Number.isFinite(startedAt) || startedAt <= 0) continue
        const id = raw.cliSessionId || raw.sessionId
        if (typeof id !== 'string' || !id) continue
        sessions.push({ sessionId: raw.cliSessionId || `desktop:${raw.sessionId}`, projectPath: typeof raw.originCwd === 'string' ? raw.originCwd : typeof raw.cwd === 'string' ? raw.cwd : '',
          startedAt, lastActivityAt: Number.isFinite(last) ? Math.max(startedAt, last) : startedAt })
      } catch { /* Unavailable or partially written metadata. */ }
    }
  }
  return sessions
}

function historicalSession(id: string, projectPath: string, timestamps: number[], source: 'history' | 'desktop'): ParsedSession {
  return { provider: 'claude', dataQuality: 'history-only', historySource: source, costKnown: false,
    sessionId: id, projectPath, projectName: deriveProjectName(projectPath), entrypoint: source === 'desktop' ? 'claude-desktop' : 'claude-history',
    gitBranch: '', slug: '', primaryModel: 'Not recorded', autoCompactions: 0, totalTokens: emptyTokens(), totalCost: 0, totalCacheSavings: 0, totalWebSearches: 0, totalWebFetches: 0,
    messages: [...timestamps].sort((a, b) => a - b).map(timestamp => ({ type: source === 'desktop' ? 'activity' : 'user', timestamp })) }
}

export function recoverClaudeHistory(detailed: ParsedSession[], history: Map<string, HistorySession>, desktop: DesktopHistorySession[] = []): ParsedSession[] {
  const sessions = new Map(detailed.map(s => [s.sessionId, s]))
  for (const [id, item] of history) {
    if (!sessions.has(id) && item.timestamps.length) sessions.set(id, historicalSession(id, item.projectPath, item.timestamps, 'history'))
  }
  for (const item of desktop) {
    if (!sessions.has(item.sessionId)) sessions.set(item.sessionId, historicalSession(item.sessionId, item.projectPath, [...new Set([item.startedAt, item.lastActivityAt])], 'desktop'))
  }
  return [...sessions.values()]
}

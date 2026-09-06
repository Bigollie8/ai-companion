import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import { parseHistory } from './history'
import { parseSessionMetadata } from './sessions'
import { parseAllConversations, type ParsedSession } from './conversations'
import { parseAllCodexSessions } from './codex'
import { parseClaudeArchive, parseDesktopHistory, recoverClaudeHistory } from './claudeArchive'
import type {
  SessionSummary,
  ProjectSummary,
  DailyMetrics,
  DashboardData,
  DashboardSnapshot,
  TokenUsage,
  WeekMetrics
} from './types'

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

function emptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
}

function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens
  }
}

function computeActiveTime(parsed: ParsedSession): number {
  if (parsed.messages.length < 2) return 0
  let activeTime = 0
  for (let i = 1; i < parsed.messages.length; i++) {
    const gap = parsed.messages[i].timestamp - parsed.messages[i - 1].timestamp
    activeTime += Math.min(gap, IDLE_THRESHOLD_MS)
  }
  return activeTime
}

const CONTEXT_WINDOW = 200_000

function buildContextMetrics(parsed: ParsedSession): {
  peakContextTokens: number
  peakContextPct: number
  avgContextPct: number
  contextEfficiencyScore: number
  contextPoints: import('./types').ContextPoint[]
} {
  const assistantMsgs = parsed.messages.filter((m) => m.type === 'assistant' && m.contextTokens !== undefined)

  if (assistantMsgs.length === 0) {
    return { peakContextTokens: 0, peakContextPct: 0, avgContextPct: 0, contextEfficiencyScore: 100, contextPoints: [] }
  }

  const contextPoints = assistantMsgs.map((m) => ({
    timestamp: m.timestamp,
    contextTokens: m.contextTokens!,
    contextPct: m.contextPct!
  }))

  const peakContextTokens = Math.max(...contextPoints.map((p) => p.contextTokens))
  const peakContextPct = Math.max(...contextPoints.map(p => p.contextPct))
  const avgContextPct = contextPoints.reduce((s, p) => s + p.contextPct, 0) / contextPoints.length

  // Efficiency score: start at 100
  // -15 per auto-compaction (each one means context was mismanaged)
  // -20 if peak > 80% of window
  // -10 if avg > 50% of window
  let score = 100
  score -= parsed.autoCompactions * 15
  if (peakContextPct > 80) score -= 20
  if (avgContextPct > 50) score -= 10
  score = Math.max(0, Math.min(100, score))

  return { peakContextTokens, peakContextPct, avgContextPct, contextEfficiencyScore: Math.round(score), contextPoints }
}

function buildSessionSummary(
  parsed: ParsedSession,
  metaLookup: Map<string, { startedAt: number; entrypoint: string }>
): SessionSummary {
  const firstMsg = parsed.messages[0]
  const lastMsg = parsed.messages[parsed.messages.length - 1]
  const meta = metaLookup.get(parsed.sessionId)
  const startedAt = meta?.startedAt || firstMsg.timestamp
  const entrypoint = parsed.entrypoint || meta?.entrypoint || 'unknown'
  const ctx = buildContextMetrics(parsed)

  return {
    dataQuality: parsed.dataQuality || 'full',
    attention: parsed.attention,
    historySource: parsed.historySource,
    provider: parsed.provider || 'claude',
    costKnown: parsed.costKnown ?? true,
    sessionId: parsed.sessionId,
    projectName: parsed.projectName,
    projectPath: parsed.projectPath,
    startedAt,
    lastMessageAt: lastMsg.timestamp,
    durationMs: lastMsg.timestamp - startedAt,
    activeTimeMs: parsed.dataQuality === 'history-only' ? 0 : computeActiveTime(parsed),
    messageCount: parsed.messages.filter(m => m.type !== 'activity').length,
    userMessageCount: parsed.messages.filter((m) => m.type === 'user').length,
    assistantMessageCount: parsed.messages.filter((m) => m.type === 'assistant').length,
    model: parsed.primaryModel,
    tokenUsage: parsed.totalTokens,
    estimatedCost: parsed.totalCost,
    cacheSavings: parsed.totalCacheSavings,
    entrypoint,
    gitBranch: parsed.gitBranch,
    slug: parsed.slug,
    webSearches: parsed.totalWebSearches,
    webFetches: parsed.totalWebFetches,
    peakContextTokens: ctx.peakContextTokens,
    peakContextPct: ctx.peakContextPct,
    avgContextPct: ctx.avgContextPct,
    autoCompactions: parsed.autoCompactions,
    contextEfficiencyScore: ctx.contextEfficiencyScore,
    contextPoints: ctx.contextPoints
  }
}

function buildProjectSummaries(sessions: SessionSummary[]): ProjectSummary[] {
  const projectMap = new Map<string, SessionSummary[]>()

  for (const session of sessions) {
    const key = session.projectPath || session.projectName
    const list = projectMap.get(key) || []
    list.push(session)
    projectMap.set(key, list)
  }

  const projects: ProjectSummary[] = []
  for (const [, projectSessions] of projectMap) {
    const first = projectSessions[0]
    let totalTokens = emptyTokenUsage()
    let totalCost = 0
    let totalDuration = 0
    let totalActiveTime = 0
    let totalMessages = 0
    const branchSet = new Set<string>()

    for (const s of projectSessions) {
      totalTokens = addTokenUsage(totalTokens, s.tokenUsage)
      totalCost += s.estimatedCost
      totalDuration += s.durationMs
      totalActiveTime += s.activeTimeMs
      totalMessages += s.messageCount
      if (s.gitBranch && s.gitBranch !== 'main' && s.gitBranch !== 'master') {
        branchSet.add(s.gitBranch)
      }
    }

    projects.push({
      historyOnlySessions: projectSessions.filter(s => s.dataQuality === 'history-only').length,
      projectName: first.projectName,
      projectPath: first.projectPath,
      sessionCount: projectSessions.length,
      totalDurationMs: totalDuration,
      totalActiveTimeMs: totalActiveTime,
      totalTokens,
      totalCost,
      totalMessages,
      branches: Array.from(branchSet).slice(0, 10),
      sessions: projectSessions.sort((a, b) => b.startedAt - a.startedAt)
    })
  }

  return projects.sort((a, b) => b.totalCost - a.totalCost)
}

// Bucket each assistant message by its own timestamp for accurate daily rollups
function buildDailyMetrics(parsedSessions: ParsedSession[]): DailyMetrics[] {
  const dailyMap = new Map<
    string,
    {
      tokens: TokenUsage
      cost: number
      cacheSavings: number
      sessionIds: Set<string>
      messages: number
      projects: Set<string>
      webSearches: number
      webFetches: number
      hasTokenData: boolean
      historyIds: Set<string>
    }
  >()

  for (const session of parsedSessions) {
    for (const msg of session.messages) {
      if (!Number.isFinite(msg.timestamp)) continue

      const date = format(new Date(msg.timestamp), 'yyyy-MM-dd')
      const existing = dailyMap.get(date) || {
        tokens: emptyTokenUsage(),
        cost: 0,
        cacheSavings: 0,
        sessionIds: new Set<string>(),
        messages: 0,
        projects: new Set<string>(),
        webSearches: 0,
        webFetches: 0,
        hasTokenData: false,
        historyIds: new Set<string>()
      }

      if (msg.tokenUsage) {
        existing.tokens = addTokenUsage(existing.tokens, msg.tokenUsage)
        existing.hasTokenData = true
      }
      if (session.dataQuality === 'history-only') existing.historyIds.add(session.sessionId)
      existing.cost += msg.cost ?? 0
      existing.cacheSavings += msg.cacheSavings ?? 0
      existing.sessionIds.add(session.sessionId)
      if (msg.type !== 'activity') existing.messages++
      existing.projects.add(session.projectName)
      existing.webSearches += msg.webSearches ?? 0
      existing.webFetches += msg.webFetches ?? 0

      dailyMap.set(date, existing)
    }
  }

  const metrics: DailyMetrics[] = []
  for (const [date, data] of dailyMap) {
    metrics.push({
      date,
      hasTokenData: data.hasTokenData,
      historyOnlySessionCount: data.historyIds.size,
      tokenUsage: data.tokens,
      cost: data.cost,
      cacheSavings: data.cacheSavings,
      sessionCount: data.sessionIds.size,
      messageCount: data.messages,
      activeProjects: Array.from(data.projects),
      webSearches: data.webSearches,
      webFetches: data.webFetches
    })
  }

  return metrics.sort((a, b) => a.date.localeCompare(b.date))
}

function computeStreak(dailyMetrics: DailyMetrics[]): number {
  if (dailyMetrics.length === 0) return 0

  const dateSet = new Set(dailyMetrics.map((d) => d.date))
  const today = format(new Date(), 'yyyy-MM-dd')

  let streak = 0
  let current = new Date()

  // If no activity today, start checking from yesterday
  if (!dateSet.has(today)) {
    current.setDate(current.getDate() - 1)
  }

  while (true) {
    const dateStr = format(current, 'yyyy-MM-dd')
    if (!dateSet.has(dateStr)) break
    streak++
    current.setDate(current.getDate() - 1)
  }

  return streak
}

function computeWeekComparison(dailyMetrics: DailyMetrics[]): { thisWeek: WeekMetrics; lastWeek: WeekMetrics } {
  const now = new Date()
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 }).getTime()
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).getTime()
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).getTime()

  function metricsFor(start: number, end: number): WeekMetrics {
    const days = dailyMetrics.filter((d) => {
      const ts = new Date(`${d.date}T00:00:00`).getTime()
      return ts >= start && ts <= end
    })
    return {
      tokens: days.reduce(
        (s, d) =>
          s + d.tokenUsage.inputTokens + d.tokenUsage.outputTokens +
          d.tokenUsage.cacheCreationTokens + d.tokenUsage.cacheReadTokens,
        0
      ),
      cost: days.reduce((s, d) => s + d.cost, 0),
      sessions: days.reduce((s, d) => s + d.sessionCount, 0),
      activeTimeMs: 0 // approximated elsewhere
    }
  }

  return {
    thisWeek: metricsFor(thisWeekStart, Date.now()),
    lastWeek: metricsFor(lastWeekStart, lastWeekEnd)
  }
}

export function aggregateAllData(): DashboardData {
  const historyMap = parseHistory()
  const sessionMeta = parseSessionMetadata()

  const metaLookup = new Map<string, { startedAt: number; entrypoint: string }>()
  for (const [, meta] of sessionMeta) {
    metaLookup.set(meta.sessionId, { startedAt: meta.startedAt, entrypoint: meta.entrypoint })
  }
  for (const [sessionId, history] of historyMap) {
    if (!metaLookup.has(sessionId)) {
      metaLookup.set(sessionId, { startedAt: history.firstTimestamp, entrypoint: 'unknown' })
    }
  }

  const claude = recoverClaudeHistory(parseAllConversations(), historyMap, parseDesktopHistory())
  const claudeArchive = parseClaudeArchive()
  const codex = parseAllCodexSessions()
  return {
    ...aggregateSessions([...claude, ...codex.sessions], metaLookup),
    claudeArchive,
    providers: { claude: { ...aggregateSessions(claude, metaLookup), claudeArchive }, codex: aggregateSessions(codex.sessions) },
    codexLimits: codex.limits
  }
}

export function aggregateSessions(parsedSessions: ParsedSession[], metaLookup = new Map<string, { startedAt: number; entrypoint: string }>()): DashboardSnapshot {
  const sessions = parsedSessions.map((p) => buildSessionSummary(p, metaLookup))
  sessions.sort((a, b) => b.startedAt - a.startedAt)

  const projects = buildProjectSummaries(sessions)
  const dailyMetrics = buildDailyMetrics(parsedSessions)

  const streak = computeStreak(dailyMetrics)
  const weekComparison = computeWeekComparison(dailyMetrics)

  const firstSessionAt = sessions.length > 0
    ? Math.min(...sessions.map((s) => s.startedAt))
    : Date.now()

  const allTimeActiveMs = sessions.reduce((s, x) => s + x.activeTimeMs, 0)

  return {
    sessions,
    projects,
    dailyMetrics,
    streak,
    firstSessionAt,
    allTimeActiveMs,
    weekComparison,
    lastUpdated: Date.now()
  }
}

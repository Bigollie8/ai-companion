import { useMemo, useState, useEffect } from 'react'
import { format } from 'date-fns'
import type { DashboardSnapshot, TokenUsage, SessionSummary } from '../lib/types'

interface LiveMetrics {
  todaySessions: SessionSummary[]
  todaySessionCount: number
  todayTokens: TokenUsage
  todayTotalTokens: number
  todayCost: number
  todayCacheSavings: number
  todayActiveTimeMs: number
  todayProjects: string[]
  todayWebSearches: number
  todayWebFetches: number
  activeSession: SessionSummary | null
  isActive: boolean
  allTimeTokens: number
  allTimeCost: number
  allTimeSessions: number
  streak: number
}

export function useLiveMetrics(data: DashboardSnapshot): LiveMetrics {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer) }, [])
  return useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const todayStart = new Date(`${today}T00:00:00`).getTime()

    // Sessions with any activity today
    const todaySessions = data.sessions.filter((s) => s.lastMessageAt >= todayStart)

    // Accurate today stats from DailyMetrics (bucketed per message timestamp)
    const todayMetrics = data.dailyMetrics.find((d) => d.date === today)
    const todayTokens: TokenUsage = todayMetrics?.tokenUsage ?? {
      inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0
    }
    const todayCost = todayMetrics?.cost ?? 0
    const todayCacheSavings = todayMetrics?.cacheSavings ?? 0
    const todayProjects = todayMetrics?.activeProjects ?? []
    const todayWebSearches = todayMetrics?.webSearches ?? 0
    const todayWebFetches = todayMetrics?.webFetches ?? 0

    // Active time for today: proportional estimate
    const todayActiveTimeMs = todaySessions.reduce((sum, s) => {
      const todayWindow = Math.min(s.durationMs, Date.now() - todayStart)
      const activeFraction = s.durationMs > 0 ? s.activeTimeMs / s.durationMs : 0
      return sum + Math.round(todayWindow * activeFraction)
    }, 0)

    // Active session: activity in last 2 min
    const twoMinAgo = now - 2 * 60 * 1000
    const activeSession = [...data.sessions].sort((a, b) => b.lastMessageAt - a.lastMessageAt).find((s) => s.lastMessageAt > twoMinAgo) ?? null

    // All-time totals
    let allTimeTokens = 0
    let allTimeCost = 0
    for (const s of data.sessions) {
      allTimeTokens += s.tokenUsage.inputTokens + s.tokenUsage.outputTokens +
        s.tokenUsage.cacheCreationTokens + s.tokenUsage.cacheReadTokens
      allTimeCost += s.estimatedCost
    }

    return {
      todaySessions,
      todaySessionCount: todayMetrics?.sessionCount ?? todaySessions.length,
      todayTokens,
      todayTotalTokens: todayTokens.inputTokens + todayTokens.outputTokens +
        todayTokens.cacheCreationTokens + todayTokens.cacheReadTokens,
      todayCost,
      todayCacheSavings,
      todayActiveTimeMs,
      todayProjects,
      todayWebSearches,
      todayWebFetches,
      activeSession,
      isActive: activeSession !== null,
      allTimeTokens,
      allTimeCost,
      allTimeSessions: data.sessions.length,
      streak: data.streak
    }
  }, [data, now])
}

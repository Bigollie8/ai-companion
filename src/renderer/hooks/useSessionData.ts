import { useState, useEffect } from 'react'
import type { DashboardData } from '../lib/types'

const emptyData: DashboardData = {
  sessions: [],
  projects: [],
  dailyMetrics: [],
  streak: 0, firstSessionAt: 0, allTimeActiveMs: 0,
  weekComparison: { thisWeek: { tokens: 0, cost: 0, sessions: 0, activeTimeMs: 0 }, lastWeek: { tokens: 0, cost: 0, sessions: 0, activeTimeMs: 0 } },
  providers: {} as DashboardData['providers'], codexLimits: null,
  lastUpdated: 0
}

export function useSessionData(): DashboardData {
  const [data, setData] = useState<DashboardData>(emptyData)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onDataUpdate) return

    const cleanup = api.onDataUpdate((newData: DashboardData) => {
      setData(newData)
    })

    // Request initial data
    api.requestRefresh?.()

    return cleanup
  }, [])

  return data
}

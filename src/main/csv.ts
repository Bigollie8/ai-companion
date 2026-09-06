import type { DashboardSnapshot } from './parser/types'

export function exportSessionsCSV(data: DashboardSnapshot, range: { from: number; to: number }, hiddenKeys: string[] = [], provider = 'all'): string {
  const hidden = new Set(hiddenKeys)
  const headers = ['Session ID', 'Provider', 'Data coverage', 'Pricing coverage', 'Project', 'Started At', 'Duration (min)', 'Active Time (min)', 'Messages', 'Model', 'Input Tokens', 'Output Tokens', 'Cache Write Tokens', 'Cache Read Tokens', 'Estimated Cost ($)', 'Entrypoint']
  const rows = data.sessions.filter(s => s.startedAt >= range.from && s.startedAt <= range.to && (provider === 'all' || s.provider === provider)).map(s => {
    const masked = hidden.has(s.projectPath || s.projectName)
    return [masked ? 'Hidden' : s.sessionId, s.provider, s.dataQuality === 'history-only' ? 'historical metadata; usage unavailable' : 'detailed transcript', s.costKnown ? 'standard API estimate' : 'partial or unavailable',
      masked ? 'Hidden Project' : s.projectName, new Date(s.startedAt).toISOString(), (s.durationMs / 60000).toFixed(1),
      s.dataQuality === 'history-only' ? '' : (s.activeTimeMs / 60000).toFixed(1), s.historySource === 'desktop' ? '' : s.messageCount, s.model, s.dataQuality === 'history-only' ? '' : s.tokenUsage.inputTokens, s.dataQuality === 'history-only' ? '' : s.tokenUsage.outputTokens,
      s.dataQuality === 'history-only' ? '' : s.tokenUsage.cacheCreationTokens, s.dataQuality === 'history-only' ? '' : s.tokenUsage.cacheReadTokens, s.costKnown || s.estimatedCost > 0 ? s.estimatedCost.toFixed(4) : '', s.entrypoint]
  })
  const cell = (value: string | number): string => {
    let text = String(value)
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}

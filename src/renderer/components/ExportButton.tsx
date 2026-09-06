import React, { useState } from 'react'
import type { DashboardSnapshot } from '../lib/types'
import { formatTokenCount, formatCost, formatDuration, totalTokens } from '../lib/formatters'
import { usePrivacy, HIDDEN_LABEL } from '../lib/privacy'

interface Props {
  data: DashboardSnapshot
  provider?: 'all' | 'claude' | 'codex'
}

export function ExportButton({ data, provider = 'all' }: Props) {
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  const { isHidden, hidden } = usePrivacy()

  const handleExportCSV = async () => {
    setExporting(true)
    setStatus('')
    try {
      const api = (window as any).electronAPI
      if (!api?.exportCSV) return

      const csv = await api.exportCSV(
        { from: 0, to: Date.now() },
        Array.from(hidden), provider
      )

      // Create and download blob
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ai-usage-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setStatus('CSV exported')
    } catch {
      setStatus('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleCopyReport = async () => {
    const totalSessions = data.sessions.length
    const totalCost = data.sessions.reduce((s, x) => s + x.estimatedCost, 0)
    const totalTok = data.sessions.reduce((s, x) => s + totalTokens(x.tokenUsage), 0)
    const totalActive = data.sessions.reduce((s, x) => s + x.activeTimeMs, 0)

    // Split visible vs hidden projects; aggregate hidden into one masked line so totals reconcile.
    const visibleProjects = data.projects.filter((p) => !isHidden(p.projectPath || p.projectName))
    const hiddenProjects = data.projects.filter((p) => isHidden(p.projectPath || p.projectName))
    const hiddenAgg = hiddenProjects.reduce(
      (acc, p) => ({
        sessions: acc.sessions + p.sessionCount,
        tokens: acc.tokens + totalTokens(p.totalTokens),
        cost: acc.cost + p.totalCost
      }),
      { sessions: 0, tokens: 0, cost: 0 }
    )

    const projectLines = [
      ...visibleProjects.map(
        (p) =>
          `- **${p.projectName}**: ${p.sessionCount} sessions, ${formatTokenCount(totalTokens(p.totalTokens))} tokens, ${formatCost(p.totalCost)}`
      ),
      ...(hiddenProjects.length > 0
        ? [
            `- **${HIDDEN_LABEL}${hiddenProjects.length > 1 ? `s (${hiddenProjects.length})` : ''}**: ${hiddenAgg.sessions} sessions, ${formatTokenCount(hiddenAgg.tokens)} tokens, ${formatCost(hiddenAgg.cost)}`
          ]
        : [])
    ]

    const lines = [
      '# AI Usage Report',
      `Generated: ${new Date().toLocaleString()}`,
      `Provider: ${provider}`,
      'Dollar totals use known standard API rates; not subscription charges. Unpriced models are excluded.',
      '',
      '## Summary',
      `- Total Sessions: ${totalSessions}`,
      `- Tokens from available transcripts: ${formatTokenCount(totalTok)}`,
      `- Historical entries without usage: ${data.sessions.filter(s => s.dataQuality === 'history-only').length}`,
      `- Estimated Cost: ${formatCost(totalCost)}`,
      `- Total Active Time: ${formatDuration(totalActive)}`,
      `- Projects: ${data.projects.length}`,
      '',
      ...(data.claudeArchive ? [
        '## Saved Claude history (separate, overlapping snapshot)',
        `- Through: ${data.claudeArchive.throughDate}`,
        `- Cached sessions: ${data.claudeArchive.sessionCount}`,
        `- Cached messages: ${data.claudeArchive.messageCount}`,
        `- Cached tokens: ${formatTokenCount(totalTokens(data.claudeArchive.tokenUsage))}`,
        'Not added to live totals: this snapshot has no session IDs to reconcile overlap.', ''
      ] : []),
      '## By Project',
      ...projectLines
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setStatus('Report copied')
    } catch { setStatus('Could not copy report. Please try again.') }
  }

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Export
      </div>
      <p className="text-xs text-gray-500 mb-3">Export the selected provider. Hidden project names stay masked.</p>
      <div className="flex gap-2">
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-accent-blue/15 text-accent-blue rounded-md hover:bg-accent-blue/25 transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
        <button
          onClick={handleCopyReport}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-panel-card text-gray-300 rounded-md border border-panel-border hover:bg-panel-hover transition-colors"
        >
          Copy Report
        </button>
      </div>
      {status && <p role="status" className="text-xs text-gray-400 mt-3">{status}</p>}
    </div>
  )
}

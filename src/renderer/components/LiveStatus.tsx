import React, { useState, useEffect } from 'react'
import type { SessionSummary } from '../lib/types'
import { formatDuration, formatModelName, formatTokenCount, totalTokens } from '../lib/formatters'
import { usePrivacy } from '../lib/privacy'

interface Props {
  activeSession: SessionSummary | null
  isActive: boolean
}

export function LiveStatus({ activeSession, isActive }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const { isHidden, maskName } = usePrivacy()
  const activeKey = activeSession ? activeSession.projectPath || activeSession.projectName : ''
  const activeHidden = activeSession ? isHidden(activeKey) : false

  useEffect(() => {
    if (!activeSession) return
    setElapsed(Date.now() - activeSession.startedAt)
    const interval = setInterval(() => {
      setElapsed(Date.now() - activeSession.startedAt)
    }, 1000)
    return () => clearInterval(interval)
  }, [activeSession?.sessionId])

  return (
    <div className="px-4 py-3 border-b border-panel-border">
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isActive ? 'bg-accent-green animate-pulse' : 'bg-gray-600'
          }`}
        />
        <span className="text-sm font-medium">{isActive ? 'Recent activity' : 'No recent activity'}</span>
        {activeSession && (
          <span className="text-xs text-gray-500 ml-auto">
            {formatModelName(activeSession.model)}
          </span>
        )}
      </div>

      {activeSession ? (
        <div className="ml-4">
          <div className={`text-xs font-medium truncate ${activeHidden ? 'italic text-gray-400' : 'text-accent-blue'}`}>
            {maskName(activeKey, activeSession.projectName)}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>{formatDuration(elapsed)}</span>
            <span>{activeSession.messageCount} msgs</span>
            <span>{formatTokenCount(totalTokens(activeSession.tokenUsage))} tokens</span>
          </div>
        </div>
      ) : (
        <div className="ml-4 text-xs text-gray-500">No active session</div>
      )}
    </div>
  )
}

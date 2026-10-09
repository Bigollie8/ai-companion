import React from 'react'
import type { SessionSummary } from '../lib/types'
import { formatRelativeTime } from '../lib/formatters'
import { usePrivacy } from '../lib/privacy'

interface Props {
  waiting: SessionSummary[]
  onDismiss: () => void
}

export function NeedsYou({ waiting, onDismiss }: Props) {
  const { maskName } = usePrivacy()
  return <section className="needs-you" aria-live="polite">
    <div className="now-label"><span>NEEDS YOU</span>{waiting.length > 0 && <em>{waiting.length} waiting</em>}</div>
    {waiting.length === 0
      ? <p className="needs-empty">Nothing is waiting on you.</p>
      : <div className="needs-list">
        {waiting.map(session => <div className="needs-row" key={`${session.sessionId}:${session.attention?.requestId}`}>
          <span className={`provider-dot ${session.provider}`} aria-hidden="true" />
          <div>
            <b>{maskName(session.projectPath || session.projectName, session.projectName)}</b>
            <span>{session.provider === 'codex' ? 'Codex' : 'Claude'} {session.attention?.kind === 'approval' ? 'is waiting for approval' : 'asked a question'}</span>
          </div>
          <small>{session.attention ? formatRelativeTime(session.attention.requestedAt) : ''}</small>
        </div>)}
        <button className="needs-dismiss" onClick={onDismiss} title="Hide this notice. This does not answer the chat.">Dismiss</button>
      </div>}
  </section>
}

import React, { useEffect, useRef, useState } from 'react'
import { useSessionData } from './hooks/useSessionData'
import { useLiveMetrics } from './hooks/useLiveMetrics'
import { useMiniAlerts } from './hooks/useMiniAlerts'
import { useChatAttention } from './hooks/useChatAttention'
import { usePrivacy } from './lib/privacy'
import { LiveStatus } from './components/LiveStatus'
import { KPICards } from './components/KPICards'
import { TokenChart } from './components/TokenChart'
import { ProjectList } from './components/ProjectList'
import { SessionList } from './components/SessionList'
import { CostBreakdown } from './components/CostBreakdown'
import { ActivityTimeline } from './components/ActivityTimeline'
import { ActivityHeatmap } from './components/ActivityHeatmap'
import { WeekComparison } from './components/WeekComparison'
import { CacheEfficiency } from './components/CacheEfficiency'
import { AllTimeStats } from './components/AllTimeStats'
import { ModelDistribution } from './components/ModelDistribution'
import { ContextHealth } from './components/ContextHealth'
import { ExportButton } from './components/ExportButton'
import { HistoricalCoverage } from './components/HistoricalCoverage'
import { CodexUsage } from './components/CodexUsage'
import { formatCost, formatTokenCount, totalTokens } from './lib/formatters'
import type { ElectronAPI } from '../preload/index'

type Tab = 'overview' | 'projects' | 'history' | 'insights'
type Provider = 'all' | 'claude' | 'codex'
const tabs: Tab[] = ['overview', 'projects', 'history', 'insights']
const descriptions = { overview: 'Your work with AI, at a glance.', projects: 'Where your sessions and tokens go.', history: 'Explore every recorded session.', insights: 'Patterns, efficiency, and the details behind your usage.' }
const Panel = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => <section className={`surface ${wide ? 'wide' : ''}`}>{children}</section>
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [provider, setProvider] = useState<Provider>('all')
  const [miniSize, setMiniSize] = useState(window.innerWidth)
  const resizeStart = useRef<{ x: number; y: number; size: number } | null>(null)
  useEffect(() => {
    const onResize = () => setMiniSize(Math.min(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [{ pinned, compact }, setWindowState] = useState({ pinned: false, compact: false })
  const allData = useSessionData()
  const alerts = useMiniAlerts(allData.codexLimits)
  const attention = useChatAttention(allData, alerts.enabled)
  const { maskName } = usePrivacy()
  const waitingLabel = attention.waiting.length > 1 ? `${attention.waiting.length} chats need your reply` : attention.waiting[0] ? `${attention.waiting[0].provider === 'codex' ? 'Codex' : 'Claude'} needs your reply` : null
  const waitingTitle = attention.waiting.map(s => `${s.provider === 'codex' ? 'Codex' : 'Claude'} · ${maskName(s.projectPath || s.projectName, s.projectName)} · ${s.attention?.kind === 'approval' ? 'approval requested' : 'question waiting'}`).join('\n')
  const data = provider === 'all' ? allData : allData.providers[provider] || allData
  const metrics = useLiveMetrics(data)
  const unknown = data.sessions.filter(s => !s.costKnown && s.dataQuality !== 'history-only').length
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI
  useEffect(() => {
    const cleanup = api?.onWindowState(setWindowState)
    api?.getWindowState().then(setWindowState).catch(() => {})
    return cleanup
  }, [api])
  if (compact) return <main className={`app-shell mini-shell drag-region ${alerts.warning ? 'orb-warning' : ''} ${alerts.pulse ? 'orb-notify' : ''} ${waitingLabel ? 'orb-chat-waiting' : ''} ${attention.pulse ? 'orb-chat-notify' : ''}`}>
    <div className="orb-ring" aria-hidden="true" />
    <div className="orb-stage" style={{ transform: `translate(-50%, -50%) scale(${Math.max(1, miniSize - 2) / 340})` }}>
    <div className="orb-content">
      <div className="orb-topline"><span className="mini-pinned" title="Always on top"><span className="status-dot" />Pinned</span><button className="no-drag orb-alert-toggle" aria-label="Toggle mini notifications" aria-pressed={alerts.enabled} title="Pulse for new unanswered input requests and Codex usage crossing 80% or 95%" onClick={alerts.toggle}>Alerts {alerts.enabled ? 'on' : 'off'}</button></div>
      <span className="eyebrow">TODAY · ALL PROVIDERS</span>
      {allData.lastUpdated === 0 ? <p className="orb-loading">Reading local activity…</p> : <MiniOverview data={allData} alerts={alerts} chatStatus={waitingLabel ? <button className="no-drag orb-chat-status" aria-label="Dismiss chat notification" title={`${waitingTitle}\nClick to dismiss this notification; this does not answer the chat.`} onClick={attention.dismiss}>{waitingLabel}</button> : undefined} />}
      <div className="orb-actions no-drag">
        <button aria-label="Refresh usage data" title="Refresh usage" onClick={() => api?.requestRefresh()}>↻</button>
        <button className="orb-expand" aria-label="Return to full dashboard" onClick={() => api?.windowAction('compact')}>Expand ↗</button>
        <button aria-label="Minimize window" title="Minimize" onClick={() => api?.windowAction('minimize')}>−</button>
        <button aria-label="Close window" title="Close" onClick={() => api?.windowAction('close')}>×</button>
      </div>
    </div>
    <button className="orb-resize no-drag" aria-label="Resize mini window" title="Drag to resize · arrow keys to adjust"
      onPointerDown={event => { resizeStart.current = { x: event.screenX, y: event.screenY, size: window.innerWidth }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { const start = resizeStart.current; if (start) api?.resizeMini(start.size + (event.screenY - start.y) / .9) }}
      onPointerUp={event => { resizeStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { resizeStart.current = null }}
      onLostPointerCapture={() => { resizeStart.current = null }}
      onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); api?.resizeMini(window.innerWidth + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -20 : 20)) } }}>⤡</button>
    </div>
  </main>
  return <div className={`app-shell ${compact ? 'mini-shell' : ''}`}>
    <header className="titlebar drag-region">
      <div className="brand" title="Your Codex + Claude companion"><span className="brand-mark">∿</span><span>AI <b>Companion</b></span></div>
      <div className="window-actions no-drag">
        <button aria-label={compact ? 'Return to full dashboard' : 'Open mini overview'} title={compact ? 'Return to full dashboard' : 'Small overview · always on top'} className="mode-button" onClick={() => api?.windowAction('compact')}>{compact ? 'Expand' : 'Mini'}</button>
        {!compact && <button aria-label="Toggle always on top" title={pinned ? 'Unpin window' : 'Keep window on top'} aria-pressed={pinned} onClick={() => api?.windowAction('pin')} className={`pin-button ${pinned ? 'selected' : ''}`}>Pin</button>}
        <button aria-label="Minimize window" onClick={() => api?.windowAction?.('minimize')}>−</button>
        {!compact && <button aria-label="Maximize or restore window" onClick={() => api?.windowAction?.('maximize')}>□</button>}
        <button aria-label="Close window" onClick={() => api?.windowAction?.('close')}>×</button>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar"><div className="eyebrow sidebar-label">WORKSPACE</div>
        <nav aria-label="Main navigation">{tabs.map((tab, i) => <button key={tab} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'active' : ''}><span className="nav-icon" aria-hidden="true">{['◫', '▦', '◷', '⌁'][i]}</span><span>{tab}</span></button>)}</nav>
        <div className="sidebar-footer"><span className="status-dot" /> Local activity<br /><small>Claude + Codex</small></div>
      </aside>
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">PERSONAL ANALYTICS</div><h1>{activeTab}</h1><p>{descriptions[activeTab]}</p></div><button className="refresh-button" onClick={() => api?.requestRefresh?.()} aria-label="Refresh usage data">↻ <span>Refresh</span></button></div>
        <div className="filterbar"><div className="provider-filter" aria-label="Filter by provider">{(['all', 'claude', 'codex'] as const).map(p => <button key={p} aria-pressed={provider === p} className={provider === p ? 'active' : ''} onClick={() => setProvider(p)}>{p === 'all' ? 'All providers' : p === 'claude' ? 'Claude' : 'Codex'}</button>)}</div><span className="sync-label">{data.lastUpdated ? `Updated ${new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Reading local activity…'}</span></div>
        {data.lastUpdated === 0 ? <div className="empty-state">Loading your local usage history…</div> : <>
          {activeTab === 'overview' && <>
            <KPICards sessionCount={metrics.todaySessionCount} totalTokens={metrics.todayTotalTokens} cost={metrics.todayCost} cacheSavings={metrics.todayCacheSavings} activeTimeMs={metrics.todayActiveTimeMs} projectCount={metrics.todayProjects.length} />
            <div className="dashboard-grid">
              <Panel><LiveStatus activeSession={metrics.activeSession} isActive={metrics.isActive} /><div className="provider-summary"><div className="eyebrow">TOKENS FROM AVAILABLE TRANSCRIPTS</div>
                {(['claude', 'codex'] as const).filter(p => provider === 'all' || provider === p).map(p => { const snapshot = allData.providers[p]; return <div className="provider-row" key={p}><span className={`provider-dot ${p}`} /><strong>{p === 'claude' ? 'Claude' : 'Codex'}</strong><span>{snapshot?.sessions.length || 0} sessions</span><b>{formatTokenCount(snapshot?.sessions.reduce((n, s) => n + totalTokens(s.tokenUsage), 0) || 0)}</b></div> })}
                <div className="streak-label">{metrics.streak} day activity streak</div></div></Panel>
              {provider !== 'claude' && <Panel><CodexUsage limits={allData.codexLimits} /></Panel>}
              {provider !== 'codex' && <Panel wide><HistoricalCoverage data={data} compact onBrowse={() => setActiveTab('history')} /></Panel>}
              <Panel wide><TokenChart dailyMetrics={data.dailyMetrics} /></Panel>
              <Panel wide><ActivityTimeline sessions={data.sessions} /></Panel>
              <Panel wide><SessionList sessions={metrics.todaySessions} title="Today's sessions" maxItems={10} /></Panel>
            </div>
          </>}
          {activeTab === 'projects' && <Panel><ProjectList projects={data.projects} fullHeight /></Panel>}
          {activeTab === 'history' && <div className="dashboard-grid">{provider !== 'codex' && <Panel wide><HistoricalCoverage data={data} /></Panel>}<Panel wide><SessionList sessions={data.sessions} title="Session history" maxItems={50} fullHeight /></Panel></div>}
          {activeTab === 'insights' && <div className="dashboard-grid">
            {provider !== 'codex' && <Panel wide><HistoricalCoverage data={data} /></Panel>}
            <Panel><WeekComparison thisWeek={data.weekComparison.thisWeek} lastWeek={data.weekComparison.lastWeek} /></Panel>
            <Panel><CacheEfficiency sessions={data.sessions} /></Panel>
            <Panel><CostBreakdown sessions={data.sessions} /></Panel>
            <Panel><ModelDistribution sessions={data.sessions} /></Panel>
            <Panel wide><ContextHealth sessions={data.sessions} /></Panel>
            <Panel wide><ActivityHeatmap dailyMetrics={data.dailyMetrics} /></Panel>
            <Panel><AllTimeStats data={data} /></Panel>
            <Panel><ExportButton data={data} provider={provider} /></Panel>
          </div>}
          {data.sessions.length === 0 && <div className="empty-state"><h2>No recorded sessions yet</h2><p>Use {provider === 'all' ? 'Claude or Codex' : provider} on this computer. Local activity will appear here automatically.</p></div>}
          <footer className="data-note">Dollar values are standard API estimates, not your subscription bill. {unknown > 0 && `${unknown} sessions include unpriced models; their unpriced tokens are excluded from dollar totals. `}Active time is an estimate. Historical entries without transcripts count toward sessions and projects, but their missing usage is not included in token or cost totals. Saved Claude aggregate history is shown separately.</footer>
        </>}
      </main>
    </div>
  </div>
}

function MiniOverview({ data, alerts, chatStatus }: { data: ReturnType<typeof useSessionData>; alerts: ReturnType<typeof useMiniAlerts>; chatStatus?: React.ReactNode }) {
  const metrics = useLiveMetrics(data)
  const { limit, expired, warning } = alerts
  return <>
    <div className="orb-total"><strong>{formatTokenCount(metrics.todayTotalTokens)}</strong><span>tokens today</span></div>
    <div className="orb-stats"><span><b>{metrics.todaySessionCount}</b> sessions</span><span title="Standard API estimate, not your subscription bill"><b>{formatCost(metrics.todayCost)}</b> API est.</span></div>
    <div className="orb-status" role="status">{chatStatus ?? warning ?? (metrics.isActive ? '● Activity in the last 2 min' : '○ No recent activity')}</div>
    <div className="orb-allowance">
      <span>{limit ? `Codex · ${limit.windowMinutes >= 1440 ? `${limit.windowMinutes / 1440}d` : `${limit.windowMinutes / 60}h`} · ${limit.usedPercent}% used` : 'Codex · no snapshot'}</span>
      {limit && <div className="orb-track"><i style={{ width: `${Math.max(0, Math.min(100, limit.usedPercent))}%` }} /></div>}
      <small title={data.codexLimits ? `Observed ${new Date(data.codexLimits.observedAt).toLocaleString()}` : undefined}>{expired ? 'Reset passed · awaiting update' : limit?.resetsAt ? `Reported · resets ${new Date(limit.resetsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${new Date(limit.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Last reported allowance'}</small>
    </div>
  </>
}

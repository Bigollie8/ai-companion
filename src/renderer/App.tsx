import React, { useEffect, useRef, useState } from 'react'
import { useSessionData } from './hooks/useSessionData'
import { useLiveMetrics } from './hooks/useLiveMetrics'
import { useMiniAlerts, useLivePolling } from './hooks/useMiniAlerts'
import { useChatAttention } from './hooks/useChatAttention'
import { usePrivacy } from './lib/privacy'
import { NowPane } from './components/NowPane'
import { MiniArcs } from './components/MiniArcs'
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
import { formatCost, formatTokenCount } from './lib/formatters'
import { desktop } from './lib/desktop'

type Tab = 'today' | 'projects' | 'history' | 'insights'
type Provider = 'all' | 'claude' | 'codex'
const tabs: Tab[] = ['today', 'projects', 'history', 'insights']
const Panel = ({ children, wide = false, delay = 0 }: { children: React.ReactNode; wide?: boolean; delay?: number }) => <section className={`surface rise ${wide ? 'wide' : ''}`} style={{ animationDelay: `${delay}ms` }}>{children}</section>

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [desktopError, setDesktopError] = useState('')
  useEffect(() => {
    const failed = () => setDesktopError('A desktop operation failed. Try Refresh, or restart the app.')
    const ready = () => setDesktopError('')
    window.addEventListener('desktop-error', failed)
    window.addEventListener('desktop-ready', ready)
    return () => { window.removeEventListener('desktop-error', failed); window.removeEventListener('desktop-ready', ready) }
  }, [])
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
  const alerts = useMiniAlerts({ claude: allData.claudeLimits, codex: allData.codexLimits })
  const livePolling = useLivePolling()
  const attention = useChatAttention(allData, alerts.enabled)
  const { maskName } = usePrivacy()
  const waitingLabel = attention.waiting.length > 1 ? `${attention.waiting.length} chats need your reply` : attention.waiting[0] ? `${attention.waiting[0].provider === 'codex' ? 'Codex' : 'Claude'} needs your reply` : null
  const waitingTitle = attention.waiting.map(s => `${s.provider === 'codex' ? 'Codex' : 'Claude'} · ${maskName(s.projectPath || s.projectName, s.projectName)} · ${s.attention?.kind === 'approval' ? 'approval requested' : 'question waiting'}`).join('\n')
  const data = provider === 'all' ? allData : allData.providers[provider] || allData
  const metrics = useLiveMetrics(data)
  // The widget always summarises every provider, whatever the full window's filter.
  const allMetrics = useLiveMetrics(allData)
  const unknown = data.sessions.filter(s => !s.costKnown && s.dataQuality !== 'history-only').length
  const api = desktop
  useEffect(() => {
    const cleanup = api?.onWindowState(setWindowState)
    api?.getWindowState().then(setWindowState).catch(() => {})
    return cleanup
  }, [api])

  if (compact) return <main className={`app-shell mini-shell drag-region ${alerts.warning ? 'orb-warning' : ''} ${alerts.pulse ? 'orb-notify' : ''} ${waitingLabel ? 'orb-chat-waiting' : ''} ${attention.pulse ? 'orb-chat-notify' : ''}`}>
    <div className="orb-ring" aria-hidden="true" />
    <div className="orb-stage" style={{ transform: `translate(-50%, -50%) scale(${Math.max(1, miniSize - 2) / 340})` }}>
      {allData.lastUpdated > 0 && <MiniArcs rows={alerts.rows} claudeStatus={allData.claudeLimitsStatus} />}
      <div className="orb-topline"><span className="mini-pinned" title="Always on top"><span className="status-dot" />Pinned</span><button className="no-drag orb-alert-toggle" aria-label="Toggle mini notifications" aria-pressed={alerts.enabled} title="Pulse for new unanswered input requests and a Claude or Codex allowance crossing 80% or 95%" onClick={alerts.toggle}>Alerts {alerts.enabled ? 'on' : 'off'}</button></div>
      <div className="orb-content">
        <span className="eyebrow">TODAY · ALL PROVIDERS</span>
        {desktopError && <p role="alert" className="orb-error">Refresh failed. Try ↻ again.</p>}
        {allData.lastUpdated === 0 ? <p className="orb-loading">Reading local activity…</p> : <MiniOverview metrics={allMetrics} warning={alerts.warning} chatStatus={waitingLabel ? <button className="no-drag orb-chat-status" aria-label="Dismiss chat notification" title={`${waitingTitle}\nClick to dismiss this notification; this does not answer the chat.`} onClick={attention.dismiss}>{waitingLabel}</button> : undefined} />}
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

  return <div className="app-shell">
    <header className="titlebar drag-region">
      <div className="brand" title="Your Codex + Claude companion"><span className="brand-mark" aria-hidden="true" /><span>AI <b>Companion</b></span></div>
      <div className="provider-filter no-drag" role="group" aria-label="Filter by provider">{(['all', 'claude', 'codex'] as const).map(p => <button key={p} aria-pressed={provider === p} className={provider === p ? 'active' : ''} onClick={() => setProvider(p)}>{p === 'all' ? 'All' : p === 'claude' ? 'Claude' : 'Codex'}</button>)}</div>
      <div className="titlebar-right no-drag">
        <span className="sync-label">{allData.lastUpdated ? `Updated ${new Date(allData.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Reading local activity…'}</span>
        <button className="refresh-button" onClick={() => api?.requestRefresh?.()} aria-label="Refresh usage data" title="Refresh">↻</button>
        <div className="window-actions">
          <button aria-label="Open mini overview" title="Small overview · always on top" className="mode-button" onClick={() => api?.windowAction('compact')}>Mini</button>
          <button aria-label="Toggle always on top" title={pinned ? 'Unpin window' : 'Keep window on top'} aria-pressed={pinned} onClick={() => api?.windowAction('pin')} className={`pin-button ${pinned ? 'selected' : ''}`}>Pin</button>
          <button aria-label="Minimize window" onClick={() => api?.windowAction?.('minimize')}>−</button>
          <button aria-label="Maximize or restore window" onClick={() => api?.windowAction?.('maximize')}>□</button>
          <button aria-label="Close window" onClick={() => api?.windowAction?.('close')}>×</button>
        </div>
      </div>
    </header>
    {desktopError && <p role="alert" className="desktop-error">{desktopError}</p>}
    {allData.lastUpdated === 0 ? <div className="empty-state">Loading your local usage history…</div> : <div className="workspace">
      <NowPane provider={provider} data={allData} metrics={metrics} waiting={attention.waiting} onDismiss={attention.dismiss} livePolling={livePolling} onOpenWidget={() => api?.windowAction('compact')} />
      <main className="then">
        <nav className="then-tabs" aria-label="Main navigation">
          {tabs.map(tab => <button key={tab} aria-current={activeTab === tab ? 'page' : undefined} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
          <span className="then-meta">{metrics.streak} day streak</span>
        </nav>
        <div className="then-body">
          {activeTab === 'today' && <div className="dashboard-grid">
            <Panel wide><TokenChart dailyMetrics={data.dailyMetrics} /></Panel>
            <Panel wide delay={100}><ActivityTimeline sessions={data.sessions} /></Panel>
            <Panel wide delay={200}><SessionList sessions={metrics.todaySessions} title="Today's sessions" maxItems={10} /><button className="link-button panel-link" onClick={() => setActiveTab('history')}>All sessions →</button></Panel>
          </div>}
          {activeTab === 'projects' && <Panel><ProjectList projects={data.projects} fullHeight /></Panel>}
          {activeTab === 'history' && <div className="dashboard-grid">{provider !== 'codex' && <Panel wide><HistoricalCoverage data={data} /></Panel>}<Panel wide delay={100}><SessionList sessions={data.sessions} title="Session history" maxItems={50} fullHeight /></Panel></div>}
          {activeTab === 'insights' && <div className="dashboard-grid">
            <Panel><WeekComparison thisWeek={data.weekComparison.thisWeek} lastWeek={data.weekComparison.lastWeek} /></Panel>
            <Panel delay={60}><CacheEfficiency sessions={data.sessions} /></Panel>
            <Panel delay={120}><CostBreakdown sessions={data.sessions} /></Panel>
            <Panel delay={180}><ModelDistribution sessions={data.sessions} /></Panel>
            <Panel wide delay={240}><ContextHealth sessions={data.sessions} /></Panel>
            <Panel wide delay={300}><ActivityHeatmap dailyMetrics={data.dailyMetrics} /></Panel>
            <Panel delay={360}><AllTimeStats data={data} /></Panel>
            <Panel delay={420}><ExportButton data={data} provider={provider} /></Panel>
          </div>}
          {data.sessions.length === 0 && <div className="empty-state"><h2>No recorded sessions yet</h2><p>Use {provider === 'all' ? 'Claude or Codex' : provider} on this computer. Local activity will appear here automatically.</p></div>}
          <footer className="data-note">Dollar values are standard API estimates, not your subscription bill. {unknown > 0 && `${unknown} sessions include unpriced models; their unpriced tokens are excluded from dollar totals. `}Active time is an estimate. Historical entries without transcripts count toward sessions and projects, but their missing usage is not included in token or cost totals. Saved Claude aggregate history is shown separately under History.</footer>
        </div>
      </main>
    </div>}
  </div>
}

function MiniOverview({ metrics, warning, chatStatus }: { metrics: ReturnType<typeof useLiveMetrics>; warning: string | null; chatStatus?: React.ReactNode }) {
  return <>
    <div className="orb-total"><strong>{formatTokenCount(metrics.todayTotalTokens)}</strong><span>tokens today</span></div>
    <div className="orb-stats"><span><b>{metrics.todaySessionCount}</b> sessions</span><span title="Standard API estimate, not your subscription bill"><b>{formatCost(metrics.todayCost)}</b> API est.</span></div>
    <div className="orb-status" role="status">{chatStatus ?? warning ?? <><span className={`live-dot ${metrics.isActive ? 'on' : ''}`} aria-hidden="true" />{metrics.isActive ? 'Activity in the last 2 min' : 'No recent activity'}</>}</div>
  </>
}

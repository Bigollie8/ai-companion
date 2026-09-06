import React from 'react'
import { formatTokenCount, formatCost, formatDuration } from '../lib/formatters'
interface Props { sessionCount: number; totalTokens: number; cost: number; cacheSavings: number; activeTimeMs: number; projectCount: number }
export function KPICards(p: Props) {
  const cards = [
    ['Tokens', formatTokenCount(p.totalTokens), 'Input, output & cache'],
    ['Sessions', String(p.sessionCount), `${p.projectCount} active projects`],
    ['Active time', formatDuration(p.activeTimeMs), 'Estimated, excluding idle gaps'],
    ['API estimate', formatCost(p.cost), 'Known model rates only'],
    ['Cache savings', formatCost(p.cacheSavings), 'Estimated at known rates']
  ]
  return <section className="today-section"><div className="section-heading"><h2>Today</h2><span>{new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></div><div className="kpi-grid">{cards.map(([label, value, hint], i) => <div className={`kpi-card ${i === 0 ? 'primary' : ''}`} key={label}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-hint">{hint}</div></div>)}</div></section>
}

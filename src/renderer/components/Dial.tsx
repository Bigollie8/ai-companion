import React from 'react'
import { arc } from '../lib/dial'

interface Props {
  /** Null draws an empty gauge with a dash in the middle. */
  percent: number | null
  color: string
  label: string
  detail?: string
  tag?: string
  size?: number
  /** Entrance stagger in milliseconds. */
  delay?: number
  warn?: boolean
}

export function Dial({ percent, color, label, detail, tag, size = 72, delay = 0, warn = false }: Props) {
  const radius = size / 2 - 6
  const geometry = arc(percent ?? 0, radius)
  const centre = size / 2
  const stroke = warn ? 'var(--warn)' : color
  return <div className={`dial-row ${warn ? 'warn' : ''}`}>
    <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="dial">
      <circle cx={centre} cy={centre} r={radius} fill="none" stroke="var(--track)" strokeWidth={6} strokeLinecap="round" strokeDasharray={geometry.trackDash} transform={`rotate(${geometry.rotate} ${centre} ${centre})`} />
      {percent != null && <circle key={Math.round(percent)} cx={centre} cy={centre} r={radius} fill="none" stroke={stroke} strokeWidth={6} strokeLinecap="round" strokeDasharray={geometry.fillDash} transform={`rotate(${geometry.rotate} ${centre} ${centre})`} className="dial-fill" style={{ ['--circ' as string]: geometry.circumference.toFixed(2), animationDelay: `${delay}ms` }} />}
      <text x={centre} y={centre + 5} textAnchor="middle" fontSize={size >= 72 ? 15 : 11} fontWeight={600} fill="var(--text-strong)">{percent == null ? '–' : `${Math.round(percent)}%`}</text>
    </svg>
    <div className="dial-text" role="group" aria-label={`${label}: ${percent == null ? 'no data' : `${Math.round(percent)} percent used`}`}>
      <b>{label}</b>
      {detail && <span>{detail}</span>}
      {tag && <small>{tag}</small>}
    </div>
  </div>
}

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { DashboardData } from './types'

type WindowState = { compact: boolean; pinned: boolean }
export interface DesktopAPI {
  resizeMini: (size: number) => void
  getWindowState: () => Promise<WindowState>
  onWindowState: (callback: (state: WindowState) => void) => () => void
  onDataUpdate: (callback: (data: DashboardData) => void) => () => void
  requestRefresh: () => void
  windowAction: (action: 'pin' | 'compact' | 'minimize' | 'maximize' | 'close') => void
  exportCSV: (range: { from: number; to: number }, hidden?: string[], provider?: 'all' | 'claude' | 'codex') => Promise<string>
}
const report = (error: unknown) => {
  console.error('Desktop operation failed:', error)
  window.dispatchEvent(new CustomEvent('desktop-error', { detail: String(error) }))
}
const preferenceKeys = ['dashboard.hiddenProjects', 'mini-alerts', 'claude-limits']
export async function loadPreferences(): Promise<void> {
  const values = await invoke<Record<string, string>>('renderer_preferences')
  for (const key of preferenceKeys) {
    if (typeof values[key] === 'string') localStorage.setItem(key, values[key])
  }
}
let preferenceWrites = Promise.resolve()
export function savePreferences(): void {
  const values = Object.fromEntries(preferenceKeys.map(key => [key, localStorage.getItem(key)]).filter(([,value]) => value !== null))
  preferenceWrites = preferenceWrites.then(() => invoke<void>('save_renderer_preferences', { values })).catch(report)
}
function subscribe<T>(event: string, callback: (value: T) => void): () => void {
  let disposed = false
  let off: (() => void) | undefined
  listen<T>(event, e => { if (!disposed) callback(e.payload) }).then(unlisten => {
    if (disposed) unlisten()
    else off = unlisten
  }).catch(report)
  return () => { disposed = true; off?.() }
}
const subscribers = new Set<(data: DashboardData) => void>()
let refreshing = false
let refreshAgain = false
const publish = (data: DashboardData) => {
  window.dispatchEvent(new Event('desktop-ready'))
  subscribers.forEach(callback => callback(data))
}
export const desktop: DesktopAPI = {
  resizeMini: size => { void invoke('resize_mini', { size }).catch(report) },
  getWindowState: () => invoke('get_window_state'),
  onWindowState: callback => subscribe('window:state', callback),
  onDataUpdate: callback => {
    subscribers.add(callback)
    const off = subscribe<DashboardData>('data:update', data => {
      window.dispatchEvent(new Event('desktop-ready'))
      callback(data)
    })
    return () => { subscribers.delete(callback); off() }
  },
  requestRefresh: () => {
    if (refreshing) { refreshAgain = true; return }
    refreshing = true
    invoke<DashboardData>('refresh_data').then(publish).catch(report).finally(() => {
      refreshing = false
      if (refreshAgain) { refreshAgain = false; desktop.requestRefresh() }
    })
  },
  windowAction: action => { void invoke('window_action', { action }).catch(report) },
  exportCSV: (range, hidden = [], provider = 'all') => invoke('export_csv', { range, hidden, provider })
}

// WebView2 does not implement Electron's CSS app-region behavior.
document.addEventListener('mousedown', event => {
  const element = event.target instanceof Element ? event.target : null
  if (event.button === 0 && element?.closest('.drag-region') && !element.closest('.no-drag,button,a,input,select,textarea')) {
    event.preventDefault()
    void getCurrentWindow().startDragging().catch(report)
  }
})

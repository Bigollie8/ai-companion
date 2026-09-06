import { contextBridge, ipcRenderer } from 'electron'
import type { DashboardData } from '../main/parser/types'

export interface ElectronAPI {
  resizeMini: (size: number) => void
  getWindowState: () => Promise<{ compact: boolean; pinned: boolean }>
  onWindowState: (callback: (state: { compact: boolean; pinned: boolean }) => void) => () => void
  onDataUpdate: (callback: (data: DashboardData) => void) => () => void
  requestRefresh: () => void
  windowAction: (action: 'pin' | 'compact' | 'minimize' | 'maximize' | 'close') => void
  exportCSV: (
    dateRange: { from: number; to: number },
    hiddenProjectKeys?: string[],
    provider?: 'all' | 'claude' | 'codex'
  ) => Promise<string>
}

contextBridge.exposeInMainWorld('electronAPI', {
  resizeMini: (size: number) => ipcRenderer.send('window:resize-mini', size),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  onWindowState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: { compact: boolean; pinned: boolean }) => callback(state)
    ipcRenderer.on('window:state', handler)
    return () => ipcRenderer.removeListener('window:state', handler)
  },
  onDataUpdate: (callback: (data: DashboardData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DashboardData) => callback(data)
    ipcRenderer.on('data:update', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('data:update', handler)
  },
  windowAction: (action) => ipcRenderer.send('window:action', action),
  requestRefresh: () => {
    ipcRenderer.send('data:refresh')
  },
  exportCSV: (
    dateRange: { from: number; to: number },
    hiddenProjectKeys: string[] = [],
    provider: 'all' | 'claude' | 'codex' = 'all'
  ) => {
    return ipcRenderer.invoke('export:csv', dateRange, hiddenProjectKeys, provider)
  }
} satisfies ElectronAPI)

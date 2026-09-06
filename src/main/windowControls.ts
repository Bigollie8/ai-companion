import { app, ipcMain, powerMonitor, screen, type BrowserWindow, type Rectangle } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname, join } from 'path'

const MINI_SIZE = 340
const MINI_MIN = 240
const MINI_MAX = 640
// The floating level is reordered behind the taskbar by Electron on Windows,
// which can clear topmost on some shell configurations. Use the overlay level.
const PIN_LEVEL = process.platform === 'win32' ? 'pop-up-menu' : 'floating'

export function fitBounds(bounds: Rectangle): Rectangle {
  const area = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return { width, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) }
}

export function setupWindowControls(window: BrowserWindow, stateFile = join(app.getPath('userData'), 'window-state.json'), defaultPinned = true) {
  let saved: { compact?: boolean; pinned?: boolean; miniBounds?: Rectangle } = {}
  try { saved = JSON.parse(readFileSync(stateFile, 'utf8')) ?? {} } catch {}
  let compact = false
  let fullBounds = window.getBounds()
  let miniBounds: Rectangle | null = saved.miniBounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved.miniBounds![key as keyof Rectangle])) ? saved.miniBounds : null
  let fullPinned = typeof saved.pinned === 'boolean' ? saved.pinned : defaultPinned
  let fullMaximized = false
  const persist = () => {
    try {
      mkdirSync(dirname(stateFile), { recursive: true })
      writeFileSync(stateFile + '.tmp', JSON.stringify({ compact, pinned: fullPinned, miniBounds: compact ? window.getBounds() : miniBounds }))
      renameSync(stateFile + '.tmp', stateFile)
    } catch (error) { console.warn('Could not save window preferences', error) }
  }
  const state = () => ({ compact, pinned: window.isAlwaysOnTop() })
  const publish = () => { if (!window.isDestroyed()) window.webContents.send('window:state', state()) }
  const applyPin = (pinned: boolean) => {
    window.setAlwaysOnTop(pinned, PIN_LEVEL)
    if (pinned && window.isVisible() && !window.isMinimized()) window.moveTop()
    publish()
  }
  const restorePin = () => { if (!window.isDestroyed()) applyPin(compact || fullPinned) }
  const applyShape = () => {
    if (process.platform !== 'win32' && process.platform !== 'linux') return
    const { width, height } = window.getBounds()
    const radius = Math.min(width, height) / 2
    window.setShape(compact ? Array.from({ length: height }, (_, y) => {
      const half = Math.sqrt(Math.max(0, radius ** 2 - (y + .5 - height / 2) ** 2))
      const x = Math.ceil(width / 2 - half)
      return { x, y, width: Math.max(1, width - 2 * x), height: 1 }
    }) : [])
  }
  const toggleCompact = () => {
    if (!compact) {
      fullBounds = window.getNormalBounds()
      fullMaximized = window.isMaximized()
      compact = true
      if (fullMaximized) window.unmaximize()
      window.setMinimumSize(MINI_MIN, MINI_MIN)
      const area = screen.getDisplayMatching(miniBounds ?? fullBounds).workArea
      const size = Math.min(area.width, area.height, Math.max(MINI_MIN, Math.min(MINI_MAX, miniBounds?.width ?? MINI_SIZE)))
      window.setBounds(fitBounds({ x: miniBounds?.x ?? fullBounds.x + fullBounds.width - size, y: miniBounds?.y ?? fullBounds.y, width: size, height: size }))
      window.setResizable(false)
      window.setMaximizable(false)
      applyShape()
      applyPin(true)
    } else {
      miniBounds = window.getBounds()
      compact = false
      applyShape()
      window.setResizable(true)
      window.setMaximizable(true)
      window.setMinimumSize(360, 360)
      window.setBounds(fitBounds(fullBounds))
      if (fullMaximized) window.maximize()
      applyPin(fullPinned)
    }
    persist()
    publish()
  }
  const resizeHandler = (event: Electron.IpcMainEvent, requestedSize: number) => {
    if (event.sender !== window.webContents || !compact || !Number.isFinite(requestedSize)) return
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const size = Math.round(Math.min(area.width, area.height, Math.max(MINI_MIN, Math.min(MINI_MAX, requestedSize))))
    window.setBounds(fitBounds({ ...bounds, width: size, height: size }))
    applyShape()
    persist()
  }
  ipcMain.on('window:resize-mini', resizeHandler)
  const actionHandler = (event: Electron.IpcMainEvent, action: string) => {
    if (event.sender !== window.webContents) return
    if (action === 'compact') toggleCompact()
    if (action === 'pin' && !compact) { fullPinned = !fullPinned; applyPin(fullPinned); persist() }
    if (action === 'minimize') window.minimize()
    if (action === 'maximize') { if (compact) toggleCompact(); else window.isMaximized() ? window.unmaximize() : window.maximize() }
    if (action === 'close') window.close()
  }
  ipcMain.on('window:action', actionHandler)
  ipcMain.handle('window:get-state', () => state())
  window.on('always-on-top-changed', publish)
  window.on('show', restorePin)
  window.on('show', applyShape)
  window.on('resize', applyShape)
  window.on('restore', restorePin)
  window.on('moved', persist)
  window.on('close', persist)
  powerMonitor.on('resume', restorePin)
  powerMonitor.on('unlock-screen', restorePin)
  // Reassert the native topmost flag if Windows resets it after a shell/display change.
  const pinWatch = setInterval(() => {
    if (!window.isDestroyed() && window.isVisible() && !window.isMinimized() && (compact || fullPinned) && !window.isAlwaysOnTop()) restorePin()
  }, 3000)
  window.once('closed', () => {
    ipcMain.removeListener('window:action', actionHandler)
    ipcMain.removeListener('window:resize-mini', resizeHandler)
    ipcMain.removeHandler('window:get-state')
    clearInterval(pinWatch)
    powerMonitor.removeListener('resume', restorePin)
    powerMonitor.removeListener('unlock-screen', restorePin)
  })
  restorePin()
  if (saved.compact === true) toggleCompact()
  return { isCompact: () => compact }
}

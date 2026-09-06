import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import assert from 'node:assert/strict'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { setupWindowControls } from '../src/main/windowControls'

const phase = process.argv[2]
const stateFile = join(__dirname, 'restart-window-state.json')
app.setPath('userData', join(__dirname, 'restart-profile'))
const settle = () => new Promise(resolve => setTimeout(resolve, 200))
app.whenReady().then(async () => {
  try {
    if (phase === 'save') writeFileSync(stateFile, '{}')
    const win = new BrowserWindow({ show: false, frame: false, transparent: true, thickFrame: false, hasShadow: false, width: 900, height: 700 })
    const controls = setupWindowControls(win, stateFile, false)
    win.showInactive()
    await settle()
    const action = async (name: string) => { ipcMain.emit('window:action', { sender: win.webContents }, name); await settle() }
    if (phase === 'save') {
      await action('pin')
      assert.equal(win.isAlwaysOnTop(), true)
      await action('compact')
      ipcMain.emit('window:resize-mini', { sender: win.webContents }, 420)
      await settle()
      assert.equal(win.getBounds().width, 420)
      assert.equal(win.getBounds().height, 420)
    } else if (phase === 'restore') {
      assert.equal(controls.isCompact(), true)
      assert.equal(win.isAlwaysOnTop(), true)
      assert.equal(win.getBounds().width, 420)
      assert.equal(win.getBounds().height, 420)
      win.setAlwaysOnTop(false)
      await settle()
      powerMonitor.emit('resume')
      await settle()
      assert.equal(win.isAlwaysOnTop(), true)
      await action('compact')
      assert.equal(win.isAlwaysOnTop(), true)
      assert.equal(win.getBounds().width, 900)
      await action('pin')
    } else {
      assert.equal(controls.isCompact(), false)
      assert.equal(win.isAlwaysOnTop(), false)
      powerMonitor.emit('unlock-screen')
      await settle()
      assert.equal(win.isAlwaysOnTop(), false)
    }
    win.close()
    console.log(`Window restart phase passed: ${phase}`)
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})

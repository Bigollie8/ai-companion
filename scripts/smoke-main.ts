import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import assert from 'node:assert/strict'
import { aggregateSessions, aggregateAllData } from '../src/main/parser/aggregator'
import { parseHistory } from '../src/main/parser/history'
import { exportSessionsCSV } from '../src/main/csv'
import type { ParsedSession } from '../src/main/parser/conversations'
import { setupWindowControls } from '../src/main/windowControls'
const root = resolve(__dirname, '..')
app.setPath('userData', join(root, '.test-out/smoke-profile'))
const errors: string[] = []
const delay = (ms = 150) => new Promise(r => setTimeout(r, ms))
const sample = (i: number): ParsedSession => {
  const provider = i % 2 ? 'claude' : 'codex'
  const timestamp = Date.now() - (i % 14) * 86400000 - 30000
  const tokens = { inputTokens: 14000 + i * 100, outputTokens: 6000, cacheCreationTokens: 0, cacheReadTokens: 90000 }
  return { provider, costKnown: true, sessionId: `test-${i}`, projectPath: `C:/Projects/${['Editor', 'Companion', 'Backend', 'Library'][i % 4]}`, projectName: ['Editor', 'Companion', 'Backend', 'Library'][i % 4], entrypoint: provider, gitBranch: 'feat/usage-monitor', slug: 'Sample session',
    messages: [{ type: 'user', timestamp: timestamp - 240000 }, { type: 'assistant', timestamp, model: provider === 'codex' ? 'gpt-6-astra' : 'claude-opus-4-6', tokenUsage: tokens, cost: .54, cacheSavings: .3, contextTokens: 65000, contextPct: 25 }],
    totalTokens: tokens, totalCost: .54, totalCacheSavings: .3, totalWebSearches: 1, totalWebFetches: 0, primaryModel: provider === 'codex' ? 'gpt-6-astra' : 'claude-opus-4-6', autoCompactions: i % 3 }
}
app.whenReady().then(async () => {
  const sessions = Array.from({ length: 140 }, (_, i) => sample(i))
  const historical: ParsedSession = { ...sample(0), provider: 'claude', sessionId: 'historical-test', projectPath: 'C:/Projects/Historical', projectName: 'Historical', dataQuality: 'history-only', historySource: 'history', costKnown: false, primaryModel: 'Not recorded', messages: [{ type: 'user', timestamp: Date.parse('2026-01-16T12:00:00') }], totalTokens: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }, totalCost: 0, totalCacheSavings: 0 }
  sessions.push(historical)
  const archive = { firstSessionAt: Date.parse('2026-01-16T12:00:00'), throughDate: '2026-02-16', sessionCount: 120, messageCount: 2400, tokenUsage: { inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 12000000, cacheCreationTokens: 3000 }, models: [], dailyActivity: [] }
  const fixture = { claudeArchive: archive, ...aggregateSessions(sessions), providers: { claude: { ...aggregateSessions(sessions.filter(s => s.provider === 'claude')), claudeArchive: archive }, codex: aggregateSessions(sessions.filter(s => s.provider === 'codex')) }, codexLimits: { observedAt: Date.now() - 180000, primary: { usedPercent: 31, windowMinutes: 10080, resetsAt: Date.now() + 6 * 86400000 }, secondary: null } }
  fixture.sessions[1].attention = { requestId: 'already-waiting-at-launch', requestedAt: Date.now(), kind: 'question' }
  const window = new BrowserWindow({ show: false, frame: false, transparent: true, thickFrame: false, hasShadow: false, backgroundColor: '#00000000', width: 1140, height: 940, webPreferences: { preload: join(root, 'out/preload/index.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  const stateFile = join(root, '.test-out/smoke-window-state.json')
  writeFileSync(stateFile, '{}')
  setupWindowControls(window, stateFile, false)
  window.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message) })
  window.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason))
  ipcMain.on('data:refresh', () => window.webContents.send('data:update', fixture))
  ipcMain.handle('export:csv', (_event, range, hidden, provider) => exportSessionsCSV(fixture, range, hidden, provider))
  const js = (code: string) => window.webContents.executeJavaScript(code)
  const click = async (selector: string) => { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay() }
  const screenshot = async (name: string) => { await delay(350); writeFileSync(join(root, '.test-out', name + '.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()) }
  try {
    await window.webContents.session.clearStorageData()
    await window.loadFile(join(root, 'out/renderer/index.html'))
    for (let i = 0; i < 50; i++) { if (await js("document.body.innerText.includes('Codex allowance')")) break; await delay(100) }
    assert.ok(await js("document.body.innerText.includes('31%')"))
    const originalBounds = window.getBounds()
    await click('[aria-label="Toggle always on top"]')
    assert.equal(window.isAlwaysOnTop(), true)
    window.setAlwaysOnTop(false); await delay()
    assert.equal(await js("document.querySelector('[aria-label=\"Toggle always on top\"]').getAttribute('aria-pressed')"), 'false')
    window.emit('restore'); await delay()
    assert.equal(window.isAlwaysOnTop(), true)
    await click('[aria-label="Toggle always on top"]')
    for (let i = 0; i < 3; i++) {
      await click('[aria-label="Open mini overview"]')
      assert.equal(window.isAlwaysOnTop(), true)
      assert.equal(window.getBounds().width, 340)
      assert.equal(window.getBounds().height, 340)
      assert.equal(window.isResizable(), false)
      assert.ok(await js("document.body.innerText.includes('Pinned') && document.body.innerText.includes('31%')"))
      assert.ok(await js("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth"))
      if (i === 0) {
        await screenshot('mini-overview')
        await js("window.electronAPI.resizeMini(240)"); await delay()
        assert.equal(window.getBounds().width, 240)
        assert.equal(window.getBounds().height, 240)
        await screenshot('mini-small')
        await js("document.querySelector('[aria-label=\"Resize mini window\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))"); await delay()
        assert.equal(window.getBounds().width, 260)
        await js("window.electronAPI.resizeMini(480)"); await delay()
        assert.equal(window.getBounds().height, 480)
        await screenshot('mini-large')
        await js("window.electronAPI.resizeMini(340)"); await delay()
        for (const size of [240, 340, 480, 640]) {
          await js(`window.electronAPI.resizeMini(${size})`); await delay()
          assert.ok(await js(`(() => {
            const radius = innerWidth / 2 - 4;
            return [...document.querySelectorAll('.orb-content button, .orb-content span, .orb-content strong, .orb-content small, .orb-status, .orb-resize')].every(el => {
              const r = el.getBoundingClientRect();
              return [[r.left,r.top],[r.right,r.top],[r.left,r.bottom],[r.right,r.bottom]].every(([x,y]) => Math.hypot(x-innerWidth/2,y-innerHeight/2) < radius);
            });
          })()`), `Mini contents must stay inside the circle at ${size}px`)
        }
        await js("window.electronAPI.resizeMini(340)"); await delay()
        const reportLimit = async (percent: number, expired = false) => {
          window.webContents.send('data:update', { ...fixture, codexLimits: { ...fixture.codexLimits, observedAt: Date.now(), secondary: { usedPercent: percent, windowMinutes: 300, resetsAt: expired ? Date.now() - 1000 : fixture.codexLimits.primary.resetsAt } } }); await delay()
        }
        await reportLimit(70)
        await reportLimit(80)
        assert.ok(await js("!!document.querySelector('.orb-warning.orb-notify') && document.body.innerText.includes('5h · 80%')"))
        await screenshot('mini-notification')
        await click('[aria-label="Toggle mini notifications"]')
        await reportLimit(95)
        assert.ok(await js("!document.querySelector('.orb-notify') && document.body.innerText.includes('Almost at your Codex limit')"))
        await click('[aria-label="Toggle mini notifications"]')
        assert.ok(await js("!document.querySelector('.orb-notify')"))
        await reportLimit(95, true)
        assert.ok(await js("!document.querySelector('.orb-warning')"))
        window.webContents.send('data:update', fixture); await delay()
        assert.ok(await js("!document.querySelector('.orb-chat-waiting')"), 'Do not replay waiting chats present at startup')
        const sendAttention = async (requestId: string, age = 0) => {
          window.webContents.send('data:update', { ...fixture, sessions: fixture.sessions.map((s, index) => index === 0 ? { ...s, attention: { requestId, requestedAt: Date.now() - age, kind: 'question' } } : s) }); await delay()
        }
        await sendAttention('already-stale', 11 * 60000)
        await delay(4100)
        assert.ok(await js("!document.querySelector('.orb-chat-waiting')"))
        await sendAttention('answered-quickly')
        window.webContents.send('data:update', fixture); await delay(4100)
        assert.ok(await js("!document.querySelector('.orb-chat-notify')"))
        await sendAttention('needs-feedback')
        await delay(4100)
        assert.ok(await js("!!document.querySelector('.orb-chat-notify') && document.body.innerText.includes('needs your reply')"))
        await screenshot('mini-chat-attention')
        await click('[aria-label="Dismiss chat notification"]')
        assert.ok(await js("!document.querySelector('.orb-chat-waiting')"))
        await sendAttention('needs-feedback')
        assert.ok(await js("!document.querySelector('.orb-chat-notify')"))
        await sendAttention('another-question')
        await delay(4100)
        assert.ok(await js("!!document.querySelector('.orb-chat-waiting')"))
        window.webContents.send('data:update', fixture); await delay()
        assert.ok(await js("!document.querySelector('.orb-chat-waiting') && !document.querySelector('.orb-chat-notify')"))
      }
      await click('[aria-label="Return to full dashboard"]')
      assert.equal(window.isAlwaysOnTop(), false)
      assert.deepEqual(window.getBounds(), originalBounds)
      assert.equal(window.isResizable(), true)
    }
    if (process.argv.includes('--mini')) {
      assert.deepEqual(errors, [])
      console.log('Mini checks passed: circular containment at 240–640px, resize, restart persistence, threshold pulse, alert toggle, expired limits, full-window restoration.')
      app.exit(0)
      return
    }
    await click('[aria-label="Toggle always on top"]')
    await click('[aria-label="Open mini overview"]')
    await window.webContents.reload(); await delay(500)
    assert.ok(await js("!!document.querySelector('.mini-shell')"))
    await click('[aria-label="Return to full dashboard"]')
    assert.equal(window.isAlwaysOnTop(), true)
    await click('[aria-label="Toggle always on top"]')
    await screenshot('overview-wide')
    await click('.provider-filter button:nth-child(3)')
    assert.equal(await js("document.querySelectorAll('.provider-row').length"), 1)
    await click('nav button:nth-child(3)')
    assert.ok(await js("document.body.innerText.toLowerCase().includes('session history (70)')"))
    await click('.load-more')
    assert.ok(!(await js("document.querySelector('.load-more')")))
    await js(`(() => { const input = document.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no-matching-project'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    await delay()
    assert.ok(await js("document.body.innerText.includes('No sessions match')"))
    await click('.provider-filter button:first-child')
    await click('nav button:nth-child(2)')
    await js("[...document.querySelectorAll('[aria-label=\"Hide project\"]')].find(b => b.parentElement.innerText.includes('Editor')).click()"); await delay()
    assert.ok(await js("document.body.innerText.toLowerCase().includes('hidden')"))
    await click('[title="Show hidden projects"]')
    assert.ok(await js("document.body.innerText.includes('Hidden Project')"))
    const csv = await js("window.electronAPI.exportCSV({ from: 0, to: Date.now() }, ['C:/Projects/Editor'], 'codex')")
    assert.ok(csv.includes('Hidden Project')); assert.ok(!csv.includes('"claude"')); assert.ok(!csv.includes('"Editor"'))
    await click('nav button:nth-child(4)')
    assert.ok(await js("document.body.innerText.toLowerCase().includes('context management') && document.body.innerText.includes('Export CSV') && document.body.innerText.toLowerCase().includes('cache efficiency')"))
    await js("navigator.clipboard.writeText = async text => { window.__testReport = text }; undefined")
    await js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Copy Report').click()")
    await delay()
    assert.ok(await js("window.__testReport.includes('Hidden Project') && !window.__testReport.includes('**Editor**') && window.__testReport.includes('Cached sessions: 120')"))
    await screenshot('insights-wide')
    await click('nav button:nth-child(3)')
    await click('.provider-filter button:nth-child(2)')
    await js("(() => { const select = document.querySelector('[aria-label=\"History month\"]'); select.value = '2026-01'; select.dispatchEvent(new Event('change', { bubbles: true })); })()")
    await delay()
    assert.ok(await js("document.body.innerText.includes('Historical entry · tokens unavailable')"))
    assert.ok(await js("document.body.innerText.includes('Saved Claude usage snapshot')"))
    await screenshot('historical-coverage-wide')
    await click('.provider-filter button:first-child')
    await click('nav button:first-child')
    window.setSize(420, 1000); await screenshot('overview-compact')
    assert.ok(await js("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth"))
    window.setSize(360, 850); await delay()
    assert.ok(await js("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth"))
    await click('nav button:nth-child(4)'); await delay()
    assert.ok(await js("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth"))
    const start = Date.now(); const real = aggregateAllData(); const elapsed = Date.now() - start
    console.log(JSON.stringify({ liveParseMs: elapsed, claudeSessions: real.providers.claude.sessions.length, codexSessions: real.providers.codex.sessions.length, hasCodexLimits: !!real.codexLimits }))
    const recoveredIds = new Set(real.providers.claude.sessions.map(s => s.sessionId))
    assert.ok([...parseHistory().keys()].every(id => recoveredIds.has(id)))
    assert.equal(real.sessions.length, real.providers.codex.sessions.length + real.providers.claude.sessions.length)
    window.webContents.send('data:update', real); await delay()
    assert.ok(await js("!document.body.innerText.includes('NaN')"))
    assert.deepEqual(errors, [])
    console.log('UI smoke passed: navigation, provider filtering, pagination, search, privacy, CSV, insights, compact layout, real local data. Screenshots: .test-out/*.png')
    app.exit(0)
  } catch (error) { console.error(error); console.error(errors); app.exit(1) }
})

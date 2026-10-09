import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeLimit, limitWarning, limitTiers, crossedTier, windowLabel, describeClaudeStatus } from '../src/renderer/lib/limits'
import type { UsageLimits } from '../src/shared/types'

const now = Date.parse('2026-10-03T12:00:00Z')
const hour = 3600000
const win = (usedPercent: number, windowMinutes: number, resetsAt: number | null) => ({ usedPercent, windowMinutes, resetsAt })
const snap = (primary: ReturnType<typeof win> | null, secondary: ReturnType<typeof win> | null, source: 'live' | 'transcript' = 'live', observedAt = now - 60000): UsageLimits => ({ observedAt, primary, secondary, source })

test('activeLimit prefers the busiest window that has not reset yet', () => {
  assert.deepEqual(activeLimit(null, now), { limit: null, expired: false })
  const both = snap(win(40, 300, now + hour), win(70, 10080, now + 24 * hour))
  assert.equal(activeLimit(both, now).limit?.usedPercent, 70)
  const stale = snap(win(90, 300, now - hour), win(20, 10080, now + 24 * hour))
  assert.deepEqual(activeLimit(stale, now), { limit: stale.secondary, expired: false })
  const allStale = snap(win(90, 300, now - hour), win(20, 10080, now - 2 * hour))
  assert.deepEqual(activeLimit(allStale, now), { limit: allStale.primary, expired: true })
  const noReset = snap(win(55, 300, null), null)
  assert.deepEqual(activeLimit(noReset, now), { limit: noReset.primary, expired: false })
})

test('limitWarning names the provider at 80% and 95%, never for a reset window', () => {
  assert.equal(limitWarning('claude', win(79.9, 300, now + hour), false), null)
  assert.equal(limitWarning('claude', win(80, 300, now + hour), false), 'Claude allowance running low')
  assert.equal(limitWarning('codex', win(95, 300, now + hour), false), 'Almost at your Codex limit')
  assert.equal(limitWarning('codex', win(99, 300, now - hour), true), null)
  assert.equal(limitWarning('claude', null, false), null)
})

test('limitTiers keys each live window and crossedTier only fires on an upward move', () => {
  const tiers = limitTiers(snap(win(85, 300, now + hour), win(20, 10080, now + 24 * hour)), now)
  assert.deepEqual(tiers, { [`0:300:${now + hour}`]: 1, [`1:10080:${now + 24 * hour}`]: 0 })
  assert.deepEqual(limitTiers(snap(win(99, 300, now - hour), null), now), {})
  assert.deepEqual(limitTiers(null, now), {})
  assert.equal(crossedTier(null, { a: 2 }), false)
  assert.equal(crossedTier({ a: 0 }, { a: 1 }), true)
  assert.equal(crossedTier({ a: 1 }, { a: 2 }), true)
  assert.equal(crossedTier({ a: 2 }, { a: 1 }), false)
  assert.equal(crossedTier({ a: 0 }, { b: 2 }), false)
})

test('windowLabel reads naturally in long and short forms', () => {
  assert.equal(windowLabel(300), '5-hour window')
  assert.equal(windowLabel(10080), '7-day window')
  assert.equal(windowLabel(30), '30-minute window')
  assert.equal(windowLabel(300, true), '5h')
  assert.equal(windowLabel(10080, true), '7d')
  assert.equal(windowLabel(30, true), '30m')
})

test('describeClaudeStatus explains where the figure came from or why there is none', () => {
  assert.equal(describeClaudeStatus('ok', snap(win(10, 300, null), null)), 'Live from your Claude account')
  assert.equal(describeClaudeStatus('ok', snap(win(100, 300, null), null, 'transcript')), 'From a limit notice in a local transcript')
  assert.equal(describeClaudeStatus('off', null), 'Live check is off')
  assert.equal(describeClaudeStatus('no-credentials', null), 'Sign in to Claude Code to enable the live check')
  assert.equal(describeClaudeStatus('expired', null), 'Claude Code sign-in expired · open Claude Code to renew it')
  assert.equal(describeClaudeStatus('error', null), 'Live check failed · retrying every 5 minutes')
  assert.equal(describeClaudeStatus('pending', null), 'Checking your Claude account…')
  assert.equal(describeClaudeStatus(undefined, null), 'Checking your Claude account…')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arc, ringArc } from '../src/renderer/lib/dial'

const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ''} ${a} != ${b}`)

test('arc describes a 270-degree gauge as dash lengths and a start rotation', () => {
  const gauge = arc(54, 30, 270)
  close(gauge.circumference, 188.5, 'circumference')
  close(gauge.track, 141.37, 'track')
  close(gauge.fill, 76.34, 'fill')
  assert.equal(gauge.rotate, 135)
  const dash = (length: number) => `${length.toFixed(2)} ${gauge.circumference.toFixed(2)}`
  assert.equal(gauge.trackDash, dash(gauge.track))
  assert.equal(gauge.fillDash, dash(gauge.fill))
})

test('arc clamps percent to 0..100 and never draws a zero-length fill', () => {
  close(arc(140, 30, 270).fill, arc(100, 30, 270).fill)
  close(arc(-5, 30, 270).fill, 0.5)
  close(arc(NaN, 30, 270).fill, 0.5)
})

test('ringArc mirrors the mini widget arcs across the top of the ring', () => {
  const left = ringArc(14, 'left')
  const right = ringArc(54, 'right')
  close(left.circumference, 955.04)
  close(left.track, 198.97)
  close(left.fill, 27.86)
  assert.equal(right.rotate, -75)
  assert.equal(right.transform, 'rotate(-75 170 170)')
  assert.equal(left.transform, 'matrix(-1 0 0 1 340 0) rotate(-75 170 170)')
  close(right.fill, 107.44)
})

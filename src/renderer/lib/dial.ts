/** Arc gauge geometry for SVG circles drawn with stroke-dasharray. */
export interface ArcGeometry {
  circumference: number
  track: number
  fill: number
  /** Rotation in degrees so the arc starts where the gauge should begin (SVG dashes start at 3 o'clock). */
  rotate: number
  trackDash: string
  fillDash: string
}

const MIN_FILL = 0.5

function geometry(percent: number, radius: number, sweepDeg: number, rotate: number): ArcGeometry {
  const circumference = 2 * Math.PI * radius
  const track = circumference * sweepDeg / 360
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
  const fill = Math.max(MIN_FILL, track * clamped / 100)
  const dash = (length: number) => `${length.toFixed(2)} ${circumference.toFixed(2)}`
  return { circumference, track, fill, rotate, trackDash: dash(track), fillDash: dash(fill) }
}

/** A gauge centred on 12 o'clock: a 270° sweep starts at 135° (bottom left) and ends bottom right. */
export function arc(percent: number, radius: number, sweepDeg = 270): ArcGeometry {
  return geometry(percent, radius, sweepDeg, 90 + (360 - sweepDeg) / 2)
}

export const RING_RADIUS = 152
export const RING_SWEEP = 75
/** The widget stage is 340px square, so its ring is centred at 170,170. */
export const RING_CENTRE = 170

/**
 * The mini widget's two arcs. Both start just off 12 o'clock and sweep outward and down, so they mirror
 * each other: the right one is drawn directly, the left one with `transform` flipped horizontally.
 */
export function ringArc(percent: number, side: 'left' | 'right'): ArcGeometry & { transform: string } {
  const g = geometry(percent, RING_RADIUS, RING_SWEEP, -RING_SWEEP)
  const rotate = `rotate(${g.rotate} ${RING_CENTRE} ${RING_CENTRE})`
  return { ...g, transform: side === 'left' ? `matrix(-1 0 0 1 ${RING_CENTRE * 2} 0) ${rotate}` : rotate }
}

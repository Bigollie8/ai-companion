export interface ModelPricing { input: number; output: number; cacheWrite: number; cacheRead: number }
const rate = (input: number, output: number, cacheRead: number, cacheWrite = input * 1.25): ModelPricing =>
  ({ input: input / 1e6, output: output / 1e6, cacheRead: cacheRead / 1e6, cacheWrite: cacheWrite / 1e6 })
// Standard API-equivalent estimates, verified 2026-09-04. Not subscription charges.
// https://developers.openai.com/api/docs/models/gpt-6-astra
// https://developers.openai.com/api/docs/models/gpt-5.3-codex
// https://platform.claude.com/docs/en/about-claude/pricing
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': rate(3, 15, .3),
  'claude-opus-4-6': rate(5, 25, .5),
  'claude-opus-4-5-20251101': rate(5, 25, .5),
  'claude-opus-4-8': rate(5, 25, .5),
  'claude-opus-5': rate(5, 25, .5),
  'claude-fable-5': rate(10, 50, 1),
  'claude-fable-5-1': rate(10, 50, .25),
  'claude-haiku-4-5-20251001': rate(1, 5, .1),
  'gpt-6-astra': rate(10, 50, 1),
  'gpt-5.3-codex': rate(1.75, 14, .175),
}
export function calculateCost(model: string, input: number, output: number, write: number, read: number): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0 // Explicitly excluded; caller marks costKnown=false.
  const longContext = model === 'gpt-6-astra' && input + write + read > 272000
  return (input * p.input + write * p.cacheWrite + read * p.cacheRead) * (longContext ? 2 : 1) + output * p.output * (longContext ? 1.5 : 1)
}

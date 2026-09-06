import type { ChatAttention } from './types'

// Read explicit input tools only. Prose questions, silence and tool execution
// are not proof that a human response is required.
export function parseChatAttention(records: any[], provider: 'codex' | 'claude'): ChatAttention | undefined {
  let active = false
  const pending = new Map<string, ChatAttention & { async: boolean }>()
  const clear = () => pending.clear()
  const request = (id: unknown, name: unknown, timestamp: number) => {
    if (!active || typeof id !== 'string' || typeof name !== 'string') return
    const tool = name.split(/\.|__/).pop()
    if (!['request_user_input', 'request_user_input_async', 'AskUserQuestion', 'ExitPlanMode'].includes(tool!)) return
    pending.set(id, { requestId: id, requestedAt: timestamp, kind: tool === 'ExitPlanMode' ? 'approval' : 'question', async: tool === 'request_user_input_async' })
  }
  for (const record of records) {
    const timestamp = Date.parse(record.timestamp)
    if (!Number.isFinite(timestamp)) continue
    const p = record.payload ?? {}
    if (provider === 'codex') {
      if (record.type === 'session_meta' && typeof p.source === 'object') return undefined // background agents
      if (record.type === 'event_msg') {
        if (['task_started', 'user_message'].includes(p.type)) { clear(); active = true }
        if (['task_complete', 'turn_aborted', 'task_aborted', 'session_end'].includes(p.type)) { clear(); active = false }
      }
      if (record.type !== 'response_item') continue
      if (p.type === 'message' && p.role === 'user') { clear(); active = true }
      if (p.type === 'message' && p.role === 'assistant' && p.phase === 'final') { clear(); active = false }
      if (['function_call', 'custom_tool_call'].includes(p.type)) request(p.call_id, p.name, timestamp)
      if (['function_call_output', 'custom_tool_call_output'].includes(p.type) && !pending.get(p.call_id)?.async) pending.delete(p.call_id)
    } else {
      if (record.isSidechain) return undefined
      const content = record.message?.content
      if (record.type === 'user') {
        const isToolResult = Array.isArray(content) && content.some((block: any) => block.type === 'tool_result')
        if (!isToolResult) { clear(); active = true }
        else for (const block of content) if (block.type === 'tool_result') pending.delete(block.tool_use_id)
      }
      if (record.type === 'assistant' && Array.isArray(content)) {
        for (const block of content) if (block.type === 'tool_use') request(block.id, block.name, timestamp)
        if (record.message.stop_reason === 'end_turn') { clear(); active = false }
      }
      if (record.type === 'system' && ['turn_duration', 'interrupt', 'session_end'].includes(record.subtype)) { clear(); active = false }
    }
  }
  const latest = [...pending.values()].sort((a, b) => b.requestedAt - a.requestedAt)[0]
  return latest ? { requestId: latest.requestId, requestedAt: latest.requestedAt, kind: latest.kind } : undefined
}

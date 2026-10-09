import { parseCodexText } from './reference/parser/codex'
import { parseJsonlFile } from './reference/parser/conversations'
import { aggregateSessions } from './reference/parser/aggregator'
import { exportSessionsCSV } from './reference/csv'
import { parseChatAttention } from './reference/parser/attention'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import assert from 'node:assert/strict'

const now = Date.parse('2026-09-16T12:00:00Z')
const RealDate = Date
// Freeze both new Date() and Date.now() for matching calendar rollups.
globalThis.Date = class extends RealDate {
  constructor(value?: any) { super(arguments.length ? value : now) }
  static now() { return now }
} as DateConstructor
const time = '2026-09-04T12:00:00Z'
const row = (type: string, payload: any, timestamp = time) => ({ type, payload, timestamp })
const meta = row('session_meta', { id: 'test', cwd: 'C:\\Projects\\Example', source: 'cli' })
const context = row('turn_context', { model: 'gpt-6-astra' })
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 5 })
const count = (raw: any, timestamp = time) => row('event_msg', { type: 'token_count', info: { total_token_usage: raw, last_token_usage: usage(100,40,10), model_context_window: 1000 } }, timestamp)
const cases: any[] = []
const expected: any[] = []
const fixture = mkdtempSync(join(tmpdir(), 'usage-rust-parity-'))
function parse(provider: 'claude' | 'codex', rows: any[], partial = false) {
  const text = rows.map(r => JSON.stringify(r)).join('\n') + (partial ? '\n{"partial":' : '')
  const hidden = ['C:\\Projects\\Example']
  cases.push({ op: 'parse', provider, text, now, hidden })
  let result: ReturnType<typeof parseCodexText>
  if (provider === 'codex') result = parseCodexText(text, 'fixture')
  else {
    const file = join(fixture, 'fixture.jsonl'); writeFileSync(file, text)
    result = { session: parseJsonlFile(file), limits: null }
  }
  const data = aggregateSessions(result.session ? [result.session] : [])
  expected.push({ data, limits: result.limits, csv: exportSessionsCSV(data, { from: 0, to: Infinity }, hidden) })
}
function attention(provider: 'claude' | 'codex', records: any[]) {
  cases.push({ op: 'attention', provider, records, now })
  expected.push(parseChatAttention(records, provider) ?? null)
}
try {
  parse('codex', [])
  parse('codex', [meta,context,count(usage(100,40,10)),count(usage(100,40,10)),row('token_usage_record',{usage:usage(100,40,10)}),count(usage(250,100,30))], true)
  parse('codex', [meta,context,count(usage(100,40,10)),row('event_msg',{type:'token_count',info:null,rate_limits:{primary:{used_percent:32,window_minutes:10080,resets_at:1800000000}}})])
  parse('codex', [meta,context,...[1,2].map(() => row('token_usage_record',{response_id:'one',usage:usage(120,60,15)}))])
  parse('codex', [meta,context,count(usage(100,40,10)),row('turn_context',{model:'unpriced'}),count(usage(200,80,20))])
  parse('codex', [meta,context,count(usage(100,40,10),'2026-09-03T23:59:00'),count(usage(200,80,20),'2026-09-04T00:01:00')])
  parse('codex', [meta,context,count(usage(300000,0,1000))])
  parse('codex', [meta,context,count(usage(100,400,-2))])
  const start=row('event_msg',{type:'task_started'})
  const user=row('event_msg',{type:'user_message'})
  const ask=row('response_item',{type:'function_call',name:'request_user_input',call_id:'q'})
  parse('codex',[meta,context,start,user,ask])
  for (const suffix of [[],[row('response_item',{type:'function_call_output',call_id:'q'})],[row('event_msg',{type:'task_complete'})],[row('event_msg',{type:'turn_aborted'})],[row('response_item',{type:'message',role:'assistant',phase:'final'})],[row('response_item',{type:'message',role:'user'})]]) attention('codex',[start,ask,...suffix])
  attention('codex',[ask])
  attention('codex',[row('session_meta',{source:{subagent:{}}}),start,ask])
  attention('codex',[start,row('response_item',{type:'function_call',name:'functions.request_user_input_async',call_id:'async'}),row('response_item',{type:'function_call_output',call_id:'async'})])
  const cu={timestamp:time,type:'user',message:{content:'private prompt'},cwd:'C:\\Projects\\Example',sessionId:'claude-test'}
  const ca={timestamp:time,type:'assistant',message:{content:[{type:'tool_use',name:'AskUserQuestion',id:'q'}]}}
  attention('claude',[cu,ca]);attention('claude',[cu,{...ca,isSidechain:true}])
  attention('claude',[cu,ca,{timestamp:time,type:'user',message:{content:[{type:'tool_result',tool_use_id:'q'}]}}])
  attention('claude',[cu,ca,{timestamp:time,type:'system',subtype:'turn_duration'}])
  attention('claude',[cu,{...ca,message:{content:[{type:'tool_use',name:'ExitPlanMode',id:'approve'}]}}])
  const assistant=(output:number,model='claude-opus-4-6',id='msg1')=>({...cu,type:'assistant',message:{id,model,usage:{input_tokens:100,output_tokens:output,cache_creation_input_tokens:10,cache_read_input_tokens:20}}})
  parse('claude',[cu,assistant(1),assistant(20),assistant(20)],true)
  parse('claude',[cu,assistant(20,'unknown')])
  parse('claude',[cu,assistant(20),assistant(30,'claude-fable-5-1','msg2'),{timestamp:time,type:'system',subtype:'compact_boundary',compactMetadata:{trigger:'auto'}},ca])
  parse('claude',[{...cu,cwd:'=unsafe,"quoted"'},assistant(20)])
  const exe=resolve('src-tauri/target/debug/examples/parity'+(process.platform==='win32'?'.exe':''))
  const result=spawnSync(exe,[],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:32*1024*1024})
  assert.equal(result.status,0,result.stderr)
  const actual=JSON.parse(result.stdout)
  function compare(a:any,b:any,path:string) {
    if(typeof a==='number' && typeof b==='number') {assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${path}: ${a} != ${b}`);return}
    if(Array.isArray(a)&&Array.isArray(b)) {assert.equal(a.length,b.length,`${path}.length`);a.forEach((v,i)=>compare(v,b[i],`${path}[${i}]`));return}
    if(a&&b&&typeof a==='object'&&typeof b==='object') {
      const keys=Object.keys(b).filter(k=>b[k]!==undefined).sort();assert.deepEqual(Object.keys(a).sort(),keys,path)
      for(const k of keys) compare(a[k],b[k],`${path}.${k}`)
      return
    }
    assert.equal(a,b,path)
  }
  actual.forEach((a:any,i:number)=>compare(a,expected[i],`case ${i}`))
  console.log(`Rust matches the original implementation for ${cases.length} parser, aggregation, CSV and attention scenarios.`)
} finally {
  assert.ok(resolve(fixture).startsWith(resolve(tmpdir())+sep))
  rmSync(fixture,{recursive:true,force:true})
}

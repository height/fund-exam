import test from 'node:test'
import assert from 'node:assert/strict'
import { sheetRequest } from '../src/lib/cheatsheetRequest.js'
import { structuredReply } from '../src/lib/structuredReply.js'
import { parseAIJSON } from '../src/lib/aiResponse.js'

test('three successive generations recover from Safari failure and discard interrupted output', async () => {
 for (let generation=0; generation<3; generation++) {
  let calls=0, retries=0
  const result=await sheetRequest(()=>structuredReply({prompt:'test',parse:parseAIJSON,stream:async function*(){
   calls++
   if(calls===1) throw new TypeError('Load failed')
   if(calls===2){yield '{"items":[{"title":"partial';throw new TypeError('Load failed')}
   yield '{"items":[{"title":"complete"}]}'
  }}),{delay:0,onRetry:()=>retries++})
  assert.equal(calls,3);assert.equal(retries,2)
  assert.deepEqual(result,{items:[{title:'complete'}]})
 }
})
test('persistent network failure is bounded and actionable',async()=>{
 let calls=0
 await assert.rejects(sheetRequest(async()=>{calls++;throw new TypeError('Failed to fetch')},{delay:0}),/自动重试后仍未恢复/)
 assert.equal(calls,3)
})
test('authentication failures do not retry and cancellation interrupts backoff',async()=>{
 let calls=0
 await assert.rejects(sheetRequest(async()=>{calls++;throw new Error('Key 无效')},{delay:0}),/Key 无效/)
 assert.equal(calls,1)
 const controller=new AbortController()
 await assert.rejects(sheetRequest(async()=>{throw new TypeError('Load failed')},{signal:controller.signal,onRetry:()=>controller.abort()}),{name:'AbortError'})
})

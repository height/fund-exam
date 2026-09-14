import test from 'node:test'
import assert from 'node:assert/strict'
import { structuredReply } from '../src/lib/structuredReply.js'
import { parseAIJSON } from '../src/lib/aiResponse.js'

test('incomplete JSON regenerates once, preserving MAX and reporting retry', async () => {
 let calls=0; const statuses=[]
 const result=await structuredReply({prompt:'资料', signal:new AbortController().signal,
   options:{think:true,effort:'max'}, parse:parseAIJSON, onProgress:(text,attempt)=>statuses.push(attempt),
   stream:async function*(prompt,signal,options) {
     assert.equal(options.effort,'max'); assert.equal(options.structured,true)
     yield ++calls===1 ? '{"reply":"半句' : '{"reply":"完整","note":null}'
   }})
 assert.equal(calls,2);assert.equal(result.reply,'完整');assert.ok(statuses.includes(1))
})
test('network errors and aborts are not automatically retried', async () => {
 for (const error of [new Error('请求失败（503）'),new DOMException('Stopped','AbortError')]) {
   let calls=0
   await assert.rejects(structuredReply({prompt:'x',parse:parseAIJSON,stream:async function*(){calls++;throw error}}))
   assert.equal(calls,1)
 }
})
test('repeated malformed response fails after one retry without partial result', async () => {
 let calls=0
 await assert.rejects(structuredReply({prompt:'x',parse:parseAIJSON,stream:async function*(){calls++;yield '{"note":'}}))
 assert.equal(calls,2)
})

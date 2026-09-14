import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAIJSON, readChatResponse } from '../src/lib/aiResponse.js'

const event = (content, extra = {}) => 'data: ' + JSON.stringify({ choices: [{ delta: { content }, ...extra }] })
async function collect(response) { let text = ''; for await (const part of readChatResponse(response)) text += part; return text }
function bytesResponse(text, stride=1) {
 const bytes = new TextEncoder().encode(text)
 return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=stride)c.enqueue(bytes.slice(i,i+stride));c.close()}}))
}
test('flush final unterminated SSE event with Chinese split across byte boundaries', async () => {
 const payload = event('{"reply":"中')+'\n\n'+event('文","note":null}')
 assert.equal(await collect(bytesResponse(payload)), '{"reply":"中文","note":null}')
})
test('ignore SSE comments/metadata, parse CRLF and multiline event data, stop at DONE', async () => {
 const text=': ping\r\nid: 1\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"完成"}}]}\r\n\r\ndata: [DONE]\r\n\r\n'+event('不能出现')+'\n\n'
 assert.equal(await collect(bytesResponse(text)), '完成')
})
test('support providers returning a normal JSON completion despite stream=true', async () => {
 assert.equal(await collect(new Response(JSON.stringify({choices:[{message:{content:'完整回复'}}]}),{headers:{'content-type':'application/json'}})), '完整回复')
})
test('report length limit, service errors and corrupt transport accurately', async () => {
 await assert.rejects(collect(bytesResponse(event('半段',{finish_reason:'length'})+'\n\n')), /长度上限/)
 await assert.rejects(collect(bytesResponse('data: {"error":{"message":"quota"}}\n\n')), /quota/)
 await assert.rejects(collect(bytesResponse('data: {"choices":')), /传输不完整/)
})
test('extract closed JSON from prose and fences, preserving fields', () => {
 assert.deepEqual(parseAIJSON('结果如下：\n```json\n{"reply":"好了","note":null}\n```'), {reply:'好了',note:null})
})
test('repair SVG attribute quotes, literal newlines and trailing commas', () => {
 const value=parseAIJSON('{"reply":"已整理", "note":{"markdown":"<svg viewBox="0 0 10 10"><text>公式</text></svg>\n第二行",},}')
 assert.equal(value.note.markdown,'<svg viewBox="0 0 10 10"><text>公式</text></svg>\n第二行')
})
test('never repair an interrupted object, array or string into a saved note', () => {
 for (const text of ['{"reply":"完整","note":{"markdown":"未完', '{"reply":"未完}', '{"reply":"完整","note":{"points":["条件"}']) {
  assert.throws(()=>parseAIJSON(text), /截断|不完整/)
 }
})
test('valid formula escapes are not rewritten', () => {
 const expected={reply:'公式',note:{markdown:'$\\frac{a}{b}$\n条件'}}
 assert.deepEqual(parseAIJSON(JSON.stringify(expected)),expected)
})
test('repair does not remove LaTeX backslashes or silently discard omitted values', () => {
 const value=parseAIJSON(String.raw`{"reply":"公式","note":{"markdown":"$\alpha + \underbrace{x}$",},}`)
 assert.equal(value.note.markdown,String.raw`$\alpha + \underbrace{x}$`)
 assert.throws(()=>parseAIJSON('{"reply":"好","note":{"points":[1,...]}}'),/省略/)
 assert.throws(()=>parseAIJSON('{"reply":"好","note":}'),/缺失/)
})

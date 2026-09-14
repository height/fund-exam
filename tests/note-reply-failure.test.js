import test from 'node:test'
import assert from 'node:assert/strict'
import { noteReplyFailure, validNoteConversation } from '../src/lib/noteReplyFailure.js'

test('distinguishes manual stop, timeout, transport and invalid document', () => {
 assert.equal(noteReplyFailure(null,{stopped:true}).label,'已停止生成')
 assert.equal(noteReplyFailure(null,{timedOut:true}).label,'等待超时')
 assert.equal(noteReplyFailure(new TypeError('Failed to fetch')).label,'连接中断')
 assert.equal(noteReplyFailure(new Error('AI 回复达到输出长度上限')).label,'模型输出被截断')
 assert.equal(noteReplyFailure(new Error('AI 未返回有效考点，请重试')).label,'笔记结果未通过校验')
 assert.equal(noteReplyFailure(new Error('请求失败（503）')).label,'模型服务请求失败')
})
test('unvalidated partial assistant claims never feed the next request', () => {
 const user={role:'user',text:'修改笔记'}
 const partial={role:'assistant',text:'已经改好',interrupted:true}
 const assistant={role:'assistant',text:'有效回复'}
 assert.deepEqual(validNoteConversation([user,partial,assistant]),[user,assistant])
})

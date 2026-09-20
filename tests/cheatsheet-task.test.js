import test from 'node:test'
import assert from 'node:assert/strict'
import { createCheatsheetTask } from '../src/lib/cheatsheetTask.js'

const input = () => ({ subject: '科目一', notes: [{ id: 'source', subject: '科目一', markdown: '原文' }], prompt: '提炼', effort: 'high' })
const old = { subject: '科目一', notes: [{ id: 'old', subject: '科目一' }] }
const next = { subject: '科目一', notes: [{ id: 'new', subject: '科目一' }] }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('unsubscribing does not abort; one request snapshots inputs and waits for explicit keep', async () => {
  const pending = deferred(), seen = [], stored = []
  let loads = 0, signal
  const task = createCheatsheetTask({ load: async () => { loads++; return { '科目一': old } },
    generate: async (source, ctl, progress) => { seen.push(source); signal = ctl; progress({ current: 1 }); return pending.promise },
    save: async value => stored.push(value) })
  await Promise.all([task.load(), task.load()])
  assert.equal(loads, 1)
  const unsubscribe = task.subscribe(() => {})
  const source = input(), running = task.start(source)
  source.notes[0].markdown = '离页后的修改'
  unsubscribe()
  await task.start(input())
  assert.equal(seen.length, 1)
  assert.equal(seen[0].notes[0].markdown, '原文')
  assert.equal(signal.aborted, false)
  pending.resolve(next); await running
  assert.equal(task.getSnapshot().draft, next)
  assert.equal(task.getSnapshot().results['科目一'], old)
  assert.equal(stored.length, 0)
  assert.equal(await task.keep(), true)
  assert.deepEqual(stored, [next])
  assert.equal(task.getSnapshot().results['科目一'], next)
  assert.equal(task.getSnapshot().draft, null)
})

test('discard, failed regeneration and retry never overwrite the saved version', async () => {
  const seen = []; let fail = false
  const task = createCheatsheetTask({ load: async () => ({ '科目一': old }), save: async () => assert.fail('unexpected save'),
    generate: async source => { seen.push(source); if (fail) throw new Error('offline'); return next } })
  await task.load(); await task.start(input())
  task.discard()
  assert.equal(task.getSnapshot().draft, null)
  assert.equal(task.getSnapshot().results['科目一'], old)
  fail = true; await task.start(input())
  assert.match(task.getSnapshot().error, /offline/)
  assert.equal(task.getSnapshot().results['科目一'], old)
  fail = false; await task.retry()
  assert.deepEqual(seen[2], seen[1])
  assert.equal(task.getSnapshot().draft, next)
})

test('failed persistence retains preview and can retry saving without regenerating', async () => {
  let saves = 0
  const task = createCheatsheetTask({ load: async () => ({ '科目一': old }), generate: async () => next,
    save: async () => { if (++saves === 1) throw new Error('quota') } })
  await task.load(); await task.start(input())
  assert.equal(await task.keep(), false)
  assert.equal(task.getSnapshot().results['科目一'], old)
  assert.equal(task.getSnapshot().draft, next)
  assert.match(task.getSnapshot().error, /保存失败/)
  assert.equal(await task.keep(), true)
  assert.equal(task.getSnapshot().results['科目一'], next)
})

test('cancellation rejects late output; timeout preserves saved result and allows retry', async () => {
  const pending = deferred()
  const task = createCheatsheetTask({ load: async () => ({ '科目一': old }), generate: () => pending.promise, save: async () => {} })
  await task.load()
  const running = task.start(input()); task.cancel(); pending.resolve(next); await running
  assert.match(task.getSnapshot().error, /已取消/)
  assert.equal(task.getSnapshot().draft, null)
  assert.equal(task.getSnapshot().results['科目一'], old)
  const timed = createCheatsheetTask({ load: async () => ({ '科目一': old }), timeout: 5, save: async () => {},
    generate: (_, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))) })
  await timed.load(); await timed.start(input())
  assert.match(timed.getSnapshot().error, /超时/)
  assert.equal(timed.getSnapshot().results['科目一'], old)
})


test('each subject keeps one result; mixed inputs and overlapping jobs never generate', async () => {
  const second = { subject: '科目二', notes: [{ id: 'second', subject: '科目二' }] }
  const pending = deferred(), seen = [], saved = []
  const task = createCheatsheetTask({ load: async () => ({ '科目一': old, '科目二': second }),
    generate: async source => { seen.push(source); return pending.promise }, save: async value => saved.push(value) })
  await task.load()
  await task.start({ ...input(), notes: [...input().notes, ...second.notes] })
  assert.equal(seen.length, 0)
  const running = task.start(input())
  await task.start({ subject: '科目二', notes: second.notes })
  assert.equal(seen.length, 1)
  pending.resolve(next); await running
  await task.start({ subject: '科目二', notes: second.notes })
  assert.equal(seen.length, 1, 'pending draft must be kept or discarded first')
  assert.equal(task.getSnapshot().subject, '科目一')
  await task.keep()
  assert.deepEqual(task.getSnapshot().results, { '科目一': next, '科目二': second })
  assert.deepEqual(saved, [next])
})

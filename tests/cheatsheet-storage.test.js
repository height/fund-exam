import test from 'node:test'
import assert from 'node:assert/strict'
import { idb } from '../src/lib/db.js'
import { loadCheatsheets, saveCheatsheetResult, cheatsheetFingerprint } from '../src/lib/cheatsheetStorage.js'

function memory(t, initial = []) {
  const rows = new Map(initial.map(row => [row.k, row]))
  t.mock.method(idb, 'get', async (_, key) => rows.get(key))
  t.mock.method(idb, 'all', async () => [...rows.values()])
  t.mock.method(idb, 'put', async (_, row) => rows.set(row.k, row))
  return rows
}
const note = (subject, id) => ({ subject, id, chapter: '第一章', title: id, markdown: id, points: [], sourceIds: [id + '-source'] })
const result = (subject, id) => ({ version: 1, subject, notes: [note(subject, id)], sourceCount: 1, fingerprint: '[]' })

test('both subjects survive reload, and regeneration overwrites only its own subject', async t => {
  const rows = memory(t)
  const first = result('科目一', 'first'), second = result('科目二', 'second'), updated = result('科目一', 'updated')
  await saveCheatsheetResult(first); await saveCheatsheetResult(second)
  assert.deepEqual(await loadCheatsheets(), { '科目一': first, '科目二': second })
  await saveCheatsheetResult(updated)
  assert.deepEqual(await loadCheatsheets(), { '科目一': updated, '科目二': second })
  assert.equal(rows.size, 2)
  await assert.rejects(saveCheatsheetResult({ ...first, notes: [...first.notes, ...second.notes] }), /一个科目/)
  assert.deepEqual(await loadCheatsheets(), { '科目一': updated, '科目二': second })
})

test('legacy mixed document splits sources, counts and fingerprints without losing the original', async t => {
  const sources = ['first-source', 'second-source'].map(id => ({ id, status: 'ready', updatedAt: 1 }))
  const legacy = { version: 1, notes: [note('科目一', 'first'), note('科目二', 'second')], html: 'mixed document',
    sourceCount: 2, fingerprint: cheatsheetFingerprint(sources), createdAt: 12 }
  const rows = memory(t, [{ k: 'notebook-cheatsheet:last', v: legacy }])
  const loaded = await loadCheatsheets()
  for (const [i, subject] of ['科目一', '科目二'].entries()) {
    assert.deepEqual(loaded[subject].notes, [legacy.notes[i]])
    assert.equal(loaded[subject].sourceCount, 1)
    assert.equal(loaded[subject].fingerprint, cheatsheetFingerprint([sources[i]]))
    assert.equal(loaded[subject].html, undefined)
  }
  const updated = result('科目一', 'updated')
  await saveCheatsheetResult(updated)
  const reloaded = await loadCheatsheets()
  assert.deepEqual(reloaded['科目一'], updated)
  assert.deepEqual(reloaded['科目二'], loaded['科目二'])
  assert.deepEqual(rows.get('notebook-cheatsheet:last').v, legacy)
})

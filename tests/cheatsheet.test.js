import test from 'node:test'
import assert from 'node:assert/strict'
import { cheatsheetBatches, cheatsheetPrompt, parseCheatsheet } from '../src/lib/cheatsheet.js'
const note = id => ({ id, status: 'ready', subject: '科目一', chapter: '基金活动的法规要求', title: '适用条件', markdown: '必要条件；例外。', points: [] })
test('batches keep every source, omit pending notes and bound request size', () => {
 const notes = Array.from({length:19},(_,i)=>note(String(i)))
 const batches = cheatsheetBatches([...notes,{...note('pending'),status:'review'}])
 assert.equal(batches.length,3)
 assert.deepEqual(new Set(batches.flatMap(b=>b.notes.map(n=>n.id))),new Set(notes.map(n=>n.id)))
 assert.ok(cheatsheetPrompt(batches[0]).includes('不是复制排版'))
})
test('AI can merge duplicates while all sources remain accounted for', () => {
 const batch=cheatsheetBatches([note('a'),note('b')])[0]
 const result=parseCheatsheet(JSON.stringify({items:[{sourceIds:['a','b'],title:'条件',markdown:'条件；==例外==。'}]}),batch)
 assert.equal(result.length,1);assert.equal(result[0].markdown,'条件；==例外==。')
 assert.equal(result[0].chapter,batch.chapter)
 assert.throws(()=>parseCheatsheet('{"items":[{"sourceIds":["a"],"title":"x","markdown":"x"}]}',batch),/遗漏/)
 assert.throws(()=>parseCheatsheet('{"items":[{"sourceIds":["unknown"],"title":"x","markdown":"x"}]}',batch),/来源/)
 assert.throws(()=>parseCheatsheet('{"items":',batch),/不完整/)
})

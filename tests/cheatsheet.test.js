import test from 'node:test'
import assert from 'node:assert/strict'
import { cheatsheetBatches, cheatsheetPrompt, parseCheatsheet } from '../src/lib/cheatsheet.js'
const note = id => ({ id, status: 'ready', subject: '科目一', chapter: '基金活动的法规要求', title: '适用条件', markdown: '必要条件；例外。', points: [] })
test('batches keep every source, omit pending notes and bound request size', () => {
 const notes = Array.from({length:19},(_,i)=>note(String(i)))
 const batches = cheatsheetBatches([...notes,{...note('pending'),status:'review'}])
 assert.equal(batches.length,1)
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

test('related notes across chapters share a generation request; large inputs retain every source', () => {
 const related = [note('a'), {...note('b'), chapter:'其他章节'}]
 assert.equal(cheatsheetBatches(related).length, 1)
 const large = related.map(n=>({...n, markdown:'条件'.repeat(16000)}))
 assert.equal(cheatsheetBatches(large).length, 2)
 assert.deepEqual(cheatsheetBatches(large).flatMap(b=>b.notes.map(n=>n.id)), ['a','b'])
})

test('omitted source formula, image and SVG survive text distillation without duplication', () => {
 const source={...note('visual'),markdown:'说明 $x^2$。\n\n![图](https://example.com/a.png)\n\n<svg viewBox="0 0 100 50"><path d="M0 0L100 50"/></svg>'}
 const batch=cheatsheetBatches([source])[0]
 const parse=markdown=>parseCheatsheet(JSON.stringify({items:[{sourceIds:['visual'],title:'要点',markdown}]}),batch)[0].markdown
 const result=parse('极简结论')
 assert.ok(result.includes('x^2'))
 assert.ok(result.includes('https://example.com/a.png'))
 assert.ok(result.includes('<svg'))
 assert.equal(parse(result),result)
})

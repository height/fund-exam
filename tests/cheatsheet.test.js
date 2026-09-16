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

test('identical output blocks merge sources and retain each source asset', () => {
 const batch=cheatsheetBatches([note('a'),{...note('b'),markdown:'公式 $x^2$'}])[0]
 const result=parseCheatsheet(JSON.stringify({items:[
   {sourceIds:['a'],title:'要点',markdown:'同一个结论'},
   {sourceIds:['b'],title:'重复要点',markdown:'同一个结论'}]}),batch)
 assert.equal(result.length,1)
 assert.deepEqual(result[0].sourceIds,['a','b'])
 assert.ok(result[0].markdown.includes('x^2'))
})
test('same topic with differing text is rejected for AI consolidation, not silently discarded', () => {
 const batch=cheatsheetBatches([note('a'),note('b')])[0]
 assert.throws(()=>parseCheatsheet(JSON.stringify({items:[
   {sourceIds:['a'],title:'条件',markdown:'条件A'},
   {sourceIds:['b'],title:'条件',markdown:'例外B'}]}),batch),/重复知识点/)
})

test('renamed SVG marker ids and blank lines do not duplicate a retained image', () => {
 const svg='<svg viewBox="0 0 100 50"><defs><marker id="arrow"><path d="M0 0L8 3"/></marker></defs>\n\n<path d="M0 0L50 20" marker-end="url(#arrow)"/></svg>'
 const batch=cheatsheetBatches([{...note('a'),markdown:svg}])[0]
 const generated=svg.replaceAll('arrow','arrow2').replaceAll('\n\n','\n')
 const result=parseCheatsheet(JSON.stringify({items:[{sourceIds:['a'],title:'流程',markdown:generated}]}),batch)
 assert.equal((result[0].markdown.match(/<svg/g)||[]).length,1)
})

test('SVG serialization changes do not create duplicate diagrams', () => {
 const original='<svg viewBox="0 0 100 50"><!-- layout --><rect x="2" width="80" height="30" fill="#fff"/><text x="4">A</text></svg>'
 const rewritten="<svg viewBox='0 0 100 50'>\n<rect fill='#fff' height='30' width='80' x='2'></rect>\n<text x='4'>A</text>\n</svg>"
 const batch=cheatsheetBatches([{...note('a'),markdown:original}])[0]
 const result=parseCheatsheet(JSON.stringify({items:[{sourceIds:['a'],title:'图',markdown:rewritten+'\n\n'+original}]}),batch)
 assert.equal((result[0].markdown.match(/<svg/g)||[]).length,1)
 const changed=original.replace('width="80"','width="60"')
 const different=parseCheatsheet(JSON.stringify({items:[{sourceIds:['a'],title:'图',markdown:changed}]}),batch)
 assert.equal((different[0].markdown.match(/<svg/g)||[]).length,2)
})

test('source SVG travels as a reference and is restored exactly once', () => {
 const svg='<svg viewBox="0 0 100 40"><text x="1" y="20">条件</text></svg>'
 const batch=cheatsheetBatches([{...note('a'),markdown:svg}])[0]
 const prompt=cheatsheetPrompt(batch)
 assert.ok(!prompt.includes('<svg'))
 const data=JSON.parse(prompt.split('\n').at(-1))
 const ref=data.sourceFigures[0].ref
 const result=parseCheatsheet(JSON.stringify({items:[{sourceIds:['a'],title:'条件',markdown:ref+'\n\n'+ref}]}),batch)
 assert.equal((result[0].markdown.match(/<svg/g)||[]).length,1)
 assert.ok(result[0].markdown.includes(svg))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { notebookKnowledge } from '../src/lib/notebookKnowledge.js'
import { notePrompt, parseNoteResult, validateNote } from '../src/lib/notebook.js'

const source = { subject: '科目二', subjectLocked: true, chapter: '待归类', excerpt: '最大回撤', context: '最大回撤', evidenceContext: '最大回撤' }
const refs = notebookKnowledge(source)
const quote = '最大回撤为期间先峰后谷的最大跌幅。'
const base = { subject: '科目二', chapter: '投资风险管理', title: '最大回撤', points: [quote], evidence: [quote], evidenceKinds: ['graph'], needsReview: false }
const parse = (value = base, note = source) => parseNoteResult(JSON.stringify(value), { ...note, knowledgeRefs: refs })

test('短术语和自然语言需求能检索图谱，用章节定位并限制材料体积', () => {
  for (const excerpt of ['最大回撤', '帮我写一条关于最大回撤的笔记']) {
    const related = notebookKnowledge({ ...source, excerpt })
    assert.equal(related[0].chapter, '投资风险管理')
    assert.ok(related[0].text.includes(quote))
    assert.ok(related.length <= 4 && related.every(r => r.text.length <= 1800 && r.subject === '科目二'))
  }
  assert.equal(notebookKnowledge({ ...source, excerpt: '债券价格与利率' })[0].chapter, '固定收益投资')
  assert.equal(notebookKnowledge({ ...source, excerpt: '复利' })[0].chapter, '投资管理基础')
  assert.deepEqual(notebookKnowledge({ ...source, excerpt: '量子纠缠' }), [])
  assert.deepEqual(notebookKnowledge({ ...source, excerpt: '帮我精简一点' }), [])
  assert.ok(notebookKnowledge({ ...source, subject: '科目一' }).every(r => r.subject === '科目一'))
})

test('本轮补充主题参与检索，普通修改要求不会丢失原主题', () => {
  const changed = notebookKnowledge({ ...source, excerpt: '' }, [{ role: 'user', text: '帮我整理夏普比率' }])
  assert.equal(changed[0].chapter, '基金业绩评价')
  assert.ok(notebookKnowledge(source, [{ role: 'user', text: '再精简一点' }]).some(r => r.text.includes(quote)))
})

test('图谱补充提供真实依据，且不混入原始摘录', () => {
  const got = parse()
  assert.equal(got.status, 'ready')
  assert.deepEqual(got.knowledgeRefs, refs)
  assert.equal(source.context, '最大回撤')
  const data = JSON.parse(notePrompt({ ...source, knowledgeRefs: refs }).split('\n').at(-1))
  assert.equal(data.evidenceContext, '最大回撤')
  assert.deepEqual(data.relatedKnowledge, refs)
  assert.equal(data.sourceSubject, '科目二')
})

test('基础通识及常数可直接生成，不需伪造原文，也不因来源是AI而强制待核对', () => {
  const got = parse({ ...base, points: ['复利终值 FV = PV × (1 + r)^n。'], evidence: [''], evidenceKinds: ['common'],
    formula: { expression: 'FV = PV × (1 + r)^n', symbols: [], condition: '利率与计息期口径一致', evidence: '', evidenceKind: 'common' },
  }, { ...source, sourceKind: 'ai' })
  assert.equal(got.status, 'ready')
  assert.equal(got.reviewReason, '')
  assert.equal(parse({ ...base, evidence: ['伪装成原文的引用'], evidenceKinds: ['common'] }).status, 'review')
})

test('引用与通识混合时逐项核对；编造引用和不确定结论仍需核对', () => {
  assert.equal(parse({ ...base, points: [quote, '收益率可以为负。'], evidence: [quote, ''], evidenceKinds: ['graph', 'common'] }).status, 'ready')
  assert.equal(parse({ ...base, evidence: ['图谱不存在的句子。'] }).status, 'review')
  assert.equal(parse({ ...base, points: ['最大回撤固定为99%。'] }).status, 'review')
  assert.equal(parse({ ...base, evidence: [''], evidenceKinds: ['common'], needsReview: true, reviewReason: '现行产品费率需要核对' }).status, 'review')
  assert.throws(() => parse({ ...base, evidenceKinds: ['unknown'] }), /依据类型/)
  assert.throws(() => parse({ ...base, evidenceKinds: [] }), /依据类型/)
})

test('图谱引用与通识标记可持久化，备份校验拒绝跨科目及异常材料', () => {
  const note = { ...source, ...parse(), id: 'knowledge-test', createdAt: 1, updatedAt: 1 }
  assert.equal(validateNote(note), note)
  assert.throws(() => validateNote({ ...note, knowledgeRefs: [{ ...refs[0], subject: '科目一' }] }))
  assert.throws(() => validateNote({ ...note, knowledgeRefs: [{ ...refs[0], text: 'x'.repeat(1801) }] }))
  assert.throws(() => validateNote({ ...note, evidenceKinds: ['common', 'graph'] }))
})

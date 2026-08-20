/* 题库与纯函数统计。questions.json / plain.json 由 tools/ 下的脚本生成，别手改 */
import questions from '../data/questions.json'
import plain from '../data/plain.json'

export const BANK = questions
export const PLAIN = plain

export const SUBJECTS = ['科目一', '科目二']
export const SUBJ_FULL = {
  科目一: '基金法律法规、职业道德与业务规范',
  科目二: '证券投资基金基础知识',
}
// 两联切换里放不下全称，硬截断出来的省略号很难看，给个短名
export const SUBJ_SHORT = { 科目一: '法律法规', 科目二: '投资基础' }

export const EXAM_N = 100
export const EXAM_MIN = 120
export const PASS = 60

export const bySubject = s => BANK.filter(q => q.subject === s)
export const qById = id => BANK.find(q => q.id === id)

export function shuffle(a) {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function stats(records, s) {
  const qs = bySubject(s)
  const done = qs.filter(q => records[q.id]?.seen)
  const seen = done.reduce((a, q) => a + records[q.id].seen, 0)
  const hit = done.reduce((a, q) => a + records[q.id].right, 0)
  return {
    total: qs.length,
    done: done.length,
    acc: seen ? Math.round((hit / seen) * 100) : 0,
    wrong: qs.filter(q => records[q.id]?.wrongFlag).length,
  }
}

/**
 * 今日与累计的练习量，跨科目统计——「我今天学了多少」跟当前看的是哪一科无关。
 * 今日按 lastTs 落在今天算：同一题今天答过两遍只记一次，宁可少算不多算。
 */
export function effort(records) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const rs = Object.values(records)
  return {
    today: rs.filter(r => (r.lastTs || 0) >= start.getTime()).length,
    answers: rs.reduce((a, r) => a + (r.seen || 0), 0),
    covered: rs.length,
  }
}

/** 各知识点掌握度，最弱的排前面 */
export function chapterStats(records, s) {
  const m = {}
  bySubject(s).forEach(q => {
    const c = (m[q.chapter] ??= { chapter: q.chapter, total: 0, done: 0, seen: 0, hit: 0 })
    c.total++
    const r = records[q.id]
    if (r?.seen) { c.done++; c.seen += r.seen; c.hit += r.right }
  })
  return Object.values(m)
    .map(c => ({ ...c, acc: c.seen ? Math.round((c.hit / c.seen) * 100) : null }))
    .sort((a, b) => (a.acc ?? 999) - (b.acc ?? 999))
}

/** 按章节题量比例分层抽样，保证知识点覆盖 */
export function pickExamSet(subj) {
  const qs = bySubject(subj)
  const byCh = {}
  qs.forEach(q => (byCh[q.chapter] ??= []).push(q))
  const out = []
  Object.values(byCh).forEach(list => {
    const n = Math.max(1, Math.round((list.length / qs.length) * EXAM_N))
    out.push(...shuffle(list).slice(0, n))
  })
  const taken = new Set(out.map(q => q.id))
  const pool = shuffle(qs.filter(q => !taken.has(q.id)))
  while (out.length < EXAM_N && pool.length) out.push(pool.pop())
  return shuffle(out).slice(0, Math.min(EXAM_N, qs.length))
}

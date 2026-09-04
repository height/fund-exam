import { useEffect, useRef, useState } from 'react'
import { Explain, Icon, Options, SubjectSeg } from '../components/ui'
import { CHAPTER_EXAM_N, EXAM_MIN, EXAM_N, PASS, SUBJ_FULL, bySubject, minutesFor, pickExamSet, qById } from '../lib/bank'
import { track } from '../lib/analytics'
import { idb, kvGet, kvSet } from '../lib/db'
import { Stem, fmtTime } from '../lib/format'
import { NUMBER_EXAM_N, numberQuestions, pickNumberExamSet } from '../lib/numbers'
import { useStore } from '../lib/store'
import { useQuestionNav } from '../lib/useQuestionNav'

const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches

/** 一场考试全程存在 kv.activeExam 里：关掉页面倒计时照走，回来能接着考 */
export default function Exam({ go, setQuiz, chapter, scope, review }) {
  const { subject, records, setRecords, toast, ask } = useStore()
  const numberMode = scope === 'numbers'
  const reviewIds = review?.split(',').filter(Boolean) || null
  const activeKey = numberMode ? 'activeNumberExam' : 'activeExam'
  const [stage, setStage] = useState('loading') // loading | resume | intro | running | result
  const [ex, setEx] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    ;(async () => {
      const a = await kvGet(activeKey, null)
      if (a && a.endTs > Date.now()) { setEx(a); setStage('resume'); return }
      if (a) await kvSet(activeKey, null)
      setStage('intro')
    })()
  }, [activeKey])

  // 考试进行中：收起底栏，离开要确认
  useEffect(() => {
    setQuiz(stage === 'running')
    return () => setQuiz(false)
  }, [stage, setQuiz])

  async function begin() {
    const qs = numberMode
      ? pickNumberExamSet(subject, reviewIds)
      : pickExamSet(subject, chapter)
    const now = Date.now()
    // mins 存进这场考试：单章卷比整套短，交卷算用时得按本场时长封顶，
    // 不能再拿 EXAM_MIN 当上限，否则单章考的用时会被记成最多 120 分钟
    const mins = numberMode || chapter ? minutesFor(qs.length) : EXAM_MIN
    const fresh = {
      subject, chapter: numberMode ? undefined : chapter, mins, kind: numberMode ? 'numbers' : undefined,
      ids: qs.map(q => q.id), answers: {},
      startTs: now, endTs: now + mins * 60000, i: 0,
    }
    await kvSet(activeKey, fresh)
    track('exam_started', {
      subject,
      exam_type: numberMode ? 'numbers' : chapter ? 'chapter' : 'full',
      question_count: qs.length,
    })
    setEx(fresh)
    setStage('running')
  }

  /** 交卷：未作答按错计分并进错题本 */
  async function submit(current) {
    const e = current || ex
    const qs = e.ids.map(qById)
    const next = { ...records }
    let right = 0
    for (const q of qs) {
      const p = e.answers[q.id]
      const old = next[q.id] || { qid: q.id, subject: q.subject, seen: 0, right: 0, wrong: 0 }
      const ok = p === q.answer
      if (ok) right++
      const r = {
        ...old, seen: old.seen + 1,
        right: old.right + (ok ? 1 : 0), wrong: old.wrong + (ok ? 0 : 1),
        wrongFlag: !ok, lastTs: Date.now(),
      }
      next[q.id] = r
      await idb.put('records', r)
    }
    setRecords(next)
    const rec = {
      id: Date.now(), subject: e.subject, chapter: e.chapter, kind: e.kind, ts: Date.now(),
      score: Math.round((right / qs.length) * 100), right, total: qs.length,
      usedMs: Math.min(Date.now() - e.startTs, (e.mins || EXAM_MIN) * 60000),
      ids: e.ids, answers: e.answers,
    }
    await idb.put('exams', rec)
    await kvSet(e.kind === 'numbers' ? 'activeNumberExam' : 'activeExam', null)
    track('exam_submitted', {
      subject: e.subject,
      exam_type: e.kind === 'numbers' ? 'numbers' : e.chapter ? 'chapter' : 'full',
      question_count: qs.length,
      answered_count: Object.keys(e.answers).length,
    })
    setResult(rec)
    setStage('result')
  }

  if (stage === 'loading') return null

  if (stage === 'resume') return (
    <>
      <div><h1>{numberMode ? '数字模拟练习' : '模拟考试'}</h1></div>
      <div className="card">
        <div className="row between"><b>有一场没考完</b><span className="chip">{ex.subject}</span></div>
        <div className="row between">
          <span className="muted">剩余时间</span>
          <span className="timer">{fmtTime(ex.endTs - Date.now())}</span>
        </div>
        <div className="row between">
          <span className="muted">已作答</span>
          <span className="num">{Object.keys(ex.answers).length}/{ex.ids.length}</span>
        </div>
        <div className="grid2">
          <button className="btn-pri" onClick={() => setStage('running')}>继续考试</button>
          <button onClick={async () => { await kvSet(activeKey, null); setEx(null); setStage('intro') }}>
            放弃重考
          </button>
        </div>
      </div>
    </>
  )

  if (stage === 'running') return <Running ex={ex} setEx={setEx} onSubmit={submit} toast={toast} ask={ask} go={go} />
  if (stage === 'result') return <Result rec={result} go={go} />

  const allow = reviewIds?.length ? new Set(reviewIds) : null
  const pool = numberMode
    ? numberQuestions(subject).filter(q => !allow || allow.has(q.id)).length
    : chapter
      ? bySubject(subject).filter(q => q.chapter === chapter).length
      : bySubject(subject).length
  const n = Math.min(numberMode ? NUMBER_EXAM_N : chapter ? CHAPTER_EXAM_N : EXAM_N, pool)
  const mins = numberMode || chapter ? minutesFor(n) : EXAM_MIN
  return (
    <>
      <div>
        <h1>{numberMode ? (reviewIds?.length ? '数字错题重考' : '数字模拟练习') : chapter ? '章节考试' : '模拟考试'}</h1>
        <div className="muted">
          {numberMode
            ? <>所有章节混合抽题，{mins} 分钟 {n} 道单选，{PASS} 分及格，考中不看答案</>
            : chapter
            ? <>只考「{chapter}」这一章，{mins} 分钟 {n} 道单选，{PASS} 分及格，考中不看答案</>
            : <>按真考规格：{EXAM_MIN} 分钟 {EXAM_N} 道单选，{PASS} 分及格，考中不看答案</>}
        </div>
      </div>
      {!chapter && <SubjectSeg />}
      <div className="card">
        <div className="stats">
          <div className="stat"><b>{n}</b><span>抽题</span></div>
          <div className="stat"><b>{mins}</b><span>分钟</span></div>
          <div className="stat"><b>{PASS}</b><span>及格分</span></div>
        </div>
        <div className="muted">
          {numberMode
            ? <>{SUBJ_FULL[subject]}　{reviewIds?.length ? `本次错题共 ${pool} 题` : `数字题库共 ${pool} 题，每次随机抽`}</>
            : chapter
            ? <>{SUBJ_FULL[subject]}　本章题库共 {pool} 题，每次随机抽</>
            : <>{SUBJ_FULL[subject]}　按章节分层抽题，覆盖各知识点</>}
        </div>
        <button className="btn-pri" style={{ padding: 15 }} disabled={!n} onClick={begin}>开始考试</button>
        {(chapter || numberMode) && (
          <button className="btn-sm btn-ghost" onClick={() => go(numberMode ? 'numbers' : 'chapters', numberMode ? { mode: 'exam' } : {})}>
            ← {numberMode ? '返回数字必背' : '换一章'}
          </button>
        )}
      </div>
      <div className="card">
        <div className="muted">中途关掉页面没关系：倒计时按真实时间走，回来能接着考，时间到自动交卷。</div>
      </div>
    </>
  )
}

function Running({ ex, setEx, onSubmit, toast, ask, go }) {
  const [left, setLeft] = useState(() => ex.endTs - Date.now())
  const [sheet, setSheet] = useState(false)
  const submitted = useRef(false)

  const fire = e => { if (!submitted.current) { submitted.current = true; onSubmit(e) } }

  useEffect(() => {
    const id = setInterval(() => {
      const l = ex.endTs - Date.now()
      setLeft(l)
      if (l <= 0) { clearInterval(id); toast('时间到，已自动交卷'); fire(ex) }
    }, 500)
    return () => clearInterval(id)
  }, [ex])

  const qs = ex.ids.map(qById)
  const q = qs[ex.i]
  const answered = Object.keys(ex.answers).length

  const patch = p => {
    const n = { ...ex, ...p }
    setEx(n)
    kvSet(ex.kind === 'numbers' ? 'activeNumberExam' : 'activeExam', n)
    return n
  }

  function pick(idx) {
    patch({ answers: { ...ex.answers, [q.id]: idx }, i: ex.i < qs.length - 1 ? ex.i + 1 : ex.i })
  }
  const prev = () => { if (ex.i > 0) patch({ i: ex.i - 1 }) }
  const next = () => { if (ex.i < qs.length - 1) patch({ i: ex.i + 1 }) }

  async function leave() {
    if (!await ask({
      title: '离开考试？',
      body: '这场不算交卷，倒计时按真实时间继续走，回来能接着考，到点自动交卷。',
      ok: '离开', cancel: '继续考试',
    })) return
    go(ex.kind === 'numbers' ? 'numbers' : 'home', ex.kind === 'numbers' ? { mode: 'exam' } : {}, true)
  }

  async function confirmSubmit() {
    const miss = qs.length - answered
    if (miss && !await ask({
      title: `还有 ${miss} 题没作答`,
      body: '未作答按错计分，会自动进错题本。',
      ok: '确定交卷', cancel: '回去补答',
    })) return
    fire(ex)
  }

  useQuestionNav({ onPick: pick, onPrev: prev, onNext: next })

  return (
    <>
      <div className="topbar">
        {/* 底栏在考试中收起了，这里得留一个出口——离开不交卷，倒计时照走 */}
        <button className="btn-sm btn-ghost" onClick={leave} aria-label="退出考试"><Icon name="back" /></button>
        <div className={`timer ${left < 10 * 60000 ? 'low' : ''}`}>{fmtTime(left)}</div>
        <div className="bar"><i style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
        <button className="btn-sm" onClick={() => setSheet(true)} aria-label="答题卡">
          <Icon name="grid" /><span className="num">{answered}/{qs.length}</span>
        </button>
      </div>

      <div className="card">
        <div className="eyebrow">第 {ex.i + 1} 题 / {qs.length}</div>
        <Stem text={q.q} />
        <Options q={q} selected={ex.answers[q.id]} onPick={pick} />
      </div>

      <div className="actionbar-gap" />
      <div className="actionbar">
        <div>
          <button disabled={ex.i === 0} onClick={prev} aria-label="上一题"><Icon name="left" /></button>
          <button disabled={ex.i === qs.length - 1} onClick={next} aria-label="下一题"><Icon name="right" /></button>
          <button className="btn-pri" style={{ flex: 2 }} onClick={confirmSubmit}>
            <Icon name="send" /> 交卷
          </button>
        </div>
      </div>

      {sheet && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setSheet(false) }}>
          <div className="panel">
            <div className="row between">
              <h2>答题卡</h2>
              <span className="muted">已答 <span className="num">{answered}/{qs.length}</span></span>
            </div>
            <div className="sheet">
              {qs.map((x, i) => (
                <button key={x.id}
                  className={`${ex.answers[x.id] !== undefined ? 'done' : ''} ${i === ex.i ? 'cur' : ''}`}
                  onClick={() => { patch({ i }); setSheet(false) }}>{i + 1}</button>
              ))}
            </div>
            <div className="grid2">
              <button onClick={() => setSheet(false)}>继续答题</button>
              <button className="btn-pri" onClick={() => { setSheet(false); confirmSubmit() }}>交卷</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Result({ rec, go }) {
  const [detail, setDetail] = useState(null)
  const detailRef = useRef(null)
  const qs = rec.ids.map(qById)
  const pass = rec.score >= PASS
  const numberMode = rec.kind === 'numbers'

  useEffect(() => {
    if (detail !== null) {
      detailRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }
  }, [detail])

  const wrongCh = {}
  qs.forEach(q => { if (rec.answers[q.id] !== q.answer) wrongCh[q.chapter] = (wrongCh[q.chapter] || 0) + 1 })
  const weak = Object.entries(wrongCh).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <>
      <div className="card" style={{ alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <div className="eyebrow">{rec.subject} {numberMode ? '数字模拟练习' : '模拟考'}成绩</div>
        <div className="num" style={{
          fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-.03em',
          color: pass ? 'var(--ok)' : 'var(--bad)',
        }}>{rec.score}</div>
        <div style={{ fontWeight: 600 }}>{pass ? `已过 ${PASS} 分及格线` : `差 ${PASS - rec.score} 分及格`}</div>
        <div className="muted">答对 {rec.right}/{rec.total} · 用时 {Math.round(rec.usedMs / 60000)} 分钟</div>
      </div>

      {weak.length > 0 && (
        <div className="card">
          <h2>这次丢分最多的知识点</h2>
          <div className="stack">
            {weak.map(([c, n]) => (
              <div className="row between" key={c}><span>{c}</span><span className="chip alert">错 {n} 题</span></div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between"><h2>逐题回顾</h2><span className="muted">点题号看解析</span></div>
        <div className="sheet">
          {qs.map((q, i) => (
            <button key={q.id} className={rec.answers[q.id] === q.answer ? 'r' : 'w'}
              onClick={() => setDetail(i)}>{i + 1}</button>
          ))}
        </div>
        <div className="muted">绿=答对，红=答错或未答。错题已自动进错题本。</div>
      </div>

      <div ref={detailRef}>
        {detail !== null && (() => {
          const q = qs[detail]
          const p = rec.answers[q.id]
          return (
            <div className="card">
              <div className="eyebrow">第 {detail + 1} 题 · {q.chapter}</div>
              <Stem text={q.q} />
              <Options q={q} picked={p} reveal />
              <Explain q={q} picked={p} />
            </div>
          )
        })()}
      </div>

      {numberMode ? (() => {
        const wrongIds = qs.filter(q => rec.answers[q.id] !== q.answer).map(q => q.id).join(',')
        return (
          <div className="grid2">
            <button disabled={!wrongIds} onClick={() => go('numbers', { mode: 'cards', review: wrongIds })}>重背错题卡</button>
            <button className="btn-pri" onClick={() => go('numbers', { mode: 'exam' })}>回数字必背</button>
          </div>
        )
      })() : (
        <div className="grid2">
          <button onClick={() => go('wrong')}>去刷错题</button>
          <button className="btn-pri" onClick={() => go('home')}>回首页</button>
        </div>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Explain, Icon, Options, PageHeader, Speaker, SubjectSeg, ThemeToggle } from '../components/ui'
import { qToSpeech } from '../lib/ai'
import { track } from '../lib/analytics'
import { BANK, CALC_IDS, RANDOM_SIZES, bySubject, chapterStats, getRandomN, setRandomN, shuffle } from '../lib/bank'
import { clearPracticeRecords, kvGet, kvSet } from '../lib/db'
import { Stem } from '../lib/format'
import { useStore } from '../lib/store'
import { useQuestionNav } from '../lib/useQuestionNav'
import { readPracticePreferences, savePracticePreferences } from '../lib/practicePreferences'
import { courseUnit } from '../data/formulaCourses'
import { ChapterAccuracy, ChapterAccuracyHint } from '../components/ChapterAccuracy'
import PracticeSheet from '../components/PracticeSheet'

const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches

/* 断点续练只对固定题集有意义。new / wrong 是动态筛选，做对一题这题就从集合里消失了，
   存下来的下标明天指向的是另一道题。这两类范围不记进度，每次从头过一遍。 */
const keepsCursor = scope => !['new', 'wrong'].includes(scope)

export default function Practice({ go, setQuiz, initialScope, initialOrder }) {
  const { subject, records, toast } = useStore()
  const [session, setSession] = useState(null)

  /* 六个入口共用下面这一个 start()，区别只在要不要先让人选范围：
     带 scope 进来的（首页章节练习/随机、错题重练、公式攻坚开练、知识图谱练这章）
     直接开练；不带的（底栏「练习」tab）渲染 Setup 让人自己挑，选项是全集。 */
  useEffect(() => {
    if (initialScope) start(initialScope, initialOrder || 'rand')
  }, [initialScope, initialOrder])

  async function start(scope, order, chapter = '') {
    const formula = scope.startsWith('formula:') ? courseUnit(scope.slice(8)) : null
    // 计算题不分科目：31 道里 29 道在科目二，按科目切会把另一科那 2 道藏起来
    let qs = scope.startsWith('formula:')
      ? BANK.filter(q => q.subject === '科目二' && formula?.bankIds.includes(q.id))
      : scope === 'calc'
      ? BANK.filter(q => CALC_IDS.includes(q.id))
      : scope.startsWith('kw:')
        ? BANK.filter(q => new RegExp(scope.slice(3)).test(q.q + q.explain)) // 专题动画「去练相关题」
        : bySubject(subject)
    if (chapter) qs = qs.filter(q => q.chapter === chapter)
    if (scope === 'new') qs = qs.filter(q => !records[q.id]?.seen)
    else if (scope === 'wrong') qs = qs.filter(q => records[q.id]?.wrongFlag)
    else if (scope.startsWith('ch:')) qs = qs.filter(q => q.chapter === scope.slice(3))
    if (!qs.length) return toast('这个范围已经没题了，换一个')
    // 随机练习是「一小轮」，抽满题量就够；顺序练习才是从头啃到尾
    if (order === 'rand') qs = shuffle(qs).slice(0, getRandomN())
    const key = keepsCursor(scope) ? `cursor:${subject}:${chapter && scope === 'all' ? `ch:${chapter}` : scope}:${order}` : null
    const saved = key && order === 'seq' ? await kvGet(key, 0) : 0
    const scopeType = scope.startsWith('formula:') ? 'formula' : scope.startsWith('ch:') ? 'chapter' : scope.startsWith('kw:') ? 'keyword' : scope
    track('practice_started', {
      subject,
      scope: scopeType,
      order,
      question_count: qs.length,
    })
    setSession({ qs, i: Math.min(saved, qs.length - 1), picks: {}, key, order, scope: scopeType, done: 0, right: 0 })
  }

  // 答题中收起底栏，退出走 Runner 里的确认
  useEffect(() => { setQuiz(!!session); return () => setQuiz(false) }, [session, setQuiz])

  return session
    ? <Runner session={session} setSession={setSession} onQuit={() => {
      setSession(null)
      if (initialScope?.startsWith('formula:')) go('formula', { unit: initialScope.slice(8) }, true)
    }} />
    : <>{initialScope?.startsWith('formula:') && <button className="btn-sm" onClick={() => go('formula', { unit: initialScope.slice(8) })}>返回微课堂</button>}<Setup key={subject} onStart={start} go={go} /></>
}

function Setup({ onStart, go }) {
  const { records, subject, autoNext, setAutoNext } = useStore()
  const [scope, setScope] = useState('all')
  const [order, setOrder] = useState('seq')
  const [randN, setRandN] = useState(getRandomN)
  const chs = chapterStats(records, subject, true)
  const allChapters = chs.reduce((sum, c) => ({
    ...sum, total: sum.total + c.total, done: sum.done + c.done,
    seen: sum.seen + c.seen, hit: sum.hit + c.hit,
  }), { chapter: '全部章节', total: 0, done: 0, seen: 0, hit: 0 })
  const [chapter, setChapter] = useState(() => {
    const saved = readPracticePreferences().chapters?.[subject]
    return chs.some(c => c.chapter === saved) ? saved : ''
  })
  const qs = bySubject(subject)
  const matches = q => scope === 'new' ? !records[q.id]?.seen : scope === 'wrong' ? records[q.id]?.wrongFlag : true
  const available = qs.filter(matches)
  const selectedCount = available.filter(q => !chapter || q.chapter === chapter).length
  const scopes = [
    { v: 'all', t: '全部', n: qs.length },
    { v: 'new', t: '未做', n: qs.filter(q => !records[q.id]?.seen).length },
    { v: 'wrong', t: '错题', n: qs.filter(q => records[q.id]?.wrongFlag).length },
  ]
  const chooseChapter = value => {
    setChapter(value)
    savePracticePreferences({ subject, chapters: { ...readPracticePreferences().chapters, [subject]: value } })
  }
  return <div className="practice-setup practice-unified">
    <PageHeader variant="subpage" title="练习" onBack={() => go('home')} backLabel="首页" />
    <SubjectSeg />
    <div className="practice-range-tabs" role="group" aria-label="练习范围">
      {scopes.map(s => <button key={s.v} aria-pressed={scope === s.v} className={scope === s.v ? 'on' : ''} onClick={() => setScope(s.v)}>{s.t}<span>{s.n}</span></button>)}
    </div>
    <div className="chapter-summary"><span>选择章节</span><button className="btn-ghost" onClick={() => go('exam', chapter ? { ch: chapter } : {})}>模拟考 <Icon name="chevronRight" size={14} /></button></div>
    <div className="chapter-list practice-chapter-picker" role="group" aria-label="章节">
      <button className={`ch-row ${!chapter ? 'selected' : ''}`} aria-pressed={!chapter} onClick={() => chooseChapter('')}>
        <span className="ch-no"><Icon name="list" size={14} /></span>
        <span className="ch-body"><b>全部章节</b><ChapterAccuracy chapter={allChapters}
          summary={scope === 'all' ? undefined : `已做 ${allChapters.done}/${allChapters.total} · ${scope === 'new' ? '未做' : '错题'} ${available.length}`} /></span>
        <span className="chapter-check" aria-hidden="true">{!chapter ? '✓' : ''}</span>
      </button>
      {chs.map((c, i) => {
        const count = available.filter(q => q.chapter === c.chapter).length
        return <button key={c.chapter} className={`ch-row ${chapter === c.chapter ? 'selected' : ''}`} aria-pressed={chapter === c.chapter} onClick={() => chooseChapter(c.chapter)}>
          <span className="ch-no">{String(i + 1).padStart(2, '0')}</span>
          <span className="ch-body"><b>{c.chapter}</b><ChapterAccuracy chapter={c}
            summary={scope === 'all' ? undefined : `已做 ${c.done}/${c.total} · ${scope === 'new' ? '未做' : '错题'} ${count}`} /></span>
          <span className="chapter-check" aria-hidden="true">{chapter === c.chapter ? '✓' : ''}</span>
        </button>
      })}
    </div>
    <ChapterAccuracyHint />
    <footer className="practice-dock" aria-label="练习操作">
      <div className="practice-dock-inner">
        <div className="practice-dock-options">
          <div className="seg" role="group" aria-label="练习方式">
            <button aria-pressed={order === 'seq'} className={order === 'seq' ? 'on' : ''} onClick={() => setOrder('seq')}>顺序</button>
            <button aria-pressed={order === 'rand'} className={order === 'rand' ? 'on' : ''} onClick={() => setOrder('rand')}>随机</button>
          </div>
          {order === 'rand' && <select className="practice-dock-count" aria-label="每轮题量" value={randN} onChange={e => { const n = Number(e.target.value); setRandN(n); setRandomN(n) }}>{RANDOM_SIZES.map(n => <option key={n} value={n}>{n} 题</option>)}</select>}
          <label className="practice-dock-auto"><span>自动下一题</span><input className="practice-switch" type="checkbox" role="switch" aria-label="答对自动下一题，答错停下看解析" checked={autoNext} onChange={e => setAutoNext(e.target.checked)} /></label>
        </div>
        <button className="btn-pri practice-start" disabled={!selectedCount} onClick={() => onStart(scope, order, chapter)}>开始练习<span>{order === 'rand' ? Math.min(randN, selectedCount) : selectedCount} 题</span></button>
      </div>
    </footer>
  </div>
}

function Runner({ session: s, setSession, onQuit }) {
  const { records, setRecords, autoNext, recordAnswer, toast, ask, dialog } = useStore()
  const [sheet, setSheet] = useState(false)
  const [clearing, setClearing] = useState(false)
  const jumpTimer = useRef(0)
  useEffect(() => () => clearTimeout(jumpTimer.current), [])

  const q = s.qs[s.i]
  const picked = s.picks[s.i]
  const shown = picked !== undefined

  const goTo = i => { clearTimeout(jumpTimer.current); setSession(p => ({ ...p, i })) }

  function openSheet() {
    clearTimeout(jumpTimer.current)
    setSheet(true)
  }

  async function clearSheet() {
    if (clearing) return
    if (!await ask({
      title: '清除这些题的记录？',
      body: `将清除当前答题卡 ${s.qs.length} 道题的累计作答记录、错题标记和本轮进度，章节已做题数及正确率也会重新计算。其他题目、笔记和模拟考成绩保留。清除后无法撤销。`,
      ok: '确认清除', cancel: '保留记录', danger: true,
    })) return
    setClearing(true)
    clearTimeout(jumpTimer.current)
    try {
      const ids = s.qs.map(q => q.id)
      await clearPracticeRecords(ids, s.key)
      setRecords(previous => {
        const next = { ...previous }
        for (const id of ids) delete next[id]
        return next
      })
      setSession(previous => ({ ...previous, i: 0, picks: {}, done: 0, right: 0 }))
      toast('这些题的记录已清除，可以重新练习')
    } catch {
      toast('清除失败，记录已保留，请重试')
    } finally { setClearing(false) }
  }

  function prev() { if (s.i > 0) goTo(s.i - 1) }

  async function next() {
    if (s.i === s.qs.length - 1) {
      if (s.key) await kvSet(s.key, 0)
      track('practice_completed', {
        subject: q.subject,
        scope: s.scope,
        answered_count: s.done,
        question_count: s.qs.length,
      })
      toast(s.done ? `本轮做了 ${s.done} 题，对 ${s.right} 题` : '本轮结束')
      return onQuit()
    }
    const i = s.i + 1
    if (s.key && s.order === 'seq') await kvSet(s.key, i)
    goTo(i)
  }

  async function pick(idx) {
    if (shown) return
    const at = s.i
    const ok = await recordAnswer(q, idx)
    track('practice_answered', { subject: q.subject, scope: s.scope })
    setSession(p => ({
      ...p, picks: { ...p.picks, [at]: idx }, done: p.done + 1, right: p.right + (ok ? 1 : 0),
    }))
    // 自动跳转前确认用户没有自己翻走
    if (ok && autoNext && at < s.qs.length - 1) {
      jumpTimer.current = setTimeout(() => setSession(p => {
        if (p.i !== at) return p
        if (p.key && p.order === 'seq') kvSet(p.key, at + 1)
        return { ...p, i: at + 1 }
      }), reduceMotion ? 300 : 750)
    }
  }

  async function quit() {
    if (!await ask({
      title: '退出练习？',
      body: s.done ? `本轮做了 ${s.done} 题，记录都已保存，下次可以接着来。` : '还没答题，直接退出。',
      ok: '退出', cancel: '继续练习',
    })) return
    track('practice_exited', {
      subject: q.subject,
      scope: s.scope,
      answered_count: s.done,
      question_count: s.qs.length,
    })
    onQuit()
  }

  useQuestionNav({ onPick: pick, onPrev: prev, onNext: next, enabled: !sheet && !dialog && !clearing })

  return (
    <>
      <PageHeader
        variant="subpage"
        title={q.chapter}
        className="practice-header"
        subtitle={`本轮答对 ${s.right}/${s.done}`}
        onBack={quit}
        backLabel="退出"
        action={<><button className="practice-sheet-trigger" onClick={openSheet} aria-label="打开练习答题卡" aria-haspopup="dialog"><Icon name="grid" size={16} /><span className="num">{s.i + 1}/{s.qs.length}</span></button><ThemeToggle iconOnly /></>}
        progress={((s.i + 1) / s.qs.length) * 100}
      />

      <div className="card">
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="chip">{q.chapter}</span>
          <span className="chip">{q.source}</span>
          {records[q.id]?.wrongFlag && <span className="chip alert">曾做错</span>}
          {s.done > 0 && (
            <span className="chip grow" style={{ justifyContent: 'flex-end', border: 0, background: 'none' }}>
              本轮 {s.right}/{s.done} 对
            </span>
          )}
          {/* key 换题重挂载，顺带停掉上一题没读完的音 */}
          <Speaker key={q.id} getText={() => qToSpeech(q)} label="朗读题目" />
        </div>
        <Stem text={q.q} />
        <Options q={q} picked={picked} reveal={shown} onPick={pick} />
        {shown && <Explain q={q} picked={picked} />}
      </div>

      <div className="actionbar-gap" />
      <div className="actionbar">
        <div>
          <button disabled={s.i === 0} onClick={prev}><Icon name="left" /> 上一题</button>
          <button className="btn-pri" onClick={next}>
            {s.i === s.qs.length - 1 ? '完成本轮' : '下一题'}<Icon name="right" />
          </button>
        </div>
      </div>
      {sheet && !dialog && <PracticeSheet session={s} records={records} busy={clearing}
        onClose={() => setSheet(false)} onClear={clearSheet}
        onJump={i => { goTo(i); setSheet(false) }} />}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Explain, Icon, Options, PageHeader, Speaker, SubjectSeg } from '../components/ui'
import { qToSpeech } from '../lib/ai'
import { track } from '../lib/analytics'
import { BANK, CALC_IDS, RANDOM_SIZES, bySubject, chapterStats, getRandomN, setRandomN, shuffle, stats } from '../lib/bank'
import { kvGet, kvSet } from '../lib/db'
import { Stem } from '../lib/format'
import { useStore } from '../lib/store'
import { useQuestionNav } from '../lib/useQuestionNav'

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

  async function start(scope, order) {
    // 计算题不分科目：31 道里 29 道在科目二，按科目切会把另一科那 2 道藏起来
    let qs = scope === 'calc'
      ? BANK.filter(q => CALC_IDS.includes(q.id))
      : bySubject(subject)
    if (scope === 'new') qs = qs.filter(q => !records[q.id]?.seen)
    else if (scope === 'wrong') qs = qs.filter(q => records[q.id]?.wrongFlag)
    else if (scope.startsWith('ch:')) qs = qs.filter(q => q.chapter === scope.slice(3))
    if (!qs.length) return toast('这个范围已经没题了，换一个')
    // 随机练习是「一小轮」，抽满题量就够；顺序练习才是从头啃到尾
    if (order === 'rand') qs = shuffle(qs).slice(0, getRandomN())
    const key = keepsCursor(scope) ? `cursor:${subject}:${scope}:${order}` : null
    const saved = key && order === 'seq' ? await kvGet(key, 0) : 0
    const scopeType = scope.startsWith('ch:') ? 'chapter' : scope
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
    ? <Runner session={session} setSession={setSession} onQuit={() => setSession(null)} />
    : <Setup onStart={start} />
}

function Setup({ onStart }) {
  const { records, subject, autoNext, setAutoNext } = useStore()
  const [scope, setScope] = useState('all')
  const [order, setOrder] = useState('seq')
  const [randN, setRandN] = useState(getRandomN)

  const qs = bySubject(subject)
  const st = stats(records, subject)
  // 章节列表全站统一按教材章序，跟首页进去的章节页对齐；
  // 「弱项优先」是推荐视角，留给首页那块「知识点掌握度」，不混进选择器
  const chs = chapterStats(records, subject, true).filter(c => c.total)
  const scopes = [
    { v: 'all', t: '全部题目', n: qs.length },
    { v: 'new', t: '只做没做过的', n: qs.length - st.done },
    { v: 'wrong', t: '只做错题', n: st.wrong },
  ]

  return (
    <>
      <PageHeader title="练习模式" subtitle="选完立刻看解析 · 答错自动进错题本" />
      <SubjectSeg />

      <div className="card">
        <h2>练什么</h2>
        <div className="stack">
          {scopes.map(s => (
            <button className={`row between ${scope === s.v ? 'btn-pri' : ''}`} key={s.v}
              disabled={!s.n} onClick={() => setScope(s.v)}>
              <span>{s.t}</span><span className="num">{s.n}</span>
            </button>
          ))}
        </div>
        <details>
          <summary className="muted">按知识点练 ▾</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {chs.map((c, i) => (
              <button className={`row between ${scope === `ch:${c.chapter}` ? 'btn-pri' : ''}`}
                key={c.chapter} onClick={() => setScope(`ch:${c.chapter}`)}>
                <span><span className="muted num">{i + 1}</span> {c.chapter}</span>
                <span className="muted num">{c.acc === null ? '未做' : `${c.acc}%`} · {c.total}</span>
              </button>
            ))}
          </div>
        </details>
      </div>

      <div className="card">
        <h2>怎么练</h2>
        {/* 题库本来就是按 (科目, 章节) 排好的，所以「顺序」实际就是章节顺序，标签照实写 */}
        <div className="seg">
          <button className={order === 'seq' ? 'on' : ''} onClick={() => setOrder('seq')}>
            章节顺序<small>接着上次</small>
          </button>
          <button className={order === 'rand' ? 'on' : ''} onClick={() => setOrder('rand')}>
            随机<small>打乱抽题</small>
          </button>
        </div>
        {order === 'rand' && (
          <label className="row between">
            <span>这一轮抽多少题<span className="muted" style={{ display: 'block', fontSize: 12 }}>
              下次进来还是这个数</span></span>
            <span className="seg seg-n">
              {RANDOM_SIZES.map(n => (
                <button key={n} className={randN === n ? 'on' : ''}
                  onClick={() => { setRandN(n); setRandomN(n) }}>{n}</button>
              ))}
            </span>
          </label>
        )}
        <label className="row between" style={{ cursor: 'pointer' }}>
          <span>
            答对后自动跳下一题
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>答错会停下看解析</span>
          </span>
          <input type="checkbox" checked={autoNext} onChange={e => setAutoNext(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
        </label>
      </div>

      <button className="btn-pri" style={{ padding: 15 }} onClick={() => onStart(scope, order)}>
        开始练习
      </button>
      <div className="muted" style={{ textAlign: 'center' }}>电脑上可用键盘：A/B/C/D 选择，← → 翻题</div>
    </>
  )
}

function Runner({ session: s, setSession, onQuit }) {
  const { records, autoNext, recordAnswer, toast, ask } = useStore()
  const jumpTimer = useRef(0)
  useEffect(() => () => clearTimeout(jumpTimer.current), [])

  const q = s.qs[s.i]
  const picked = s.picks[s.i]
  const shown = picked !== undefined

  const goTo = i => setSession(p => ({ ...p, i }))

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

  useQuestionNav({ onPick: pick, onPrev: prev, onNext: next })

  return (
    <>
      <PageHeader
        variant="subpage"
        title="练习中"
        subtitle={`${q.chapter} · 本轮答对 ${s.right}/${s.done}`}
        onBack={quit}
        backLabel="退出"
        action={<span className="page-head-stat num">{s.i + 1}/{s.qs.length}</span>}
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
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Explain, Icon, Options, Speaker, SubjectSeg } from '../components/ui'
import { qToSpeech } from '../lib/ai'
import { BANK, CALC_IDS, RANDOM_SIZES, bySubject, chapterStats, getRandomN, setRandomN, shuffle, stats } from '../lib/bank'
import { kvGet, kvSet } from '../lib/db'
import { Stem } from '../lib/format'
import { useStore } from '../lib/store'
import { useQuestionNav } from '../lib/useQuestionNav'

const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches

export default function Practice({ go, setQuiz, initialScope, initialOrder }) {
  const { subject, records, toast } = useStore()
  const [session, setSession] = useState(null)

  // 首页「继续练习」和错题本「错题重练」都跳过选范围，直接开练
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
    const key = `cursor:${subject}:${scope}:${order}`
    const saved = order === 'seq' ? await kvGet(key, 0) : 0
    setSession({ qs, i: Math.min(saved, qs.length - 1), picks: {}, key, order, done: 0, right: 0 })
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
  const chs = chapterStats(records, subject)
  const scopes = [
    { v: 'all', t: '全部题目', n: qs.length },
    { v: 'new', t: '只做没做过的', n: qs.length - st.done },
    { v: 'wrong', t: '只做错题', n: st.wrong },
  ]

  return (
    <>
      <div>
        <h1>练习模式</h1>
        <div className="muted">选完选项立刻出答案和解析，答错自动进错题本</div>
      </div>
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
            {chs.map(c => (
              <button className={`row between ${scope === `ch:${c.chapter}` ? 'btn-pri' : ''}`}
                key={c.chapter} onClick={() => setScope(`ch:${c.chapter}`)}>
                <span>{c.chapter}</span>
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
      await kvSet(s.key, 0)
      toast(s.done ? `本轮做了 ${s.done} 题，对 ${s.right} 题` : '本轮结束')
      return onQuit()
    }
    const i = s.i + 1
    if (s.order === 'seq') await kvSet(s.key, i)
    goTo(i)
  }

  async function pick(idx) {
    if (shown) return
    const at = s.i
    const ok = await recordAnswer(q, idx)
    setSession(p => ({
      ...p, picks: { ...p.picks, [at]: idx }, done: p.done + 1, right: p.right + (ok ? 1 : 0),
    }))
    // 自动跳转前确认用户没有自己翻走
    if (ok && autoNext && at < s.qs.length - 1) {
      jumpTimer.current = setTimeout(() => setSession(p => {
        if (p.i !== at) return p
        if (p.order === 'seq') kvSet(p.key, at + 1)
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
    onQuit()
  }

  useQuestionNav({ onPick: pick, onPrev: prev, onNext: next })

  return (
    <>
      <div className="topbar">
        <button className="btn-sm btn-ghost" onClick={quit} aria-label="退出练习"><Icon name="back" /></button>
        <div className="bar"><i style={{ width: `${((s.i + 1) / s.qs.length) * 100}%` }} /></div>
        <div className="num muted">{s.i + 1}/{s.qs.length}</div>
      </div>

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

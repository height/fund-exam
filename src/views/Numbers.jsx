import { useEffect, useMemo, useState } from 'react'
import { Icon, PageHeader, SubjectSeg } from '../components/ui'
import { PASS, minutesFor } from '../lib/bank'
import { kvGet, kvSet } from '../lib/db'
import { ExplainBody, Stem } from '../lib/format'
import {
  NUMBER_EXAM_N,
  NUMBER_TYPE_LABEL,
  NUMBER_TYPES,
  numberDistractors,
  numberHints,
  numberParts,
  numberQuestions,
  numberType,
} from '../lib/numbers'
import { useStore } from '../lib/store'

const MARK_KEY = subject => `number-cards:${subject}`

export default function Numbers({ go, initialMode, review }) {
  const { subject } = useStore()
  const [mode, setMode] = useState(initialMode === 'exam' ? 'exam' : 'cards')

  useEffect(() => setMode(initialMode === 'exam' ? 'exam' : 'cards'), [initialMode])

  return (
    <>
      <PageHeader
        variant="subpage"
        title={mode === 'exam' ? '数字模拟练习' : review ? '重背本次错题' : '数字必背'}
        subtitle={`${subject} · ${mode === 'exam' ? '混合抽题，交卷后统一判分' : '先自己想，再翻面核对'}`}
        onBack={() => go('home')}
        backLabel="首页"
        action={review && mode === 'cards'
          ? <button onClick={() => go('numbers', { mode: 'cards' })}>看全部</button>
          : undefined}
      />
      <SubjectSeg />

      <div className="seg number-mode" role="tablist">
        <button role="tab" aria-selected={mode === 'cards'} className={mode === 'cards' ? 'on' : ''}
          onClick={() => { setMode('cards'); history.replaceState(null, '', '#/numbers?mode=cards') }}>
          背题卡<small>先记住</small>
        </button>
        <button role="tab" aria-selected={mode === 'exam'} className={mode === 'exam' ? 'on' : ''}
          onClick={() => { setMode('exam'); history.replaceState(null, '', '#/numbers?mode=exam') }}>
          模拟练习<small>再检验</small>
        </button>
      </div>

      {mode === 'cards'
        ? <CardDeck go={go} review={review} />
        : <ExamSetup go={go} />}
    </>
  )
}

function CardDeck({ go, review }) {
  const { subject } = useStore()
  const [marks, setMarks] = useState({})
  const [type, setType] = useState('all')
  const [at, setAt] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const reviewIds = useMemo(() => new Set((review || '').split(',').filter(Boolean)), [review])

  useEffect(() => {
    let live = true
    setMarks({})
    kvGet(MARK_KEY(subject), {}).then(v => { if (live) setMarks(v || {}) })
    return () => { live = false }
  }, [subject])

  const all = useMemo(() => numberQuestions(subject)
    .filter(q => !reviewIds.size || reviewIds.has(q.id)), [subject, reviewIds])

  const cards = useMemo(() => all.filter(q => {
    if (type === 'all') return true
    if (type === 'fuzzy') return marks[q.id] === 'fuzzy'
    return numberType(q) === type
  }), [all, type, marks])

  useEffect(() => { setAt(0); setRevealed(false) }, [subject, type, review])
  useEffect(() => {
    if (cards.length && at >= cards.length) { setAt(0); setRevealed(false) }
  }, [cards.length, at])

  const known = all.filter(q => marks[q.id] === 'known').length
  const fuzzy = all.filter(q => marks[q.id] === 'fuzzy').length
  const q = cards[at]
  const hints = q ? numberHints(q.options[q.answer]) : []

  function move(delta) {
    if (!cards.length) return
    setAt(i => (i + delta + cards.length) % cards.length)
    setRevealed(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function mark(value) {
    const next = { ...marks, [q.id]: value }
    setMarks(next)
    kvSet(MARK_KEY(subject), next)
    move(1)
  }

  const filters = [...NUMBER_TYPES, ['fuzzy', '还模糊']]

  return (
    <>
      <div className="number-ledger" aria-label="题卡状态">
        <span>共 <b>{all.length}</b> 张</span>
        <span>记住 <b>{known}</b></span>
        <span>模糊 <b className={fuzzy ? 'warn' : ''}>{fuzzy}</b></span>
      </div>

      {!reviewIds.size && (
        <div className="number-filters" aria-label="筛选题卡">
          {filters.map(([v, label]) => {
            const n = v === 'all' ? all.length
              : v === 'fuzzy' ? fuzzy
              : all.filter(q => numberType(q) === v).length
            return (
              <button key={v} className={`chip ${type === v ? 'on' : ''}`} onClick={() => setType(v)}>
                {label}<span className="num">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {!q ? (
        <div className="empty">
          <div><b>{type === 'fuzzy' ? '没有标记为模糊的题卡' : '这个范围没有题卡'}</b>换一个分类继续背。</div>
          <button className="btn-sm" onClick={() => setType('all')}>看全部题卡</button>
        </div>
      ) : (
        <>
          <article className={`number-card ${revealed ? 'revealed' : ''}`}>
            <div className="number-card-meta">
              <span className="chip">{NUMBER_TYPE_LABEL[numberType(q)]}</span>
              <span className="muted">{q.chapter}</span>
              <span className="num muted">{at + 1}/{cards.length}</span>
            </div>

            <div className="number-cue">
              <Stem text={q.q} />
            </div>

            {!revealed ? (
              <div className="number-cover">
                <div className="number-lock" aria-hidden="true">
                  {hints.map((hint, i) => (
                    <span className="number-lock-part" key={`${hint.mask}:${hint.unit}:${i}`}>
                      {i > 0 && <b />}
                      <i>{hint.mask}</i>
                      {hint.unit && <em>{hint.unit}</em>}
                    </span>
                  ))}
                </div>
                <div className="muted">单位已经给出，先在心里说出完整数字</div>
                <button className="btn-pri" onClick={() => setRevealed(true)}>翻到答案</button>
              </div>
            ) : (
              <CardAnswer q={q} />
            )}
          </article>

          {revealed && (
            <div className="grid2 number-mark">
              <button onClick={() => mark('fuzzy')}><Icon name="refresh" /> 还模糊</button>
              <button className="btn-pri" onClick={() => mark('known')}><Icon name="done" /> 记住了</button>
            </div>
          )}

          <div className="number-nav">
            <button onClick={() => move(-1)}><Icon name="left" /> 上一张</button>
            <button onClick={() => move(1)}>下一张 <Icon name="right" /></button>
          </div>
        </>
      )}
    </>
  )
}

function CardAnswer({ q }) {
  const distractors = numberDistractors(q)
  const parts = numberParts(q.options[q.answer])

  return (
    <div className="number-answer">
      <div className="eyebrow">正确答案</div>
      {parts.length > 0 && (
        <div className="number-parts" aria-hidden="true">
          {parts.map((p, i) => <strong key={`${p}:${i}`}>{p}</strong>)}
        </div>
      )}
      <div className="number-answer-text">{q.options[q.answer]}</div>

      {distractors.length > 0 && (
        <div className="number-confuse">
          <div className="eyebrow">别和这些混在一起</div>
          <div className="stack">
            {distractors.map(x => <div key={x.i}><span>{'ABCD'[x.i]}</span>{x.text}</div>)}
          </div>
        </div>
      )}

      {q.explain && (
        <details className="number-explain">
          <summary>看记忆依据</summary>
          <ExplainBody text={q.explain} />
        </details>
      )}
    </div>
  )
}

function ExamSetup({ go }) {
  const { subject } = useStore()
  const total = numberQuestions(subject).length
  const n = Math.min(NUMBER_EXAM_N, total)

  const start = () => go('exam', { scope: 'numbers' })

  return (
    <>
      <button className="number-exam-all" disabled={!total} onClick={start}>
        <span className="number-exam-mark num">{n}</span>
        <span className="ch-body">
          <b>全部数字考点</b>
          <small className="muted">跨章节随机抽 {n}/{total} 题 · {minutesFor(n)} 分钟 · {PASS} 分及格</small>
        </span>
        <Icon name="right" />
      </button>

      <div className="number-exam-note">
        <Icon name="dice" />
        <div><b>为什么混在一起考</b><span>章节提示会降低辨认难度；混合抽题才能检验你是否记住了完整限定条件。</span></div>
      </div>
    </>
  )
}

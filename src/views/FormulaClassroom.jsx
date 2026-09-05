import { useEffect, useReducer, useRef, useState } from 'react'
import { PageHeader, Icon } from '../components/ui'
import FormulaReference from './Formula'
import FormulaScene, { FormulaExpression } from '../components/formula/FormulaScenes'
import { BRIDGES, COURSE_PATHS, COURSE_UNITS, DIMENSIONS, DIMENSION_NAMES, courseUnit, guidedQuestion } from '../data/formulaCourses'
import { judgeQuestion, formatNumber as f, parseNumeric } from '../lib/formulaMath'
import { emptyProgress, evidenceFor, formulaReducer, initialCursor, nextQuestion, questionById } from '../lib/formulaProgress'
import { loadFormulaProgress, saveFormulaProgress } from '../lib/formulaStorage'
import '../formulaClassroom.css'

const dateLabel = at => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const answerLabel = q => q.options ? q.answer : `${f(q.answer, q.digits ?? 2)} ${q.unit}`

export default function FormulaClassroom({ go, unitId, mode }) {
  const [progress, dispatch] = useReducer(formulaReducer, undefined, emptyProgress)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const [clock, setClock] = useState(Date.now())
  const live = useRef(true)
  const lastSave = useRef(0)
  const dirty = useRef(false)
  const root = useRef(null)
  const load = () => {
    setLoadError(false)
    loadFormulaProgress().then(value => { if (live.current) { dispatch({ type: 'load', value }); setLoaded(true) } }).catch(() => { if (live.current) setLoadError(true) })
  }
  useEffect(() => { live.current = true; load(); return () => { live.current = false } }, [])
  useEffect(() => {
    const update = () => setClock(Date.now())
    const timer = setInterval(update, 30000)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  useEffect(() => {
    document.documentElement.toggleAttribute('data-formula-classroom', mode !== 'reference')
    return () => document.documentElement.removeAttribute('data-formula-classroom')
  }, [mode])
  const persist = value => {
    const serial = ++lastSave.current
    setSaveState('saving')
    saveFormulaProgress(value).then(() => { if (live.current && serial === lastSave.current) setSaveState('saved') }).catch(() => { if (live.current && serial === lastSave.current) setSaveState('error') })
  }
  useEffect(() => { if (loaded && dirty.current) persist(progress) }, [progress, loaded])
  const send = action => { dirty.current = true; dispatch({ ...action, at: action.at ?? Date.now() }) }
  const unit = courseUnit(unitId)
  useEffect(() => {
    if (loaded && unit && !progress.units[unit.id]) send({ type: 'cursor', unitId: unit.id, patch: {} })
  }, [loaded, unitId])

  if (mode === 'reference') return <><div className="fc-reference-note"><button className="btn-sm" onClick={() => go('formula')}>返回微课堂</button><span>公式查阅 · 旧版勾选仅为历史记录，不计入新课程能力。</span></div><FormulaReference go={go} referenceOnly /></>
  if (!loaded) return <div className="fc-loading" role="status">{loadError ? <><p>暂时无法读取学习记录，请重试。</p><button onClick={load}>重新读取</button></> : '正在读取本机学习记录…'}</div>
  return <div className="fc-root" ref={root}>
    <PageHeader variant="subpage" title="公式攻坚" subtitle={unit ? `${unit.title} · 5–8 分钟` : '先懂关系，再独立做题'} onBack={() => go(unit ? 'formula' : 'home')} backLabel={unit ? '学习路径' : '首页'} />
    <div className="fc-save" role="status">{saveState === 'error' ? <><span>本次进度未保存</span><button onClick={() => persist(progress)}>重试保存</button></> : saveState === 'saving' ? '正在保存…' : '学习记录保存在本机'}</div>
    {unitId && !unit ? <div className="fc-panel"><h2>没有找到这节课</h2><button className="btn-pri" onClick={() => go('formula')}>返回学习路径</button></div> : unit ? <Lesson key={unit.id} unit={unit} progress={progress} send={send} go={go} now={clock} /> : mode === 'diagnostic' ? <Diagnostic progress={progress} send={send} onDone={() => go('formula')} /> : <CourseHome progress={progress} go={go} now={clock} />}
  </div>
}

function CourseHome({ progress, go, now }) {
  const due = COURSE_UNITS.filter(u => evidenceFor(u, progress, now).status === '待复习')
  const started = COURSE_UNITS.filter(u => progress.units[u.id] && evidenceFor(u, progress, now).status === '学习中').sort((a, b) => progress.units[b.id].cursor.updatedAt - progress.units[a.id].cursor.updatedAt)
  const next = started[0] || COURSE_UNITS.find(u => !progress.units[u.id]) || COURSE_UNITS[0]
  const allStarted = COURSE_UNITS.every(u => progress.units[u.id])
  return <>
    <section className="fc-welcome">
      <span className="fc-kicker">一节课，解决一个问题</span>
      <h1>公式，从你算过的<br />每一步里长出来。</h1>
      <p>先把钱数清楚，再把关系写出来。老师带一遍，下一遍交给你。</p>
      <button className="btn-pri" onClick={() => go('formula', { unit: next.id })}><Icon name="play" />{started.length ? '继续学习' : allStarted ? '回顾课程' : '开始第一节课'}<span>{next.title}</span></button>
    </section>
    {!!due.length && <section className="fc-review-list"><h2>隔一天，再试一次</h2><p>换一道新题，看看关系还记得吗。</p>{due.map(u => <button key={u.id} onClick={() => go('formula', { unit: u.id })}><span>{u.title}</span><b>待复习 <Icon name="right" /></b></button>)}</section>}
    <div className="fc-diagnostic-link"><div><b>{progress.diagnostic.completed ? '基础诊断已完成' : '先检查四个小基础'}</b><p>百分数、比较基准、负数、重复相乘。可随时跳过。</p></div><button className="btn-sm" onClick={() => go('formula', { mode: 'diagnostic' })}>{progress.diagnostic.completed ? '重新检查' : '做四道小题'}</button></div>
    <div className="fc-paths">{COURSE_PATHS.map((path, i) => <section className="fc-path" key={path.id}>
      <div className="fc-path-heading"><span className="fc-path-number">{i + 1}</span><div><h2>{path.title}</h2><p>{path.description}</p></div></div>
      {path.units.map(id => { const u = courseUnit(id), e = evidenceFor(u, progress, now); return <button className="fc-unit-link" key={id} onClick={() => go('formula', { unit: id })}><div><b>{u.title}</b><span>{u.subtitle}</span></div><small className={e.consolidated ? 'fc-positive' : ''}>{e.status}</small><Icon name="right" /></button> })}
    </section>)}</div>
    <section className="fc-reference-link"><div><h2>需要查一条公式？</h2><p>原有 47 组公式与变体都在这里，随时翻阅。</p></div><button className="btn-sm" onClick={() => go('formula', { mode: 'reference' })}>打开公式目录 <Icon name="right" /></button></section>
  </>
}

function Diagnostic({ progress, send, onDone }) {
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState('')
  const [checked, setChecked] = useState(false)
  const b = BRIDGES[index]
  const submit = () => { setChecked(true); send({ type: 'diagnostic', patch: { answers: { ...progress.diagnostic.answers, [b.id]: picked } } }) }
  const next = () => { if (index === 3) { send({ type: 'diagnostic', patch: { completed: true } }); onDone() } else { setIndex(index + 1); setPicked(''); setChecked(false) } }
  return <section className="fc-panel"><div className="fc-between"><span>基础诊断 {index + 1} / 4</span><button className="btn-sm btn-ghost" onClick={onDone}>跳过，直接学习</button></div><h1>{b.question}</h1>
    <div className="fc-options">{b.options.map(option => <button key={option} aria-pressed={picked === option} disabled={checked} onClick={() => setPicked(option)}>{option}</button>)}</div>
    {!checked ? <button className="btn-pri" disabled={!picked} onClick={submit}>检查这一题</button> : <><div className={`fc-feedback ${picked === b.answer ? 'is-correct' : ''}`} role="status"><b>{picked === b.answer ? '这个基础可以用起来了' : '从这个小关系补起'}</b><p>{b.explanation}</p></div><button className="btn-pri" onClick={next}>{index === 3 ? '回到学习路径' : '下一道'}</button></>}
  </section>
}

function Bridge({ bridge, onClose, onPass }) {
  const [picked, setPicked] = useState('')
  const [checked, setChecked] = useState(false)
  return <section className="fc-bridge"><div className="fc-between"><h2>{bridge.title}</h2><button className="btn-sm btn-ghost" onClick={onClose}>回到当前问题</button></div><p>{bridge.explanation}</p><p><b>{bridge.followup}</b></p><div className="fc-options">{bridge.followOptions.map(value => <button key={value} aria-pressed={picked === value} onClick={() => { setPicked(value); setChecked(true); if (value === bridge.followAnswer) onPass() }}>{value}</button>)}</div>{checked && <p role="status">{picked === bridge.followAnswer ? '这次对了。回到原题，用同样的关系再想一遍。' : '再对照上面的例子：先把数量写清楚，不急着记符号。'}</p>}</section>
}

function Lesson({ unit, progress, send, go, now }) {
  const data = progress.units[unit.id]
  const cursor = data?.cursor || initialCursor()
  const e = evidenceFor(unit, progress, now)
  const [bridge, setBridge] = useState(null)
  const heading = useRef(null)
  const patch = value => send({ type: 'cursor', unitId: unit.id, patch: value })
  const event = (qid, type, input = '') => send({ type: 'event', unitId: unit.id, event: { id: crypto.randomUUID(), qid, type, input, at: Date.now() } })
  const step = unit.steps[cursor.step]
  const isLesson = cursor.phase === 'lesson' && !!step
  const q = isLesson ? guidedQuestion(unit, cursor.step) : unit.questions.find(item => item.id === cursor.qid)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start' })
  }, [cursor.step, cursor.qid, cursor.phase])
  const begin = (phase = 'assessment') => {
    const state = evidenceFor(unit, progress, Date.now())
    if (phase === 'review' && state.status !== '待复习' && !state.consolidated) return
    const dim = DIMENSIONS.find(d => phase === 'review' ? !state.reviewed[d] : state.passed[d] === undefined)
    if (!dim) { patch({ phase, qid: null, step: unit.steps.length, input: '' }); return }
    const fresh = nextQuestion(unit, progress, phase, dim)
    patch({ phase, dimension: dim, qid: fresh?.id || null, step: unit.steps.length, input: '' })
    setBridge(null)
  }
  const advance = () => {
    if (isLesson) { if (cursor.step === unit.steps.length - 1) begin(); else patch({ step: cursor.step + 1, input: '', qid: null }); return }
    const state = evidenceFor(unit, progress, Date.now())
    begin(cursor.phase === 'review' && state.independentAt !== null ? 'review' : 'assessment')
  }
  // On a return visit, the summary advertises a due review without replacing unfinished answers.
  const exhausted = !isLesson && !q && (cursor.phase === 'assessment' ? e.independentAt === null : !e.consolidated)
  const weak = BRIDGES.filter(b => unit.prerequisites.includes(b.id) && progress.diagnostic.answers[b.id] && progress.diagnostic.answers[b.id] !== b.answer)
  const openBridge = id => { if (q && !isLesson) event(q.id, 'hint'); setBridge(id) }
  return <>
    <div className="fc-lesson-top"><div><span className="fc-kicker">{isLesson ? `带着做 · 第 ${cursor.step + 1} / ${unit.steps.length} 步` : cursor.phase === 'review' ? '隔日复查 · 换一道新题' : '撤掉提示 · 自己试一遍'}</span><h1 ref={heading} tabIndex="-1">{isLesson ? step.title : q ? DIMENSION_NAMES[q.dimension] : exhausted ? '这组新题已经练完' : e.status === '待复习' ? '隔了一天，再独立试一次' : '把这一节的关系带走'}</h1></div><span className="fc-status">{e.status}</span></div>
    <div className="fc-capabilities" aria-label="独立完成的证据">{DIMENSIONS.map(d => <span key={d} className={e.passed[d] !== undefined ? 'done' : ''}>{e.passed[d] !== undefined ? '✓ ' : ''}{DIMENSION_NAMES[d]}</span>)}</div>
    {e.reviewFailure && e.passed[e.reviewFailure] === undefined && <div className="fc-foundation"><span>复查时「{DIMENSION_NAMES[e.reviewFailure]}」还需要帮助，补一下，再用新题检验。</span><button onClick={() => patch({ phase: 'lesson', step: e.reviewFailure === 'relation' ? unit.steps.length - 1 : 2, qid: null, input: '' })}>回到对应示范</button></div>}
    {!!weak.length && isLesson && e.independentAt === null && <div className="fc-foundation"><span>基础诊断建议补一下：</span>{weak.map(b => <button key={b.id} onClick={() => openBridge(b.id)}>{b.title}</button>)}</div>}
    {bridge && <Bridge key={bridge} bridge={BRIDGES.find(b => b.id === bridge)} onClose={() => setBridge(null)} onPass={() => send({ type: 'diagnostic', patch: { answers: { ...progress.diagnostic.answers, [bridge]: BRIDGES.find(b => b.id === bridge).answer } } })} />}
    {isLesson ? <div className={`fc-class-layout ${step.action !== 'observe' ? 'is-guided' : ''}`}>
      <div className="fc-left"><p className="fc-story"><b>原题情境</b><br />{unit.story}</p><FormulaScene key={`${unit.id}:${cursor.step}`} unit={unit} interactive={step.action === 'observe'} /></div>
      <section className="fc-workspace">
        {!q && <p className="fc-teacher">{step.text}</p>}
        {step.action === 'observe' && <><p>{unit.explanation}</p><p className="muted">下面一步回到原题的数字，一起算。</p></>}
        {step.action === 'formula' && <FormulaExpression unit={unit} />}
        {q && <Question key={q.id} q={q} unit={unit} data={data} input={cursor.input} onInput={input => patch({ input })} onEvent={event} onNext={advance} guided onBridge={openBridge} />}
        {!q && <button className="btn-pri" onClick={advance}>{step.action === 'formula' ? '收起提示，独立试一遍' : '跟着算下一步'} <Icon name="right" /></button>}
        {cursor.step > 0 && <button className="fc-text-button" onClick={() => patch({ step: cursor.step - 1, input: '' })}>回看上一步</button>}
        <details className="fc-notebook"><summary>我已经算过的步骤</summary><Notebook unit={unit} data={data} /></details>
      </section>
    </div> : q ? <section className="fc-assessment fc-panel">
      <p className="muted">{q.source} · {cursor.phase === 'review' ? '延迟复查' : '独立测评'} · 可用计算器</p>
      <Question key={q.id} q={q} unit={unit} data={data} input={cursor.input} onInput={input => patch({ input })} onEvent={event} onNext={advance} onBridge={openBridge} />
    </section> : <section className="fc-panel fc-summary">
      {exhausted ? <><p>本轮「{DIMENSION_NAMES[cursor.dimension]}」的新题已经用完。重复答同一题可以练习，但不会增加独立通过记录。</p><p>可以回看示范、复习刚才的题，或练习其他课程。</p></> : <><p>{e.consolidated ? '这节课的三项能力都通过了隔日新题复查。之后遇到题目，先认关系，再做计算。' : e.status === '待复习' ? '这一次换了数字和情境，检查关系是否还记得。' : '你已经在新题中独立建立关系、计算并完成迁移。隔一天再试一次，才知道是否记牢。'}</p>{e.dueAt && !e.consolidated && <p className="fc-review-date">复查时间：{dateLabel(e.dueAt)} 起</p>}</>}
      {e.status === '待复习' && <button className="btn-pri" onClick={() => begin('review')}>开始隔日复查</button>}
      <p>{unit.check}</p>
      <div className="fc-summary-actions"><button className="btn-sm" onClick={() => patch({ phase: 'lesson', step: 0, qid: null, input: '' })}>再看一遍示范</button>{unit.bankIds.length > 0 && <button className="btn-sm" onClick={() => go('practice', { scope: `formula:${unit.id}`, order: 'seq' })}>去题库定向练 {unit.bankIds.length} 题</button>}<button className="btn-pri" onClick={() => { const index = COURSE_UNITS.findIndex(u => u.id === unit.id); go('formula', index < COURSE_UNITS.length - 1 ? { unit: COURSE_UNITS[index + 1].id } : {}) }}>{unit.id === 'expectation' ? '返回学习路径' : '去下一节课'}</button></div>
      {!unit.bankIds.length && <p className="muted">当前题库暂无核对通过的直接对应题，本节使用明确标注的教学自编题。</p>}
      <details><summary>回看本节作答（不增加掌握记录）</summary><Notebook unit={unit} data={data} all /></details>
    </section>}
    <div className="fc-lesson-tools">
      {isLesson && <button className="fc-text-button" onClick={() => begin(e.status === '待复习' ? 'review' : 'assessment')}>{e.status === '待复习' ? '直接开始隔日复查' : '我想直接试独立测评'}</button>}
      <details><summary>需要补一个数学基础</summary><div className="fc-foundation">{BRIDGES.filter(b => unit.prerequisites.includes(b.id)).map(b => <button key={b.id} onClick={() => openBridge(b.id)}>{b.title}</button>)}</div></details>
      {q && !isLesson && <button className="fc-text-button" onClick={() => { event(q.id, 'hint'); patch({ phase: 'lesson', step: 0, qid: null, input: '' }) }}>回示范补一下，再换新题</button>}
    </div>
  </>
}

function Question({ q, unit, data, input, onInput, onEvent, onNext, guided = false, onBridge }) {
  const [invalid, setInvalid] = useState(false)
  const [followup, setFollowup] = useState('')
  const events = (data?.events || []).filter(e => e.qid === q.id)
  const last = events.filter(e => e.type === 'answer').at(-1)
  const hasHint = events.some(e => e.type === 'hint')
  const revealed = events.some(e => e.type === 'reveal')
  const correct = last ? judgeQuestion(q, last.input).correct : false
  const shownInput = correct ? last.input : input
  const firstAnswer = events.find(e => e.type === 'answer')
  const independent = !guided && firstAnswer && judgeQuestion(q, firstAnswer.input).correct && !events.slice(0, events.indexOf(firstAnswer)).some(e => e.type !== 'answer')
  const attempted = !!last
  const submit = e => {
    e.preventDefault()
    if (correct) return
    const result = judgeQuestion(q, input)
    if (!result.valid) { setInvalid(true); return }
    setInvalid(false)
    onEvent(q.id, 'answer', input)
  }
  const mistake = !correct && last && !q.options ? q.errors?.find(error => Math.abs(Number(error.value.toFixed(q.digits ?? 2)) - parseNumeric(last.input, q.unit)) < 1e-7) : null
  return <div className="fc-question">
    <form onSubmit={submit}>
      <h2>{q.question}</h2>
      {q.options ? <fieldset className="fc-options"><legend className="sr-only">选择你的答案</legend>{q.options.map(option => <label key={option} className={shownInput === option ? 'selected' : ''}><input type="radio" name={q.id} value={option} checked={shownInput === option} disabled={correct} onChange={() => { onInput(option); setInvalid(false) }} /><span>{option}</span></label>)}</fieldset> : <><label className="fc-answer-label" htmlFor={`answer-${q.id}`}>你的答案（{q.unit}）</label><div className="fc-number-input"><input id={`answer-${q.id}`} value={shownInput} inputMode="decimal" autoComplete="off" disabled={correct} aria-describedby={`note-${q.id}`} onChange={e => { onInput(e.target.value); setInvalid(false) }} /><span>{q.unit}</span></div><p className="muted" id={`note-${q.id}`}>四舍五入保留两位小数，整数可直接填写。{q.unit === '%' && '例如 8% 填 8，不填 0.08。'}</p></>}
      {invalid && <p className="fc-negative" role="alert">{q.options ? '先选择一个答案。' : '请填写有效数字，不要带单位或千位分隔符。'}</p>}
      {!correct && <button className="btn-pri" type="submit">{attempted ? '修正后再检查' : '检查答案'}</button>}
    </form>
    {last && <div className={`fc-feedback ${correct ? 'is-correct' : ''}`} role="status">
      <b>{correct ? guided ? '这一步算对了' : independent ? '这次是你独立完成的' : '这道练习完成了，再换一道新题' : '先定位卡住的那一步'}</b>
      {correct ? <p>{q.explanation}</p> : mistake ? <p>{mistake.text}</p> : <><p>仅凭这个答案还不能确定原因。你卡在了哪一步？</p><div className="fc-switch">{[['quantity', '没读懂数量'], ['relation', '不知道怎么列式'], ['calculation', '计算或单位卡住']].map(([id, title]) => <button key={id} aria-pressed={followup === id} onClick={() => setFollowup(id)}>{title}</button>)}</div>{followup && <p>{followup === 'quantity' ? '重新读题：哪些是已知数量，题目最后问的是金额还是比例？把它们分开记下来。' : followup === 'relation' ? q.hint : '先检查百分数是否除以 100、负号是否保留，再用计算器逐步核对。'}</p>}</>}
      {!guided && !independent && <small>提示、看答案或修正后的作答只计练习，不增加独立通过记录。</small>}
    </div>}
    {(hasHint || revealed) && <div className="fc-hint" role="status"><b>{revealed ? `这道题的答案：${answerLabel(q)}` : '给你一个台阶'}</b><p>{revealed ? q.explanation : q.hint}</p></div>}
    <div className="fc-question-actions">
      {correct && <button className="btn-pri" onClick={onNext}>{guided ? '继续下一步' : independent ? '继续检验' : '换一道新题再试'} <Icon name="right" /></button>}
      {!correct && <><button className="btn-sm btn-ghost" onClick={() => onEvent(q.id, 'hint')}>给我一点提示</button><button className="btn-sm btn-ghost" onClick={() => onEvent(q.id, 'reveal')}>看完整解法</button>{(attempted || hasHint || revealed) && !guided && <button className="btn-sm" onClick={onNext}>换一道新题</button>}</>}
      {(attempted || hasHint) && !correct && <button className="btn-sm btn-ghost" onClick={() => onBridge(unit.prerequisites[0])}>补一个小基础</button>}
    </div>
  </div>
}

function Notebook({ unit, data, all = false }) {
  const events = (data?.events || []).filter(e => e.type === 'answer' && (all || e.qid.includes(':guided:')))
  if (!events.length) return <p className="muted">算过的步骤会留在这里。</p>
  return <ol className="fc-notebook-list">{events.map(e => { const q = questionById(unit, e.qid); if (!q) return null; return <li key={e.id}><p>{q.question}</p><b>{e.input} {q.options ? '' : q.unit} · {judgeQuestion(q, e.input).correct ? '答对' : '需修正'}</b>{all && <p>解析：{q.explanation}</p>}</li> })}</ol>
}

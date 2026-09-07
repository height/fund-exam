import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/ui'
import { COURSE_UNITS } from '../data/formulaCourses'
import { COURSE_TOPIC, CURRICULUM_SOURCES, FORMULA_CHAPTERS, FORMULA_TOPICS, formulaTopic, selectFormulaTopics } from '../data/formulaCurriculum'
import { evidenceFor } from '../lib/formulaProgress'
import { FinanceMap, FinanceTeaching } from '../components/formula/FinanceTeaching'
import '../formulaLibrary.css'

const stages = ['概念与公式', '例题解析', '检验理解']

export default function FormulaLibrary({ go, topicId, chapter: chapterParam, query = '', stage = '0', progress, now }) {
  const topic = formulaTopic(topicId)
  const chapter = String(chapterParam ?? topic?.chapter ?? '3')
  const [search, setSearch] = useState(query)
  useEffect(() => setSearch(query), [query])
  const open = id => go('formula', { topic: id, chapter, ...(query ? { q: query } : {}) })
  if (topicId) return topic ? <Topic key={topic.id} topic={topic} stage={stage} go={go} chapter={chapter} query={query} progress={progress} now={now} /> : <section className="fc-panel"><h1>没有找到这组公式</h1><button className="btn-pri" onClick={() => go('formula')}>返回公式目录</button></section>
  const filtered = selectFormulaTopics({ chapter, query })
  const selected = FORMULA_CHAPTERS.find(c => String(c.number) === chapter)
  const active = COURSE_UNITS.filter(u => progress.units[u.id]).sort((a, b) => (progress.units[b.id].cursor.updatedAt || 0) - (progress.units[a.id].cursor.updatedAt || 0))
  const due = active.filter(u => evidenceFor(u, progress, now).status === '待复习')
  const update = (nextChapter, nextQuery = query) => go('formula', { chapter: nextChapter, ...(nextQuery ? { q: nextQuery } : {}) })
  return <>
    <section className="fl-intro"><div><span className="fc-kicker">科目二 · 证券投资基金基础知识</span><h1>按章节学懂公式</h1><p>先选知识点，弄清每个量是什么，再看例题、自己做一题。</p></div><div className="fl-intro-count"><strong>{FORMULA_TOPICS.length}</strong><span>组公式与相关变式<br />按 2026 年大纲章、节归类</span></div></section>
    <div className="fl-start"><div><b>{active.length ? `上次带练：${active[0].title}` : '第一次来？从会计恒等式开始'}</b><p>{active.length ? '继续保留的学习步骤，也可以直接在下面选公式。' : '先理解资产、负债、所有者权益，再学财务比率。'}</p></div><button className="btn-pri" onClick={() => active.length ? go('formula', { unit: active[0].id }) : open(1)}>{active.length ? '继续带练' : '开始学习'} <Icon name="right" /></button></div>
    <div className="fl-catalog">
      <aside className="fl-sidebar" aria-label="科目二章节目录"><h2>章节目录</h2><p>数字为本频道公式组数</p><nav><button aria-current={!chapter ? 'page' : undefined} onClick={() => update('')}>全部章节 <span>{FORMULA_TOPICS.length}</span></button>{FORMULA_CHAPTERS.map(c => <button key={c.number} aria-current={chapter === String(c.number) ? 'page' : undefined} onClick={() => update(String(c.number))}><span className="fl-ch-number">{String(c.number).padStart(2, '0')}</span><span className="fl-ch-name">{c.title}</span><small>{c.topics.length || '—'}</small></button>)}</nav></aside>
      <div className="fl-content">
        <label className="fl-mobile-chapter">选择章节<select value={chapter} onChange={e => update(e.target.value)}><option value="">全部章节</option>{FORMULA_CHAPTERS.map(c => <option key={c.number} value={c.number}>第{c.number}章 {c.title}（{c.topics.length}组）</option>)}</select></label>
        <form className="fl-search" role="search" onSubmit={e => { e.preventDefault(); update(chapter, search.trim()) }}><label htmlFor="formula-search">查找公式或术语</label><div><Icon name="search" /><input id="formula-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="例如：权益乘数、ROE、久期" /><button className="btn-sm" type="submit">搜索</button></div></form>
        <div className="fl-list-heading"><div><span className="fc-kicker">{selected ? `第 ${selected.number} 章` : '全部章节'}</span><h2>{selected?.title || '科目二公式目录'}</h2></div><span role="status">{filtered.length} 组{query ? '搜索结果' : '公式'}</span></div>
        {query && <div className="fl-filter"><span>关键词：{query}</span><button onClick={() => update(chapter, '')}>清除关键词</button>{chapter && <button onClick={() => update('', query)}>搜索全部章节</button>}</div>}
        {chapter === '3' && !query && <details className="fl-map"><summary>财务报表分析：四类指标分别看什么？</summary><FinanceMap open={open} /></details>}
        {!filtered.length ? <section className="fl-empty"><h3>{query ? '没有找到匹配的公式' : '本章暂未编入独立公式课'}</h3><p>{query ? '试试公式全称、常用简称，或扩大到全部章节。' : '这不表示本章没有考点。请结合教材学习概念、规则与业务流程，本频道不能代替全科教材。'}</p><button className="btn-sm" onClick={() => update('', '')}>查看全部公式</button></section> : <div className="fl-topic-list">{filtered.map((t, index) => <div key={t.id}>{(index === 0 || filtered[index - 1].section !== t.section || filtered[index - 1].chapter !== t.chapter) && <h3 className="fl-section-label">{!chapter && `第${t.chapter}章 · `}第{t.code.split('.')[1]}节 {t.section}</h3>}<button className="fl-topic-row" onClick={() => open(t.id)}><div><b>{t.title}</b><span>{[t.formula, ...t.also.slice(0, 2).map(v => v.label)].join(' · ')}</span><small>大纲 {t.code} · 知识点要求：{t.level}{COURSE_UNITS.some(u => u.legacyIds.includes(t.id)) ? ' · 有分步带练' : ''}</small></div><Icon name="right" /></button></div>)}</div>}
      </div>
    </div>
    <details className="fl-practice-list"><summary>分步带练 · {COURSE_UNITS.length} 节{due.length ? ` · ${due.length} 节待复习` : ''}</summary><p>需要更多帮助时，按步骤填答案。独立测评通过后，再用隔日新题检查是否记牢。</p>{COURSE_UNITS.map(u => <button className="fl-course-row" key={u.id} onClick={() => go('formula', { unit: u.id })}><span><b>{u.title}</b><small>{formulaTopic(COURSE_TOPIC[u.id]).chapterTitle} · {u.subtitle}</small></span><small>{evidenceFor(u, progress, now).status} →</small></button>)}<button className="fc-text-button" onClick={() => go('formula', { mode: 'diagnostic' })}>补习百分数、负数等数学基础（4 题）</button></details>
    <SourceNote />
  </>
}

function SourceNote() {
  return <details className="fl-source"><summary>目录依据与使用范围</summary><p>章名、节名与能力要求依据中国证券投资基金业协会《证券投资基金基础知识考试大纲（2026年度修订）》。大纲编号表示公式所归属的知识点，不表示大纲逐条列出了这些公式。</p><p>教材依据指向协会公布的新版《证券投资基金》（2025年出版）。本频道尚未完成教材全文逐页核对，{FORMULA_TOPICS.length} 组内容不代表全科全部考点；例题和检验题为教学自编。培训课件仅作讲解参考。</p><div><a href={CURRICULUM_SOURCES.outline} target="_blank" rel="noreferrer">官方科目二大纲 ↗</a><a href={CURRICULUM_SOURCES.textbook} target="_blank" rel="noreferrer">协会教材说明 ↗</a></div></details>
}

function Topic({ topic: t, stage, go, chapter, query, progress, now }) {
  const current = Math.min(2, Math.max(0, Math.trunc(Number(stage) || 0)))
  const [variant, setVariant] = useState(0)
  const [picked, setPicked] = useState('')
  const [checked, setChecked] = useState(false)
  const heading = useRef(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [t.id, current])
  const params = { topic: t.id, chapter, ...(query ? { q: query } : {}) }
  const changeStage = value => go('formula', { ...params, stage: value })
  const variants = [{ label: t.title, expression: t.formula }, ...t.also]
  const courses = COURSE_UNITS.filter(u => u.legacyIds.includes(t.id))
  const list = selectFormulaTopics({ chapter, query })
  const index = list.findIndex(x => x.id === t.id)
  const next = index >= 0 ? list[index + 1] : null
  const options = [...t.test[2]]
  options.splice(t.id % 3, 0, t.test[1])
  return <article className="fl-detail">
    <div className="fl-breadcrumb"><button onClick={() => go('formula', { chapter, ...(query ? { q: query } : {}) })}>公式目录</button><span>/</span><button onClick={() => go('formula', { chapter: t.chapter })}>第{t.chapter}章 {t.chapterTitle}</button><span>/ 第{t.code.split('.')[1]}节 {t.section}</span></div>
    <header className="fl-topic-heading"><div><span className="fc-kicker">大纲 {t.code} · 知识点要求：{t.level}</span><h1 ref={heading} tabIndex={-1}>{t.title}</h1></div><span>{current + 1} / 3</span></header>
    <nav className="fl-stages" aria-label="本组公式学习步骤">{stages.map((label, i) => <button key={label} aria-current={current === i ? 'step' : undefined} onClick={() => changeStage(i)}><span>{i + 1}</span>{label}</button>)}</nav>
    <p className="fl-task">本步任务：{['知道公式算什么，认清符号和适用条件。', '先读已知条件，再看如何代入、计算和解释结果。', '自己选一个答案，再提交检查。答对这道题不等于已经熟练掌握。'][current]}</p>
    {current === 0 ? <>
      <section className="fl-formula-box"><div className="fl-box-heading"><h2>公式与相关变式 · {variants.length} 条</h2>{variants.length > 1 && <select aria-label="选择公式变式" value={variant} onChange={e => setVariant(Number(e.target.value))}>{variants.map((v, i) => <option key={i} value={i}>{v.label}</option>)}</select>}</div><div className="fl-expression">{variants[variant].expression}</div>{variant > 0 && <p className="fl-variant-note">这是「{variants[variant].label}」的写法。例题与检验题对应本组知识点，不一定使用当前变式。</p>}<p>{t.plain}</p></section>
      <div className="fl-explain-grid"><section><h2>术语对照</h2><dl className="fl-glossary">{t.symbols.map(([symbol, meaning]) => <div key={symbol}><dt>{symbol}</dt><dd>{meaning}</dd></div>)}</dl><details className="fl-notation"><summary>看不懂 Σ、^、Δ 等符号？</summary><p>Σ：把各项加起来；Π：把各项乘起来；^n：重复相乘 n 次；√：开平方；Δ：变化量；E：期望（按概率平均）；下标区分时间或对象。10% 代入时写成 0.10。</p></details></section><section className="fl-condition"><h2>使用条件与易错点</h2><p>{t.condition}</p><h3>怎样理解这条关系</h3><ol>{t.logic.map(line => <li key={line}>{line}</li>)}</ol></section></div>
      <FinanceTeaching id={t.id} />
    </> : current === 1 ? <section className="fl-example"><span className="fc-kicker">教学自编例题</span><h2>把文字条件变成计算</h2><ol>{t.example.map((line, i) => <li key={i}><span>{i + 1}</span><div><small>{i === 0 ? '读条件' : i === t.example.length - 1 ? '得结果' : '列算式'}</small><p>{line}</p></div></li>)}</ol><div className="fl-condition"><h3>算完再检查</h3><p>确认分母、时间单位与百分数口径；把结果放回题意，检查单位和增减方向是否合理。</p></div><details><summary>回看本组主公式</summary><p className="fl-expression">{t.formula}</p></details></section> : <section className="fl-check"><span className="fc-kicker">教学自编 · 理解检验</span><h2>{t.test[0]}</h2><div className="fc-options">{options.map((option, i) => <button key={option} aria-pressed={picked === option} disabled={checked} onClick={() => setPicked(option)}><span>{String.fromCharCode(65 + i)}.</span> {option}</button>)}</div>{!checked ? <button className="btn-pri" disabled={!picked} onClick={() => setChecked(true)}>提交答案</button> : <><div className={`fc-feedback ${picked === t.test[1] ? 'is-correct' : ''}`} role="status"><b>{picked === t.test[1] ? '答对了' : `正确答案：${t.test[1]}`}</b><p>{t.test[3]}</p></div><button className="btn-sm" onClick={() => { setPicked(''); setChecked(false) }}>重新练习本题</button></>}<p className="fl-variant-note">本题用于即时自查，不计入分步带练的独立通过记录。</p></section>}
    <footer className="fl-next">{current > 0 && <button className="btn-sm" onClick={() => changeStage(current - 1)}>上一步</button>}{current < 2 ? <button className="btn-pri" onClick={() => changeStage(current + 1)}>下一步：{stages[current + 1]} <Icon name="right" /></button> : next ? <button className="btn-pri" onClick={() => go('formula', { ...params, topic: next.id })}>下一组：{next.title} <Icon name="right" /></button> : <button className="btn-pri" onClick={() => go('formula', { chapter })}>返回本章目录</button>}</footer>
    {!!courses.length && <section className="fl-related"><h2>需要带着算一遍？</h2><p>跟着填写中间步骤，再做不同数字的独立测评。进度会自动保存。</p>{courses.map(u => <button className="fl-course-row" key={u.id} onClick={() => go('formula', { unit: u.id })}><b>{u.title}</b><span>{evidenceFor(u, progress, now).status} · 开始带练 →</span></button>)}</section>}
    <SourceNote />
  </article>
}

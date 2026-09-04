import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { Icon } from '../components/ui'
import { CALC_IDS } from '../lib/bank'
import { FORMULA_GROUPS, FORMULA_LESSONS, FORMULA_MASTERY_KEY, formulaGroup } from '../data/formulaLessons'

gsap.registerPlugin(useGSAP)

const OPERATOR_MEANINGS = {
  '=': '等号表示左右两边是同一个数，只是写法不同。',
  '+': '加号表示把两部分合在一起。',
  '−': '减号表示从前面的数量里拿掉后面的数量。',
  '×': '乘号表示有多少组同样的数量。',
  '÷': '除号表示把前面的量按后面的量分成每一份。',
  '(': '左括号表示这一组要先作为一个整体来算。',
  ')': '右括号表示这一组到这里结束。',
  '[': '左方括号把一段较长的计算包在一起。',
  ']': '右方括号表示这一整段计算结束。',
  '^': '尖角后面是指数，表示前面的数要重复相乘。',
  'Σ': '大写希腊字母 Σ 表示把每一项全部加起来。',
  '√': '根号表示找一个数，使它乘自己后得到根号里的数。',
  'Π': '大写希腊字母 Π 表示把每一项连续乘起来。',
  '{': '左花括号把根号或一段较长的式子包在一起。',
  '}': '右花括号表示这一整段式子结束。',
  '≈': '约等号表示左右两边非常接近，但不是完全相等。',
  '>': '大于号表示左边的数比右边更大。',
  '<': '小于号表示左边的数比右边更小。',
  '…': '省略号表示中间还有同样规律的项目。',
  ',': '逗号用来分隔同一个符号的不同下标。',
}

function readMastery() {
  try {
    const ids = JSON.parse(localStorage.getItem(FORMULA_MASTERY_KEY) || '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = event => setReduce(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduce
}

export default function Formula({ go }) {
  const [selectedId, setSelectedId] = useState(null)
  const [group, setGroup] = useState('finance')
  const [query, setQuery] = useState('')
  const [mastered, setMastered] = useState(readMastery)

  const markMastered = id => {
    setMastered(current => {
      const next = new Set(current)
      next.add(id)
      localStorage.setItem(FORMULA_MASTERY_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const openLesson = id => {
    setSelectedId(id)
    requestAnimationFrame(() => document.getElementById('app')?.scrollIntoView({ block: 'start' }))
  }

  if (selectedId !== null) {
    const lesson = FORMULA_LESSONS.find(item => item.id === selectedId)
    const index = FORMULA_LESSONS.indexOf(lesson)
    return (
      <FormulaLesson key={lesson.id} lesson={lesson} index={index} mastered={mastered.has(lesson.id)}
        onMastered={() => markMastered(lesson.id)} onClose={() => setSelectedId(null)}
        onMove={step => openLesson(FORMULA_LESSONS[index + step].id)} />
    )
  }

  const normalized = query.trim().toLowerCase()
  const shown = FORMULA_LESSONS.filter(item => normalized
    ? `${item.title} ${item.formula} ${item.also.map(row => row.expression).join(' ')}`.toLowerCase().includes(normalized)
    : item.group === group)
  const next = FORMULA_LESSONS.find(item => !mastered.has(item.id)) || FORMULA_LESSONS[0]

  return (
    <div className="formula-view formula-index">
      <header className="formula-bar">
        <button className="btn-sm btn-ghost" onClick={() => go('home')} aria-label="返回首页">
          <Icon name="back" />
        </button>
        <div>
          <h1>公式攻坚</h1>
          <span className="muted">看懂，再代数，再做题</span>
        </div>
      </header>

      <section className="formula-hero" aria-labelledby="formula-start-title">
        <ProgressDial value={mastered.size} total={FORMULA_LESSONS.length} />
        <div className="formula-hero-copy">
          <span className="eyebrow">不是背咒语</span>
          <h2 id="formula-start-title">每次只弄懂一个关系</h2>
          <p>点公式里的任意字符，先知道它是谁，再用一组小数字亲手算一遍。</p>
          <button className="btn-pri" onClick={() => openLesson(next.id)}>
            <Icon name={mastered.size ? 'play' : 'right'} />
            {mastered.size ? `继续第 ${next.id} 个` : '从第一个开始'}
          </button>
        </div>
      </section>

      <div className="formula-search">
        <label className="sr-only" htmlFor="formula-query">搜索公式</label>
        <input id="formula-query" type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="搜名称或字符，例如收益率、久期" />
        <span className="num">{shown.length}</span>
      </div>

      {!normalized && (
        <div className="formula-groups" role="tablist" aria-label="公式分组">
          {FORMULA_GROUPS.map(item => {
            const done = FORMULA_LESSONS.filter(row => row.group === item.id && mastered.has(row.id)).length
            const total = FORMULA_LESSONS.filter(row => row.group === item.id).length
            return (
              <button key={item.id} role="tab" aria-selected={group === item.id}
                className={group === item.id ? 'on' : ''} onClick={() => setGroup(item.id)}>
                <b>{item.name}</b><small className="num">{done}/{total}</small>
              </button>
            )
          })}
        </div>
      )}

      <section className="formula-ledger" aria-live="polite">
        <div className="formula-ledger-head">
          <div>
            <h2>{normalized ? '搜索结果' : formulaGroup(group).name}</h2>
            <span className="muted">{normalized ? '点一条进入拆解练习' : `公式 ${formulaGroup(group).range}`}</span>
          </div>
          <span className="muted">答对才算会</span>
        </div>
        {shown.length ? shown.map(item => (
          <button className={`formula-row ${mastered.has(item.id) ? 'mastered' : ''}`} key={item.id}
            onClick={() => openLesson(item.id)}>
            <span className="formula-row-no num">{String(item.id).padStart(2, '0')}</span>
            <span className="formula-row-copy">
              <b>{item.title}</b>
              <code>{item.formula}</code>
            </span>
            <span className="formula-row-state" aria-label={mastered.has(item.id) ? '已掌握' : '未掌握'}>
              {mastered.has(item.id) ? <Icon name="done" /> : <Icon name="right" />}
            </span>
          </button>
        )) : (
          <div className="empty"><b>没有找到这条公式</b><span>试试“收益率”“份额”或一个英文字母。</span></div>
        )}
      </section>

      <button className="formula-bank" onClick={() => go('practice', { scope: 'calc', order: 'seq' })}>
        <Icon name="calc" />
        <span><b>去题库混合练</b><small>{CALC_IDS.length} 道计算题，检验能不能认出该用哪个公式</small></span>
        <Icon name="right" />
      </button>
    </div>
  )
}

function FormulaLesson({ lesson, index, mastered, onMastered, onClose, onMove }) {
  const reduceMotion = useReducedMotion()
  const workbenchRef = useRef(null)
  const calloutRef = useRef(null)
  const variants = [{ label: '主公式', expression: lesson.formula }, ...lesson.also]
  const [variant, setVariant] = useState(0)
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(!reduceMotion)
  const [picked, setPicked] = useState(null)
  const tokens = useMemo(() => makeTokens(variants[variant].expression, lesson.symbols), [lesson, variant])
  const quiz = useMemo(() => makeQuiz(lesson), [lesson])
  const correct = picked === quiz.answer
  const activeIndex = Math.min(active, Math.max(0, tokens.length - 1))
  const activeMeaning = explainFormulaPart(tokens, activeIndex)

  useEffect(() => {
    setActive(0)
    if (reduceMotion) setPlaying(false)
  }, [lesson.id, variant, reduceMotion])

  useGSAP(() => {
    if (!playing || reduceMotion || tokens.length < 2) return
    const nodes = gsap.utils.toArray('[data-formula-token]')
    const timeline = gsap.timeline({
      delay: 0.65,
      onComplete: () => setPlaying(false),
    })
    nodes.forEach((node, i) => {
      const at = i * 1.25
      timeline.call(() => setActive(i), [], at)
        .fromTo(node, { autoAlpha: 0.62 }, {
          autoAlpha: 1,
          duration: 0.28,
          ease: 'power2.out',
          overwrite: 'auto',
        }, at)
    })
    return () => timeline.kill()
  }, { scope: workbenchRef, dependencies: [playing, variant, tokens.length, reduceMotion], revertOnUpdate: true })

  useGSAP(() => {
    if (reduceMotion || !calloutRef.current) return
    gsap.fromTo(calloutRef.current, { autoAlpha: 0.65, y: 5 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.22,
      ease: 'power2.out',
      overwrite: 'auto',
    })
    const scope = workbenchRef.current?.querySelector('.formula-scope-highlight')
    if (scope) {
      gsap.fromTo(scope, { autoAlpha: 0 }, {
        autoAlpha: 1,
        duration: 0.26,
        ease: 'power2.out',
      })
    }
  }, { scope: workbenchRef, dependencies: [activeIndex, reduceMotion], revertOnUpdate: true })

  const choose = option => {
    setPicked(option)
    if (option === quiz.answer) onMastered()
  }

  return (
    <article className="formula-view formula-lesson">
      <header className="formula-bar lesson-bar">
        <button className="btn-sm btn-ghost" onClick={onClose} aria-label="返回公式总览"><Icon name="back" /></button>
        <div className="lesson-position">
          <span className="num">{index + 1} / {FORMULA_LESSONS.length}</span>
          <div className="lesson-track" aria-hidden="true"><i style={{ width: `${((index + 1) / FORMULA_LESSONS.length) * 100}%` }} /></div>
        </div>
        <span className={`lesson-done ${mastered ? 'on' : ''}`}>{mastered ? '已掌握' : '学习中'}</span>
      </header>

      <section className="lesson-intro">
        <span>{formulaGroup(lesson.group).name}</span>
        <h1>{lesson.title}</h1>
        <p>{lesson.plain}</p>
        <div className="formula-journey" aria-label="本公式的四步学习路径">
          {['认字符', '懂关系', '会代入', '答一题'].map((label, i) => (
            <span key={label}><i className="num">{i + 1}</i>{label}</span>
          ))}
        </div>
      </section>

      {variants.length > 1 && (
        <div className="formula-variants" aria-label="本组公式">
          {variants.map((item, i) => (
            <button key={`${item.label}-${i}`} className={variant === i ? 'on' : ''}
              onClick={() => setVariant(i)}>{item.label}</button>
          ))}
        </div>
      )}

      <section ref={workbenchRef} className="formula-workbench" aria-labelledby="formula-workbench-title">
        <div className="workbench-head">
          <div><span>点一个字符</span><h2 id="formula-workbench-title">它在公式里负责什么</h2></div>
          <button className="btn-sm btn-ghost" onClick={() => setPlaying(value => !value)}>
            <Icon name={playing ? 'stop' : 'play'} /> {playing ? '暂停' : '自动讲'}
          </button>
        </div>

        <FormulaSvg tokens={tokens} active={activeIndex} onActive={value => { setActive(value); setPlaying(false) }} />

        <div ref={calloutRef} className="formula-callout" aria-live="polite">
          <b>{tokens[activeIndex]?.text}</b>
          <span>{activeMeaning}</span>
        </div>
        <div className="formula-token-nav">
          <button onClick={() => { setActive(value => (value - 1 + tokens.length) % tokens.length); setPlaying(false) }}>
            <Icon name="left" /> 上一个
          </button>
          <span className="num">{activeIndex + 1} / {tokens.length}</span>
          <button onClick={() => { setActive(value => (value + 1) % tokens.length); setPlaying(false) }}>
            下一个 <Icon name="right" />
          </button>
        </div>
      </section>

      <section className="lesson-principle">
        <div className="lesson-section-title"><span>为什么是这样</span><h2>{lesson.title}由哪些量组成</h2></div>
        <PrincipleSvg lesson={lesson} />
        <ol>
          {lesson.logic.map((line, i) => <li key={line}><span className="num">{i + 1}</span><p>{line}</p></li>)}
        </ol>
      </section>

      <section className="lesson-example">
        <div className="lesson-section-title"><span>代一遍小数字</span><h2>先看懂动作，不和大数较劲</h2></div>
        <ExampleSvg lines={lesson.example} />
        <div className="example-lines">
          {lesson.example.map((line, i) => <div key={line} className={i === 2 ? 'answer' : ''}>
            <span>{['先看', '接着', '结果'][i]}</span><b>{line}</b>
          </div>)}
        </div>
      </section>

      <section className={`formula-quiz ${correct ? 'correct' : ''}`}>
        <div className="lesson-section-title"><span>轮到你</span><h2>{quiz.question}</h2></div>
        <div className="formula-options">
          {quiz.options.map((option, i) => {
            let className = ''
            if (picked !== null && i === quiz.answer) className = 'right'
            else if (picked === i) className = 'wrong'
            return <button key={option} className={className} onClick={() => choose(i)} disabled={correct}>{option}</button>
          })}
        </div>
        {picked !== null && (
          <div className={`quiz-feedback ${correct ? 'right' : 'wrong'}`} role="status">
            <b>{correct ? '这条会了' : '再看一眼公式里的分子和分母'}</b>
            <p>{quiz.explain}</p>
            {!correct && <button className="btn-sm" onClick={() => setPicked(null)}>再答一次</button>}
          </div>
        )}
      </section>

      <footer className="formula-lesson-nav">
        <button disabled={index === 0} onClick={() => onMove(-1)}><Icon name="left" /> 上一个公式</button>
        {index < FORMULA_LESSONS.length - 1
          ? <button className="btn-pri" onClick={() => onMove(1)}>下一个公式 <Icon name="right" /></button>
          : <button className="btn-pri" onClick={onClose}>回到公式总览 <Icon name="done" /></button>}
      </footer>
    </article>
  )
}

function makeQuiz(lesson) {
  const [question, answer, wrong, explain] = lesson.test
  const values = [answer, ...wrong]
  const shift = lesson.id % values.length
  const options = [...values.slice(shift), ...values.slice(0, shift)]
  return { question, options, answer: options.indexOf(answer), explain }
}

function tokenMeaning(text, glossary) {
  if (glossary.has(text)) return glossary.get(text)
  if (OPERATOR_MEANINGS[text]) return OPERATOR_MEANINGS[text]
  if (/^\d+(\.\d+)?%?$/.test(text)) return text.includes('%')
    ? `${text} 是一个百分数，表示每 100 份里有多少份。`
    : `${text} 是公式中固定出现或题目给出的数字。`
  if (/^[A-Za-zα-ωΑ-Ωβρσ]+/.test(text)) return `${text} 是一个字母记号，下标用来区分不同对象或时期。`
  return `“${text}”是这一项要代入的量，先看题目给了它多少。`
}

function makeTokens(expression, symbolRows) {
  const glossary = new Map(symbolRows)
  const known = [...glossary.keys()].sort((a, b) => b.length - a.length)
  const operators = Object.keys(OPERATOR_MEANINGS)
  const stops = new Set([...operators, ' '])
  const tokens = []
  let cursor = 0

  while (cursor < expression.length) {
    if (/\s/.test(expression[cursor])) { cursor++; continue }
    const hit = known.find(key => expression.startsWith(key, cursor))
    if (hit) {
      tokens.push({ text: hit, meaning: tokenMeaning(hit, glossary) })
      cursor += hit.length
      continue
    }
    const operator = operators.find(key => expression.startsWith(key, cursor))
    if (operator) {
      tokens.push({ text: operator, meaning: OPERATOR_MEANINGS[operator] })
      cursor += operator.length
      continue
    }
    let end = cursor + 1
    const startsWithChinese = /^[\u4e00-\u9fff]$/.test(expression[cursor])
    while (end < expression.length && !stops.has(expression[end]) &&
      (startsWithChinese
        ? /^[\u4e00-\u9fff]$/.test(expression[end])
        : !known.some(key => expression.startsWith(key, end)))) end++
    const text = expression.slice(cursor, end)
    tokens.push({ text, meaning: tokenMeaning(text, glossary), needsRole: true })
    cursor = end
  }
  const equalsAt = tokens.findIndex(token => token.text === '=')
  return tokens.map((token, i) => {
    if (!token.needsRole) return token
    const role = equalsAt > 0 && i < equalsAt
      ? `“${token.text}”是这条公式要找的答案。算完右边，就能得到它。`
      : `“${token.text}”是题目给出的一个量。找到它的数值，再放到这个位置。`
    return { ...token, meaning: role }
  })
}

function tokenWidth(text) {
  return Math.max(42, Math.min(310,
    [...text].reduce((width, char) => width + (/^[\u0000-\u00ff]$/.test(char) ? 16 : 25), 14)))
}

function sequenceNode(children) {
  const clean = children.filter(Boolean)
  if (clean.length === 1) return clean[0]
  return { kind: 'sequence', children: clean }
}

function formulaTree(tokens) {
  const indexed = tokens.map((token, index) => ({ kind: 'atom', token, index }))
  const lowOperators = new Set(['=', '≈', '>', '<', '+', '−'])
  const productOperators = new Set(['×', '÷'])
  const closers = { '(': ')', '[': ']', '{': '}' }
  let cursor = 0

  const parseExpression = closing => {
    const children = [parseProduct(closing)]
    while (cursor < indexed.length && indexed[cursor].token.text !== closing &&
      lowOperators.has(indexed[cursor].token.text)) {
      children.push(indexed[cursor++], parseProduct(closing))
    }
    return sequenceNode(children)
  }

  const parseProduct = closing => {
    let left = parseFactors(closing)
    while (cursor < indexed.length && indexed[cursor].token.text !== closing &&
      productOperators.has(indexed[cursor].token.text)) {
      const operator = indexed[cursor++]
      const right = parseFactors(closing)
      left = operator.token.text === '÷'
        ? { kind: 'fraction', numerator: left, denominator: right, operator }
        : sequenceNode([left, operator, right])
    }
    return left
  }

  const parseFactors = closing => {
    const children = []
    while (cursor < indexed.length) {
      const current = indexed[cursor]
      if (current.token.text === closing || lowOperators.has(current.token.text) ||
        productOperators.has(current.token.text)) break
      const close = closers[current.token.text]
      if (close) {
        const open = indexed[cursor++]
        const inside = parseExpression(close)
        const end = indexed[cursor]?.token.text === close ? indexed[cursor++] : null
        children.push(sequenceNode([open, inside, end]))
      } else {
        children.push(indexed[cursor++])
      }
    }
    return sequenceNode(children)
  }

  return parseExpression(null)
}

function layoutFormulaNode(node) {
  if (!node) return { kind: 'sequence', children: [], width: 0, height: 56 }
  if (node.kind === 'atom') return { ...node, width: tokenWidth(node.token.text), height: 56 }
  if (node.kind === 'fraction') {
    const numerator = layoutFormulaNode(node.numerator)
    const denominator = layoutFormulaNode(node.denominator)
    return {
      ...node,
      numerator,
      denominator,
      width: Math.max(numerator.width, denominator.width) + 18,
      height: numerator.height + denominator.height + 10,
    }
  }
  const children = node.children.map(layoutFormulaNode)
  return {
    ...node,
    children,
    width: children.reduce((sum, child) => sum + child.width, 0) + Math.max(0, children.length - 1) * 2,
    height: Math.max(56, ...children.map(child => child.height)),
  }
}

function bracketScope(tokens, active) {
  const opening = { '(': ')', '[': ']', '{': '}' }
  const closing = { ')': '(', ']': '[', '}': '{' }
  const text = tokens[active]?.text
  if (opening[text]) {
    let depth = 0
    for (let i = active; i < tokens.length; i++) {
      if (tokens[i].text === text) depth++
      if (tokens[i].text === opening[text]) depth--
      if (depth === 0) return [active, i]
    }
  }
  if (closing[text]) {
    let depth = 0
    for (let i = active; i >= 0; i--) {
      if (tokens[i].text === text) depth++
      if (tokens[i].text === closing[text]) depth--
      if (depth === 0) return [i, active]
    }
  }
  return null
}

function enclosingBracketScope(tokens, active) {
  let best = null
  for (let i = 0; i < active; i++) {
    if (!['(', '[', '{'].includes(tokens[i].text)) continue
    const range = bracketScope(tokens, i)
    if (range && range[1] >= active && (!best || range[0] > best[0])) best = range
  }
  return best
}

function formulaPartScope(tokens, active) {
  const text = tokens[active]?.text
  const bracket = bracketScope(tokens, active)
  if (bracket) return bracket
  const relationOperators = new Set(['=', '≈', '>', '<'])
  const calculationOperators = new Set(['+', '−', '×', '÷', '^', 'Σ', '√', 'Π'])
  if (text === '=') return null
  if (relationOperators.has(text)) return [0, tokens.length - 1]
  if (!calculationOperators.has(text)) return null
  const enclosing = enclosingBracketScope(tokens, active)
  if (enclosing) return enclosing
  let start = 0
  let end = tokens.length - 1
  for (let i = active - 1; i >= 0; i--) {
    if (relationOperators.has(tokens[i].text)) { start = i + 1; break }
  }
  for (let i = active + 1; i < tokens.length; i++) {
    if (relationOperators.has(tokens[i].text)) { end = i - 1; break }
  }
  return [start, end]
}

function explainFormulaPart(tokens, active) {
  const token = tokens[active]
  if (!token) return ''
  const text = token.text
  const target = tokens.slice(0, Math.max(0, tokens.findIndex(item => item.text === '=')))
    .map(item => item.text).join('')
  const left = tokens[active - 1]?.text
  const right = tokens[active + 1]?.text
  const scope = formulaPartScope(tokens, active)
  const isSimplePair = scope && scope[0] === active - 1 && scope[1] === active + 1
  if (['(', '[', '{', ')', ']', '}'].includes(text)) {
    return '高亮框里的内容是一整个计算组。先把框里算完，再拿结果参加外面的计算。'
  }
  if (text === '=') return `左边是要找的“${target || '答案'}”，右边是它的计算方法；两边表示同一个量。`
  if (text === '+' && isSimplePair && left && right &&
    !['(', '[', '{', ')', ']', '}'].includes(left) && !['(', '[', '{', ')', ']', '}'].includes(right)) {
    return `这里要看整段关系：把“${left}”和“${right}”合起来，就得到“${target || '这一项结果'}”。`
  }
  if (text === '+') return '高亮框里的两部分要合在一起。先算加号左边，再把右边这一项加进来。'
  if (text === '−' && isSimplePair) return `用“${left}”减去“${right}”，得到“${target || '剩下的结果'}”。`
  if (text === '−') return '高亮框在求两部分的差：用前面的量减去后面的量，看看真正剩下多少。'
  if (text === '×' && isSimplePair) return `把“${left}”和“${right}”相乘，得到这一整组的结果。`
  if (text === '×') return '高亮框表示“每一份有多少 × 一共有几份”，要把两边作为一组相乘。'
  if (text === '÷' && left && right &&
    !['(', '[', '{', ')', ']', '}'].includes(left) && !['(', '[', '{', ')', ']', '}'].includes(right)) {
    return `把“${left}”放在线上作分子，把“${right}”放在线下作分母；整条分式是一个结果。`
  }
  if (text === '÷') return '现在用分数线表示除法：线上是分子，线下是分母，整条分式是一个结果。'
  if (text === '^') return '高亮框是重复增长的一整组。右上角的次数告诉我们要重复乘多少次。'
  if (text === 'Σ') return '高亮框表示一串同样规则的项目，要把每一期或每一项全部加起来。'
  if (text === 'Π') return '高亮框表示一串同样规则的项目，要把每一项连续乘起来。'
  if (text === '√') return '高亮框里的计算要先完成，再找一个数，使它乘自己等于框里的结果。'
  if (['≈', '>', '<'].includes(text)) return '高亮的是一整条比较关系，要把左右两边作为整体来读。'
  return token.meaning
}

function collectFormulaBounds(node, x, y, bounds) {
  if (node.kind === 'atom') {
    bounds.set(node.index, { x, y: y + (node.height - 56) / 2, width: node.width, height: 56 })
    return
  }
  if (node.kind === 'fraction') {
    const lineY = y + node.numerator.height + 5
    collectFormulaBounds(node.numerator, x + (node.width - node.numerator.width) / 2, y, bounds)
    bounds.set(node.operator.index, { x: x + 2, y: lineY - 9, width: node.width - 4, height: 18 })
    collectFormulaBounds(node.denominator, x + (node.width - node.denominator.width) / 2, lineY + 5, bounds)
    return
  }
  let childX = x
  node.children.forEach(child => {
    collectFormulaBounds(child, childX, y + (node.height - child.height) / 2, bounds)
    childX += child.width + 2
  })
}

function scopeBoundsFor(tree, range) {
  if (!range) return null
  const bounds = new Map()
  collectFormulaBounds(tree, 18, 12, bounds)
  const items = []
  for (let i = range[0]; i <= range[1]; i++) {
    if (bounds.has(i)) items.push(bounds.get(i))
  }
  if (!items.length) return null
  const left = Math.min(...items.map(item => item.x))
  const top = Math.min(...items.map(item => item.y))
  const right = Math.max(...items.map(item => item.x + item.width))
  const bottom = Math.max(...items.map(item => item.y + item.height))
  return { x: left - 5, y: top - 5, width: right - left + 10, height: bottom - top + 10 }
}

function FormulaNode({ node, x, y, active, onActive, path = 'f' }) {
  if (node.kind === 'atom') {
    const i = node.index
    return (
      <g transform={`translate(${x} ${y + (node.height - 56) / 2})`}>
        <g role="button" tabIndex="0" data-formula-token
          className={`formula-token ${active === i ? 'active' : ''}`}
          aria-label={`${node.token.text}：${node.token.meaning}`} onClick={() => onActive(i)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onActive(i)
            }
          }}>
          <rect x="1" y="1" width={node.width - 2} height="54" rx="9" />
          <text x={node.width / 2} y="36" textAnchor="middle">{node.token.text}</text>
          <line x1="8" y1="55" x2={node.width - 8} y2="55" />
        </g>
      </g>
    )
  }
  if (node.kind === 'fraction') {
    const lineY = y + node.numerator.height + 5
    return (
      <g>
        <FormulaNode node={node.numerator} x={x + (node.width - node.numerator.width) / 2} y={y}
          active={active} onActive={onActive} path={`${path}-n`} />
        <g role="button" tabIndex="0" data-formula-token
          className={`formula-token formula-fraction-token ${active === node.operator.index ? 'active' : ''}`}
          aria-label={`除法：${node.operator.token.meaning}`} onClick={() => onActive(node.operator.index)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onActive(node.operator.index)
            }
          }}>
          <rect className="fraction-hit" x={x + 2} y={lineY - 9} width={node.width - 4} height="18" rx="5" />
          <line className="fraction-bar" x1={x + 4} y1={lineY} x2={x + node.width - 4} y2={lineY} />
        </g>
        <FormulaNode node={node.denominator} x={x + (node.width - node.denominator.width) / 2}
          y={lineY + 5} active={active} onActive={onActive} path={`${path}-d`} />
      </g>
    )
  }
  let childX = x
  return (
    <g>
      {node.children.map((child, i) => {
        const currentX = childX
        childX += child.width + 2
        return <FormulaNode key={`${path}-${i}`} node={child} x={currentX}
          y={y + (node.height - child.height) / 2} active={active} onActive={onActive} path={`${path}-${i}`} />
      })}
    </g>
  )
}

function FormulaSvg({ tokens, active, onActive }) {
  const tree = layoutFormulaNode(formulaTree(tokens))
  const canvasWidth = tree.width + 36
  const canvasHeight = tree.height + 24
  const scope = formulaPartScope(tokens, active)
  const scopeBounds = scopeBoundsFor(tree, scope)
  return (
    <div className="formula-svg-frame">
      <svg className="formula-svg" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        style={{ maxWidth: `${Math.min(canvasWidth, 860)}px` }}
        role="group" aria-label="可逐项点按的完整公式，除法用分数线表示">
        {scopeBounds && <rect className="formula-scope-highlight" {...scopeBounds} rx="11" />}
        <FormulaNode node={tree} x={18} y={12} active={scope ? -1 : active} onActive={onActive} />
      </svg>
    </div>
  )
}

function ProgressDial({ value, total }) {
  const radius = 43
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - value / total)
  return (
    <div className="formula-dial" aria-label={`已掌握 ${value} 个，共 ${total} 个`}>
      <svg viewBox="0 0 112 112" aria-hidden="true">
        <circle className="dial-track" cx="56" cy="56" r={radius} />
        <circle className="dial-value" cx="56" cy="56" r={radius}
          strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <strong className="num">{value}<small>/{total}</small></strong>
      <span>已掌握</span>
    </div>
  )
}

function splitSvgLabel(label) {
  const chars = [...label]
  if (chars.length <= 7) return [label]
  const middle = Math.ceil(chars.length / 2)
  return [chars.slice(0, middle).join(''), chars.slice(middle).join('')]
}

function PrincipleSvg({ lesson }) {
  const target = lesson.symbols[0]?.[0] || lesson.title
  const inputs = lesson.symbols.slice(1, 5)
  const count = Math.max(1, inputs.length)
  const gap = count === 4 ? 10 : 14
  const boxWidth = (512 - gap * (count - 1)) / count
  return (
    <svg className="principle-svg" viewBox="0 0 540 220" role="img"
      aria-label={`${target}由${inputs.map(([label]) => label).join('、')}这些量共同决定`}>
      <g className="principle-target">
        <rect x="70" y="16" width="400" height="66" rx="14" />
        <text x="270" y="44" textAnchor="middle">要找：{target}</text>
        <text className="sub" x="270" y="66" textAnchor="middle">{lesson.title}</text>
      </g>
      <path d="M270 82V108" />
      <path d={`M${18 + boxWidth / 2} 108H${522 - boxWidth / 2}`} />
      {inputs.map(([label], i) => {
        const x = 14 + i * (boxWidth + gap)
        const center = x + boxWidth / 2
        const lines = splitSvgLabel(label)
        return (
          <g className="principle-input" key={`${label}-${i}`}>
            <path d={`M${center} 108V126`} />
            <rect x={x} y="126" width={boxWidth} height="76" rx="13" />
            <text x={center} y={lines.length === 1 ? 169 : 157} textAnchor="middle">
              {lines.map((line, lineIndex) => (
                <tspan key={line} x={center} dy={lineIndex ? 21 : 0}>{line}</tspan>
              ))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function ExampleSvg({ lines }) {
  const short = value => value.length > 14 ? `${value.slice(0, 13)}…` : value
  return (
    <svg className="example-svg" viewBox="0 0 540 132" role="img" aria-label="把已知数字代入公式后得到答案">
      <defs><marker id="example-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker></defs>
      <path d="M165 66H210" markerEnd="url(#example-arrow)" />
      <path d="M330 66H375" markerEnd="url(#example-arrow)" />
      {[{ x: 10, label: '先看', text: short(lines[0]) }, { x: 210, label: '接着', text: short(lines[1]) }, { x: 375, label: '得到结果', text: short(lines[2]) }].map((item, i) => (
        <g key={item.label} className={i === 2 ? 'result' : ''}>
          <rect x={item.x} y="22" width={i === 1 ? 120 : 155} height="88" rx="14" />
          <text className="label" x={item.x + (i === 1 ? 60 : 77.5)} y="51" textAnchor="middle">{item.label}</text>
          <text x={item.x + (i === 1 ? 60 : 77.5)} y="80" textAnchor="middle">{item.text}</text>
        </g>
      ))}
    </svg>
  )
}

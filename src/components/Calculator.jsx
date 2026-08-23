import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './ui'
import { evaluate, format, preview } from '../lib/calc'

/*
 * 科学计算器，底部抽屉，非模态。
 *
 * 不是弹层：算到一半想看清题干上面那个数字，收起再展开不能把算式弄丢，
 * 所以组件常驻挂载、只靠 open 决定渲不渲染——state 跟着组件活着。
 * 也没有遮罩：抽屉展开时页面照样滚、题目照样点，抽屉高度会写进 --calc-h
 * 给正文垫出底部留白，题目还能继续往上滑，不会被压在抽屉底下看不见。
 *
 * 键盘只在焦点落在抽屉里时接管。做题页的 Enter（下一题）和 A/B/C/D 是全局监听，
 * 抽屉一展开就无条件抢走的话，等于把做题的快捷键废了。
 *
 * 相对参考图的三处简化：去掉左上角那个无标签开关；显示区两行（算式在上、
 * 实时结果在下，边打边出）；配色走设计令牌，= 用主色，C/⌫ 退成次要。
 */
const KEYS = [
  ['(', ')', '√', 'x²'],
  ['C', '⌫', 'Ans', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['%', '0', '.', '='],
]
// 按键面 -> 进算式的字符。减号面上用 −（U+2212）好看，内部统一成 -
const INSERT = { 'x²': '²', '−': '-' }

export default function Calculator({ open, onClose }) {
  const [expr, setExpr] = useState('')
  const [ans, setAns] = useState(null)
  const [err, setErr] = useState('')
  const box = useRef(null)

  // 抽屉多高，正文就垫多少底。矮屏有一套更紧凑的键盘样式，高度写死会对不上，
  // 所以量出来，并且用 ResizeObserver 跟着变
  useLayoutEffect(() => {
    const root = document.documentElement
    if (!open || !box.current) { root.style.removeProperty('--calc-h'); return }
    const set = () => root.style.setProperty('--calc-h', `${box.current.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(box.current)
    return () => { ro.disconnect(); root.style.removeProperty('--calc-h') }
  }, [open])

  // preventScroll：抽屉在视口底部，聚焦时别把页面拽下去
  useEffect(() => { if (open) box.current?.focus({ preventScroll: true }) }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.metaKey || e.ctrlKey) return
      // 焦点不在抽屉里就不接管，把键让回给做题页
      if (!box.current?.contains(document.activeElement)) return
      const k = e.key
      if (k === 'Escape') { e.preventDefault(); return onClose() }
      if (k === 'Enter' || k === '=') { e.preventDefault(); return tap('=') }
      if (k === 'Backspace') { e.preventDefault(); return tap('⌫') }
      if (/^[\d.()]$/.test(k)) { e.preventDefault(); return tap(k) }
      if (k === '*') { e.preventDefault(); return tap('×') }
      if (k === '/') { e.preventDefault(); return tap('÷') }
      if (k === '+' || k === '-' || k === '%') { e.preventDefault(); return tap(k === '-' ? '−' : k) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  function tap(key) {
    setErr('')
    if (key === 'C') { setExpr(''); return }
    if (key === '⌫') { setExpr(e => e.slice(0, -1)); return }
    if (key === 'Ans') { setExpr(e => e + (ans ?? '')); return }
    if (key === '=') {
      try {
        const v = format(evaluate(expr))
        setAns(v)
        setExpr(v)
      } catch (e) {
        setErr(e.message)
      }
      return
    }
    setExpr(e => e + (INSERT[key] ?? key))
  }

  // 收起时只是不渲染，组件仍挂着——算式、Ans 都还在，展开就接着算
  if (!open) return null

  const live = preview(expr)

  return (
    <div className="calc-drawer" ref={box} tabIndex={-1} role="region" aria-label="科学计算器">
      {/* 收起钮压进显示区右上角：抽屉本来就在跟题目抢高度，
          单开一行放「科学计算器」这五个字不值那 35px */}
      <div className="calc-screen">
        <button className="calc-hide" onClick={onClose} aria-label="收起计算器">
          <Icon name="x" />
        </button>
        <div className="calc-expr">{expr || <span className="muted">0</span>}</div>
        <div className={`calc-ans ${err ? 'bad' : ''}`}>
          {err || (live !== null && live !== expr ? `= ${live}` : ' ')}
        </div>
      </div>

      <div className="calc-pad">
        {KEYS.flat().map(k => (
          <button key={k} onClick={() => tap(k)}
            className={k === '=' ? 'btn-pri' : /[+\-−×÷()√%.]|x²/.test(k) ? 'calc-op' : /[C⌫]/.test(k) ? 'calc-fn' : ''}>
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

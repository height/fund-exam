import { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'
import { evaluate, format, preview } from '../lib/calc'

/*
 * 科学计算器。相对参考图做了三处简化：
 * 1. 去掉左上角那个无标签开关——没人知道它管什么
 * 2. 显示区从一大块空白改成两行：算式在上、实时结果在下，边打边出，不用按 = 才知道对不对
 * 3. 配色走设计令牌，不用孤立的红灰；= 用主色，C/⌫ 退成次要
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

export default function Calculator({ onClose }) {
  const [expr, setExpr] = useState('')
  const [ans, setAns] = useState(null)
  const [err, setErr] = useState('')
  const boxRef = useRef(null)

  // 打开就接管键盘：数字和运算符直接敲，Esc 关闭
  useEffect(() => {
    boxRef.current?.focus()
    const onKey = e => {
      if (e.metaKey || e.ctrlKey) return
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

  const live = preview(expr)

  return (
    <div className="overlay center calc-overlay" role="dialog" aria-modal="true" aria-label="科学计算器"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="panel calc" ref={boxRef} tabIndex={-1}>
        <div className="calc-head">
          <span className="muted">科学计算器</span>
          <button className="btn-sm btn-ghost" onClick={onClose} aria-label="关闭"><Icon name="x" /></button>
        </div>

        <div className="calc-screen">
          <div className="calc-expr">{expr || <span className="muted">0</span>}</div>
          <div className={`calc-ans ${err ? 'bad' : ''}`}>
            {err || (live !== null && live !== expr ? `= ${live}` : ' ')}
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
    </div>
  )
}

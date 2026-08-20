import { useEffect, useRef, useState } from 'react'
import { askTerm, getKey } from '../lib/ai'
import { Md } from '../lib/format'
import { Icon } from './ui'

/**
 * 划词解释：选中任意文字浮出「解释」按钮，点开是流式 AI 气泡。
 * 气泡里的文字照样能选，再点就往上叠一层，关掉顶层回到上一层。
 * 挂在 App 顶层，全站生效。
 */
let uid = 0

export default function SelectionTip({ go }) {
  const [tip, setTip] = useState(null) // {x, y, term, ctx}
  const [stack, setStack] = useState([]) // [{id, term, ctx}]

  useEffect(() => {
    let t
    const onSel = () => {
      clearTimeout(t)
      // selectionchange 在拖选过程中连环触发，停一拍再算
      t = setTimeout(() => {
        const sel = getSelection()
        const term = sel && !sel.isCollapsed ? sel.toString().trim().replace(/\s+/g, ' ') : ''
        if (!term || term.length > 60 ||
            /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return setTip(null)
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        // 带上所在句子当上下文，同一个词在不同题里意思可能不一样
        const ctx = sel.anchorNode?.parentElement
          ?.closest('p,li,td,.stem,.opt,.bubble-body')?.innerText.slice(0, 160) || ''
        setTip({
          x: Math.min(Math.max(rect.left + rect.width / 2, 60), innerWidth - 60),
          y: Math.max(rect.top - 44, 10),
          term, ctx,
        })
      }, 250)
    }
    document.addEventListener('selectionchange', onSel)
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', onSel) }
  }, [])

  // pointerdown 抢在浏览器清空选区之前，term 已经存在 tip 里了
  const open = () => {
    setStack(s => [...s, { id: ++uid, term: tip.term, ctx: tip.ctx }])
    setTip(null)
    getSelection()?.removeAllRanges()
  }

  return (
    <>
      {tip && (
        <button className="sel-tip" style={{ left: tip.x, top: tip.y }}
          onPointerDown={e => { e.preventDefault(); open() }}>
          <Icon name="sparkle" /> 解释「{tip.term.slice(0, 8)}{tip.term.length > 8 ? '…' : ''}」
        </button>
      )}
      {stack.map((b, i) => (
        <Bubble key={b.id} {...b} lift={i} depth={stack.length - 1 - i} go={go}
          onClose={() => setStack(s => s.filter(x => x.id !== b.id))} />
      ))}
    </>
  )
}

function Bubble({ term, ctx, lift, depth, go, onClose }) {
  const [state, setState] = useState('loading')
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  // 新请求顶掉旧请求，卸载时中止。不然 StrictMode 双挂载 / 重试会有两股流交错写 text
  const ctlRef = useRef(null)

  async function run() {
    ctlRef.current?.abort()
    const ctl = (ctlRef.current = new AbortController())
    if (!getKey()) return setState('nokey')
    setState('loading')
    setText('')
    try {
      for await (const c of askTerm(term, ctx, ctl.signal)) {
        if (ctl.signal.aborted) return
        setText(t => t + c)
      }
      if (!ctl.signal.aborted) setState('done')
    } catch (e) {
      if (ctl.signal.aborted) return
      setErr(e.message)
      setState('error')
    }
  }
  useEffect(() => { run(); return () => ctlRef.current?.abort() }, [])

  return (
    <div className="bubble card" role="dialog" aria-label={`解释 ${term}`}
      style={{ zIndex: 21 + lift, transform: `translateY(${-9 * depth}px)` }}>
      <div className="row between">
        <b className="bubble-term">{term}</b>
        <button className="btn-sm btn-ghost" onClick={onClose} aria-label="关闭"><Icon name="x" /></button>
      </div>
      {state === 'nokey' ? (
        <div className="row between">
          <span className="muted">先配好模型和 Key 才能解释</span>
          <button className="btn-sm" onClick={() => go('data')}>去设置 ›</button>
        </div>
      ) : state === 'error' ? (
        <div className="row between">
          <span className="muted grow">{err}</span>
          <button className="btn-sm" onClick={run}>重试</button>
        </div>
      ) : (
        <div className="ai-text bubble-body">
          <Md text={state === 'loading' ? `${text || '正在思考'}▍` : text} />
        </div>
      )}
    </div>
  )
}

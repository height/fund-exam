import { useCallback, useEffect, useRef, useState } from 'react'
import { askTerm, getKey, mdToSpeech } from '../lib/ai'
import { Md } from '../lib/format'
import {
  caretIndexFromPoint,
  selectableRoot,
  selectionContext,
  selectionGeometry,
  selectionText,
  selectionTipPosition,
  wordAtIndex,
  wordAtPoint,
} from '../lib/textSelection'
import { Icon, Speaker } from './ui'

/**
 * 划词解释：选中任意文字浮出「解释」按钮，点开是流式 AI 气泡。
 * 气泡里的文字照样能选，再点就往上叠一层，关掉顶层回到上一层。
 * 挂在 App 顶层，全站生效。
 */
let uid = 0
const HOLD_MS = 420
const MOVE_CANCEL = 10
const MAX_TERM = 60

const clamp = (n, min, max) => Math.max(min, Math.min(n, max))

export default function SelectionTip({ go }) {
  const [nativeTip, setNativeTip] = useState(null) // 桌面端系统划选
  const [custom, setCustom] = useState(null) // 触屏端自绘选区
  const [layout, setLayout] = useState(0) // 滚动/旋转后重算浮层位置
  const [stack, setStack] = useState([]) // [{id, term, ctx}]
  const customRef = useRef(null)
  const gestureRef = useRef(null)
  const swallowClickRef = useRef(null)

  const commitCustom = useCallback(next => {
    if (!next?.root?.isConnected || next.end <= next.start) next = null
    if (next) {
      const term = selectionText(next.root, next.start, next.end)
      if (!term) next = null
      else next = { ...next, term, ctx: selectionContext(next.root) }
    }
    customRef.current = next
    setCustom(next)
    if (next) setNativeTip(null)
  }, [])

  const clearCustom = useCallback(() => {
    commitCustom(null)
    document.documentElement.removeAttribute('data-selecting')
  }, [commitCustom])

  useEffect(() => {
    let t
    const onSel = () => {
      clearTimeout(t)
      // selectionchange 在拖选过程中连环触发，停一拍再算
      t = setTimeout(() => {
        if (customRef.current) return
        const sel = getSelection()
        // 某些 iOS WebView 不完全遵守 user-select:none，触屏端再用 JS 兜底清掉原生选区。
        if (document.documentElement.hasAttribute('data-custom-selection')) {
          if (sel && !sel.isCollapsed) sel.removeAllRanges()
          setNativeTip(null)
          return
        }
        const term = sel && !sel.isCollapsed ? sel.toString().trim().replace(/\s+/g, ' ') : ''
        if (!term || term.length > 60 ||
            /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return setNativeTip(null)
        const range = sel.getRangeAt(0)
        const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)
        const tip = selectionTipPosition(rects.length ? rects : [range.getBoundingClientRect()])
        // 带上所在句子当上下文，同一个词在不同题里意思可能不一样
        const ctx = sel.anchorNode?.parentElement
          ?.closest('p,li,td,.stem,.opt,.bubble-body')?.innerText.slice(0, 160) || ''
        setNativeTip({
          x: tip.x, y: tip.y, side: tip.side,
          term, ctx, source: 'native',
        })
      }, 250)
    }
    document.addEventListener('selectionchange', onSel)
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', onSel) }
  }, [])

  // 触屏自定义取词：普通滑动先交给浏览器，只有停住 420ms 后才接管本次手势。
  useEffect(() => {
    const touchCapable = matchMedia('(any-pointer:coarse)').matches || navigator.maxTouchPoints > 0
      || 'ontouchstart' in window
    if (!touchCapable) return
    const html = document.documentElement
    html.setAttribute('data-custom-selection', '')
    let moveFrame = 0
    let autoFrame = 0

    const touchById = (list, id) => [...list].find(t => t.identifier === id) || null
    const stopAutoScroll = () => {
      cancelAnimationFrame(autoFrame)
      autoFrame = 0
      const g = gestureRef.current
      if (g) g.scrollVelocity = 0
    }
    const stopGesture = () => {
      const g = gestureRef.current
      if (g?.timer) clearTimeout(g.timer)
      gestureRef.current = null
      cancelAnimationFrame(moveFrame)
      moveFrame = 0
      stopAutoScroll()
      html.removeAttribute('data-selecting')
    }
    const indexAt = (root, x, y) => {
      const rect = root.getBoundingClientRect()
      return caretIndexFromPoint(root,
        clamp(x, rect.left + 1, rect.right - 1),
        clamp(y, rect.top + 1, rect.bottom - 1))
    }
    const updateAt = (g, x, y) => {
      const current = customRef.current
      if (!current?.root?.isConnected) return clearCustom()
      const index = indexAt(current.root, x, y)
      if (index == null) return
      const word = wordAtIndex(current.root, index)
      let start = current.start
      let end = current.end
      if (g.edge === 'start') {
        start = Math.min(word.start, end - 1)
        start = Math.max(start, end - MAX_TERM)
      } else if (g.edge === 'end') {
        end = Math.max(word.end, start + 1)
        end = Math.min(end, start + MAX_TERM)
      } else if (index < g.initial.start) {
        start = Math.max(word.start, g.initial.end - MAX_TERM)
        end = g.initial.end
      } else if (index >= g.initial.end) {
        start = g.initial.start
        end = Math.min(word.end, start + MAX_TERM)
      } else {
        start = g.initial.start
        end = g.initial.end
      }
      commitCustom({ ...current, start, end })
    }
    const queueUpdate = g => {
      if (moveFrame) return
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0
        if (gestureRef.current === g) updateAt(g, g.x, g.y)
      })
    }
    const autoScroll = () => {
      autoFrame = 0
      const g = gestureRef.current
      if (!g?.active || !g.scrollVelocity) return
      const before = scrollY
      scrollBy(0, g.scrollVelocity)
      if (scrollY !== before) updateAt(g, g.x, g.y)
      autoFrame = requestAnimationFrame(autoScroll)
    }
    const setAutoScroll = (g, y) => {
      const edge = 68
      const bottom = innerHeight - 82
      g.scrollVelocity = y < edge ? -clamp((edge - y) / 7, 2, 12)
        : y > bottom ? clamp((y - bottom) / 7, 2, 12) : 0
      if (g.scrollVelocity && !autoFrame) autoFrame = requestAnimationFrame(autoScroll)
      if (!g.scrollVelocity) stopAutoScroll()
    }

    const onTouchStart = e => {
      if (e.touches.length !== 1) return stopGesture()
      const touch = e.touches[0]
      const target = e.target instanceof Element ? e.target : e.target?.parentElement
      const handle = target?.closest('.sel-handle')
      if (handle && customRef.current) {
        e.preventDefault()
        stopGesture()
        const current = customRef.current
        gestureRef.current = {
          id: touch.identifier, active: true, edge: handle.dataset.edge,
          initial: current, x: touch.clientX, y: touch.clientY, scrollVelocity: 0,
        }
        html.setAttribute('data-selecting', '')
        return
      }
      if (target?.closest('.sel-tip,.bubble button,.overlay,.calc-drawer')) return
      const root = selectableRoot(target)
      if (!root) {
        if (customRef.current) clearCustom()
        return
      }
      if (customRef.current) clearCustom()
      stopGesture()
      const g = {
        id: touch.identifier, root, active: false, edge: 'extend',
        x0: touch.clientX, y0: touch.clientY, x: touch.clientX, y: touch.clientY,
        scrollVelocity: 0,
      }
      g.timer = setTimeout(() => {
        if (gestureRef.current !== g || !g.root.isConnected) return
        const word = wordAtPoint(g.root, g.x0, g.y0)
        if (!word || word.end <= word.start) return stopGesture()
        getSelection()?.removeAllRanges()
        const next = { root: g.root, start: word.start, end: word.end }
        g.initial = next
        g.active = true
        g.timer = 0
        commitCustom(next)
        html.setAttribute('data-selecting', '')
        swallowClickRef.current = { root: g.root, until: Date.now() + 700 }
        try { navigator.vibrate?.(9) } catch { /* iOS 不支持，无需降级 */ }
      }, HOLD_MS)
      gestureRef.current = g
    }
    const onTouchMove = e => {
      const g = gestureRef.current
      if (!g) return
      const touch = touchById(e.touches, g.id)
      if (!touch) return
      g.x = touch.clientX
      g.y = touch.clientY
      if (!g.active) {
        if (Math.hypot(g.x - g.x0, g.y - g.y0) > MOVE_CANCEL) stopGesture()
        return
      }
      e.preventDefault()
      queueUpdate(g)
      setAutoScroll(g, g.y)
    }
    const onTouchEnd = e => {
      const g = gestureRef.current
      if (!g || !touchById(e.changedTouches, g.id)) return
      if (g.active) {
        e.preventDefault()
        // 只拦本次长按文字合成的 click；手柄、解释按钮和气泡不受影响。
        if (g.edge === 'extend' && g.root) {
          swallowClickRef.current = { root: g.root, until: Date.now() + 700 }
        }
        setLayout(v => v + 1)
      }
      stopGesture()
    }
    const onTouchCancel = () => stopGesture()
    const onContextMenu = e => {
      const target = e.target instanceof Element ? e.target : e.target?.parentElement
      if (target?.closest('#app,.bubble-body')) e.preventDefault()
    }
    const onClick = e => {
      const block = swallowClickRef.current
      if (block && Date.now() < block.until &&
          (e.target === block.root || block.root.contains(e.target))) {
        e.preventDefault()
        e.stopPropagation()
        swallowClickRef.current = null
      }
    }
    const onLayout = () => {
      if (customRef.current) setLayout(v => v + 1)
    }
    const onKey = e => {
      if (e.key === 'Escape' && customRef.current) clearCustom()
    }
    const onRoute = () => clearCustom()

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false })
    document.addEventListener('touchcancel', onTouchCancel, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onLayout, { passive: true })
    window.addEventListener('resize', onLayout)
    window.addEventListener('hashchange', onRoute)
    return () => {
      stopGesture()
      clearCustom()
      html.removeAttribute('data-custom-selection')
      document.removeEventListener('touchstart', onTouchStart, true)
      document.removeEventListener('touchmove', onTouchMove, true)
      document.removeEventListener('touchend', onTouchEnd, true)
      document.removeEventListener('touchcancel', onTouchCancel, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onLayout)
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('hashchange', onRoute)
    }
  }, [clearCustom, commitCustom])

  let geometry = null
  if (custom?.root?.isConnected) {
    try { geometry = selectionGeometry(custom.root, custom.start, custom.end) }
    catch { geometry = null }
  }
  // layout 被读取是为了让滚动后触发上面的几何重算。
  void layout
  const customTip = custom && geometry?.tip
    ? { ...geometry.tip, term: custom.term, ctx: custom.ctx, source: 'custom' }
    : null
  const tip = customTip || nativeTip

  // pointerdown 抢在浏览器清空选区之前，term 已经存在 tip 里了
  const open = () => {
    setStack(s => [...s, { id: ++uid, term: tip.term, ctx: tip.ctx }])
    setNativeTip(null)
    if (tip.source === 'custom') clearCustom()
    else getSelection()?.removeAllRanges()
  }

  return (
    <>
      {custom && geometry && (
        <div className="sel-marks" aria-hidden="true">
          {geometry.rects.map((r, i) => <i key={i} style={{ left: r.left, top: r.top,
            width: r.width, height: r.height }} />)}
        </div>
      )}
      {custom && geometry?.startHandle && <>
        <button type="button" className="sel-handle sel-handle-start" data-edge="start"
          aria-label="拖动调整选区起点"
          style={{ left: geometry.startHandle.x, top: geometry.startHandle.y,
            '--sel-line-height': `${geometry.startHandle.height}px` }} />
        <button type="button" className="sel-handle sel-handle-end" data-edge="end"
          aria-label="拖动调整选区终点"
          style={{ left: geometry.endHandle.x, top: geometry.endHandle.y,
            '--sel-line-height': `${geometry.endHandle.height}px` }} />
        <span className="sr-only" role="status" aria-live="polite">已选择 {custom.term}</span>
      </>}
      {tip && (
        <button className="sel-tip" data-side={tip.side} style={{ left: tip.x, top: tip.y }}
          data-term={tip.term} aria-label={`解释“${tip.term}”`}
          onPointerDown={e => { e.preventDefault(); open() }}>
          <Icon name="sparkle" />
          <span className="sel-tip-copy"><span>解释 “</span>
            <span className="sel-tip-term">{tip.term}</span><span>”</span></span>
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
        <div className="row">
          {state === 'done' && <Speaker getText={() => mdToSpeech(text)} label="朗读解释" />}
          <button className="btn-sm btn-ghost" onClick={onClose} aria-label="关闭"><Icon name="x" /></button>
        </div>
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

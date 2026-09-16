import { useLayoutEffect, useRef, useState } from 'react'
import { noteFloatPosition } from './noteFloatPosition'

export function useNoteFloat(frame, active) {
  const position = useRef(null)
  const drag = useRef(null)
  const place = useRef(() => {})
  const [dragging, setDragging] = useState(false)
  useLayoutEffect(() => {
    if (!active || !frame.current) return
    const element = frame.current
    const update = point => {
      const viewport = window.visualViewport
      const bounds = { x: viewport?.offsetLeft || 0, y: viewport?.offsetTop || 0, width: viewport?.width || innerWidth, height: viewport?.height || innerHeight }
      element.style.maxWidth = `${Math.max(1, bounds.width - 16)}px`
      const rect = element.getBoundingClientRect()
      const obstacles = [...document.querySelectorAll('.actionbar,.app-bottom-nav,.calc-drawer,.calc-fab')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map(el => el.getBoundingClientRect()).filter(r => r.bottom > bounds.y && r.top < bounds.y + bounds.height)
      const next = noteFloatPosition(point || position.current, rect, bounds, obstacles)
      element.style.setProperty('--note-float-x', `${next.x}px`)
      element.style.setProperty('--note-float-y', `${next.y}px`)
      if (point || position.current) position.current = next
    }
    place.current = update
    let raf
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => update()) }
    const resize = new ResizeObserver(schedule)
    resize.observe(element)
    const mutations = new MutationObserver(schedule)
    const root = document.getElementById('root')
    if (root) mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    update()
    return () => {
      cancelAnimationFrame(raf); resize.disconnect(); mutations.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      element.style.removeProperty('max-width')
      drag.current = null
    }
  }, [active, frame])
  const end = e => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null; setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return { dragging, handle: {
    onPointerDown: e => {
      if (!active || e.button !== 0) return
      e.preventDefault()
      const rect = frame.current.getBoundingClientRect()
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top }
      e.currentTarget.setPointerCapture(e.pointerId); setDragging(true)
    },
    onPointerMove: e => {
      const start = drag.current
      if (!start || start.id !== e.pointerId) return
      place.current({ x: start.left + e.clientX - start.x, y: start.top + e.clientY - start.y })
    },
    onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => { drag.current = null; setDragging(false) },
    onKeyDown: e => {
      const step = e.shiftKey ? 48 : 16
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (!move) return
      e.preventDefault()
      const rect = frame.current.getBoundingClientRect()
      place.current({ x: rect.left + move[0], y: rect.top + move[1] })
    },
  } }
}

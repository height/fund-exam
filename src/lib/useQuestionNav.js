import { useEffect, useRef } from 'react'

/**
 * 答题页的快捷操作：键盘 A/B/C/D 选项、← → 翻题，手机左右滑动翻题。
 * 弹层（答题卡）打开时不响应滑动，免得误翻。
 */
export function useQuestionNav({ onPick, onPrev, onNext, enabled = true }) {
  const cbs = useRef({})
  cbs.current = { onPick, onPrev, onNext }

  useEffect(() => {
    if (!enabled) return

    const onKey = e => {
      if (e.metaKey || e.ctrlKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return
      const idx = 'ABCD'.indexOf(e.key.toUpperCase())
      if (idx >= 0) { e.preventDefault(); cbs.current.onPick?.(idx); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); cbs.current.onPrev?.() }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); cbs.current.onNext?.() }
    }

    let x0 = 0, y0 = 0
    const onStart = e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY }
    const onEnd = e => {
      if (document.querySelector('.overlay')) return
      const dx = e.changedTouches[0].clientX - x0
      const dy = e.changedTouches[0].clientY - y0
      if (Math.abs(dx) < 64 || Math.abs(dy) > 44) return
      ;(dx < 0 ? cbs.current.onNext : cbs.current.onPrev)?.()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [enabled])
}

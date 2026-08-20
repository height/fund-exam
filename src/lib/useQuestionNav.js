import { useEffect, useRef } from 'react'

/** 答题页的快捷操作：键盘 A/B/C/D 选项、← → 翻题。手机翻题走按钮，滑动手势跟横滚内容、划词冲突，去掉了 */
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

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}

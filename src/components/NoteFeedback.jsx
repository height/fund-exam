import { useCallback, useEffect, useRef, useState } from 'react'
import { openNote } from '../lib/noteModal'
import ChatComposer from './ChatComposer'
import { Icon } from './ui'

// Selection creates a transient draft only. Nothing is written until explicit confirmation.
export function useNoteCapture() {
  const [receipt, setReceipt] = useState(null)
  const capture = draft => setReceipt({ draft, captureId: draft.id })
  const dismiss = useCallback(() => setReceipt(null), [])
  return { receipt, capture, dismiss }
}
export default function NoteFeedback({ receipt, dismiss }) {
  const element = useRef(null)
  const [input, setInput] = useState('')
  useEffect(() => { setInput('') }, [receipt?.captureId])
  useEffect(() => {
    if (!receipt) return
    const viewport = window.visualViewport
    const sync = () => element.current?.style.setProperty('--receipt-keyboard', `${Math.max(0, window.innerHeight - (viewport?.height || window.innerHeight) - (viewport?.offsetTop || 0))}px`)
    sync(); viewport?.addEventListener('resize', sync); viewport?.addEventListener('scroll', sync)
    return () => { viewport?.removeEventListener('resize', sync); viewport?.removeEventListener('scroll', sync) }
  }, [!!receipt])
  if (!receipt) return null
  const open = sendOnOpen => {
    openNote(receipt.draft.id, 'edit', { draft: receipt.draft, initialPrompt: input.trim(), sendOnOpen, captureId: receipt.captureId })
    dismiss()
  }
  return <section ref={element} className="note-receipt" aria-label="摘录反馈">
    <div className="note-receipt-top"><div className="note-receipt-copy"><b role="status">新建笔记 · 尚未保存</b><small title={receipt.draft.excerpt}>{receipt.draft.excerpt}</small></div>
      <div className="note-receipt-actions"><button onClick={() => open(false)}>展开</button><button aria-label="放弃这次摘录" onClick={dismiss}><Icon name="x" /></button></div></div>
    <ChatComposer compact draft={input} onDraft={setInput} onSend={() => open(true)} placeholder="这段想怎么记？说说你的要求…" />
  </section>
}

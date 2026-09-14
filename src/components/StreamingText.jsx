import { useRef } from 'react'

// Reveal real incoming chunks once; never replay or artificially delay the answer.
export default function StreamingText({ text }) {
  const chunks = useRef([])
  const previous = useRef('')
  if (text !== previous.current) {
    if (!text.startsWith(previous.current)) chunks.current = []
    const offset = text.startsWith(previous.current) ? previous.current.length : 0
    chunks.current.push({ offset, text: text.slice(offset) })
    previous.current = text
  }
  return <p className="chat-stream-text" aria-label="正在回复" aria-live="off">
    {chunks.current.map(chunk => <span className="chat-stream-chunk" key={chunk.offset}>{chunk.text}</span>)}
    <span className="chat-stream-caret" aria-hidden="true" />
  </p>
}

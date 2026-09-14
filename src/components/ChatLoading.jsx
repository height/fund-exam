import { useEffect, useRef, useState } from 'react'

const delays = Array.from({ length: 9 }, (_, i) => (i % 3 + Math.abs(Math.floor(i / 3) - 1)) * 90)
export default function ChatLoading({ received = 0, mode = '', retrying = false, context = '已携带选中文案、原文依据和本次对话。', completion = '完整返回并校验后显示修改预览。' }) {
  const started = useRef(performance.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = setInterval(() => setElapsed((performance.now() - started.current) / 1000), 100)
    return () => clearInterval(tick)
  }, [])
  const label = retrying ? '正在重新生成完整回复 · 1/1' : received ? '正在生成回复' : mode ? `深度思考 · ${mode}` : '正在等待回复'
  return <details className="chat-work-status">
    <summary><span className="chat-pixel-grid" aria-hidden="true">{delays.map((delay, i) => <i key={i} style={{ animationDelay: `${delay}ms` }} />)}</span><span className="chat-work-label">{label}</span><span className="chat-work-elapsed" aria-hidden="true">{elapsed < 60 ? `${elapsed.toFixed(1)}s` : `${Math.floor(elapsed / 60)}m ${(elapsed % 60).toFixed(1)}s`}</span><span className="chat-work-chevron" aria-hidden="true">⌄</span></summary>
    <span className="sr-only" role="status">{label}</span>
    <div className="chat-work-detail"><p>{context}</p><p>{received ? `已接收 ${received.toLocaleString()} 字符，${completion}` : '正在等待模型返回内容，可随时停止。'}</p></div>
  </details>
}

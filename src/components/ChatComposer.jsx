import { useThinkingLevel } from '../lib/useThinkingLevel'
import StreamingText from './StreamingText'
import ChatLoading from './ChatLoading'
import NoteKnowledge from './NoteKnowledge'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Adapted from the supplied ChatComposer: same panel, tabs, reply sections and composer.
// Production messages replace the example's scripted timers and demo sales data.
export default function ChatComposer({ retrying = false, messages, streamed = '', received = 0, draft, onDraft, onSend, busy, disabled, onStop, error, captures, evidenceNote, hasKey, onSettings, compact = false, collapsed = false, placeholder = '说说想怎么改…', emptyMessage = '说说想怎么改，也可以先问一个问题。' }) {
  const [thinking, setThinking, levels] = useThinkingLevel()
  const [tab, setTab] = useState('对话')
  const [notice, setNotice] = useState('')
  const input = useRef(null)
  const appended = useRef(false)
  const thread = useRef(null)
  const following = useRef(true)
  const timer = useRef(null)
  const resizeInput = () => {
    const el = input.current
    if (!el) return
    const css = getComputedStyle(el)
    const line = parseFloat(css.lineHeight) || 21
    const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
    const border = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth)
    const max = line * 3 + padding + border
    el.style.maxHeight = `${max}px`
    el.style.height = '0px'
    const height = Math.max(line + padding + border, Math.min(el.scrollHeight + border, max))
    el.style.height = `${height}px`
    el.style.overflowY = el.scrollHeight + border > max ? 'auto' : 'hidden'
  }
  useLayoutEffect(resizeInput, [draft, compact, collapsed])
  useLayoutEffect(() => {
    if (!appended.current || !input.current) return
    appended.current = false
    input.current.setSelectionRange(draft.length, draft.length)
    input.current.scrollTop = input.current.scrollHeight
  }, [draft])
  useEffect(() => {
    let width = -1
    const observer = new ResizeObserver(() => {
      const next = input.current?.clientWidth
      if (next !== width) { width = next; resizeInput() }
    })
    if (input.current) observer.observe(input.current)
    return () => observer.disconnect()
  }, [])
  const canSend = !!draft.trim() && !busy && !disabled
  const notify = text => { setNotice(text); clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(''), 2500) }
  const appendPrompt = prompt => {
    const next = `${draft}${draft && !draft.endsWith('\n') ? '\n' : ''}${prompt}`
    if (next.length > 2000) { notify('输入内容已满，请删减后再追加'); return }
    appended.current = true
    onDraft(next)
    input.current?.focus()
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (thread.current && following.current) thread.current.scrollTop = thread.current.scrollHeight }, [messages, busy, tab, streamed])
  const send = () => { if (canSend) { following.current = true; setTab('对话'); onSend() } }
  const composer = (
    <div className="provided-composer-wrap">
      {!compact && !collapsed && <div className="note-quick-prompts" aria-label="快捷输入"><select className="note-thinking-toggle" aria-label="Thinking depth" value={thinking} disabled={busy || disabled} onChange={e => setThinking(e.target.value)}>{levels.map(level => <option key={level} value={level}>{level.toUpperCase()}</option>)}</select>{[
        ['解释概念', '用通俗语言解释这段内容，保留关键术语和适用条件。'],
        ['提炼要点', '提炼这段内容的核心要点，保留条件与例外，去掉重复。'],
        ['图解说明', '用简洁图示辅助说明这段内容的关系，不适合画图的部分保留文字。'],
        ['对比易错点', '对比这段内容中容易混淆的概念，说明区别与易错点。'],
      ].map(([label, prompt]) => <button type="button" key={label} disabled={busy || disabled} onClick={() => appendPrompt(prompt)}>{label}</button>)}</div>}
      <form className="provided-composer nb-chat-compose" onSubmit={e => { e.preventDefault(); send() }}>
      <textarea ref={input} rows={1} aria-label="告诉 AI 怎么调整" placeholder={collapsed ? "补充要求…" : placeholder} value={draft} maxLength={2000} onChange={e => onDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
      {collapsed && <select className="note-collapsed-thinking" aria-label="Thinking depth" value={thinking} disabled={busy || disabled} onChange={e => setThinking(e.target.value)}>{levels.map(level => <option key={level} value={level}>{level.toUpperCase()}</option>)}</select>}
      <div className="provided-composer-actions"><span role="status">{notice}</span>{!compact && !collapsed && <button type="button" className="provided-mic" aria-label="语音输入" onClick={() => notify('尽请期待')}><Glyph name="mic" /></button>}{busy ? <button type="button" className="provided-send" key="stop" aria-label="停止生成" onClick={e => { e.preventDefault(); onStop?.() }}><Glyph name="stop" /></button> : <button type="submit" className="provided-send" key="send" aria-label="发送" disabled={!canSend}><Glyph name="send" /></button>}</div>
    </form></div>
  )
  if (compact) return composer
  return <section className="provided-chat nb-chat" aria-label="AI 对话编辑">
    <header className="provided-chat-header">
      <div className="provided-chat-tabs">{['对话', '依据'].map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    </header>
    <div className="provided-chat-thread" ref={thread} onScroll={e => { const el = e.currentTarget; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48 }} role={tab === '对话' ? 'log' : undefined} aria-label={tab === '对话' ? '编辑对话' : '摘录依据'} aria-live="polite">
      {tab === '对话' ? <>
        {!messages.length && <p className="provided-chat-empty">{emptyMessage}</p>}
        {messages.map((m, i) => m.role === 'user' ? <div className="provided-user-row" key={i}><div className="provided-user-bubble">{m.text}</div></div> : <div className="provided-reply" key={i}><div className="provided-reply-label"><span>笔记助手</span>{m.elapsed != null && <small>{m.elapsed.toFixed(1)}s</small>}</div><p>{m.text}</p>{m.interrupted && <div className="chat-stream-interrupted"><strong>{m.failure?.label || '本轮回复未成功'}</strong><p>{m.failure?.detail || '未收到完整有效的笔记结果，可重新发送。'}</p><small>本轮未生成新的修改预览，已有笔记保持不变。</small></div>}</div>)}
        {busy && <div className="provided-reply chat-stream-reply"><ChatLoading received={received} mode={thinking === 'off' ? '' : thinking.toUpperCase()} retrying={retrying} />{streamed && <StreamingText text={streamed} />}</div>}
      </> : <>{captures.map(c => <details key={c.id} className="provided-source" open><summary>{c.sourceTitle || '学习摘录'} · {new Date(c.at).toLocaleString('zh-CN')}</summary><p>{c.excerpt}</p><details open><summary>上下文</summary><p>{c.context}</p></details></details>)}<NoteKnowledge note={evidenceNote} /></>}
    </div>
    {error && <p className="provided-chat-error" role="alert">{error}</p>}
    {composer}

    {!hasKey && <button className="btn-sm" onClick={onSettings}>前往 AI 设置</button>}
  </section>
}
function Glyph({ name }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{{
    send: <path d="M12 19V5M5 12l7-7 7 7" />,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />,
  }[name]}</svg>
}

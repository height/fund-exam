import { getCfg } from '../lib/ai'
import { noteReplyFailure } from '../lib/noteReplyFailure'
import { getThinkingLevel } from '../lib/noteThinking'
import { useEffect, useRef, useState } from 'react'
import { askNotebookEdit, getKey } from '../lib/ai'
import { capturesOf, relatedNotes } from '../lib/notebook'
import { mergeNotes, noteRunning, removeNote, saveNote } from '../lib/notebookStorage'
import { useStore } from '../lib/store'
import ChatComposer from './ChatComposer'
import NoteMarkdown from './NoteMarkdown'

const stamp = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
export default function NoteDetail({ note, allNotes, autoEdit, go, onSaved, onDeleted, confirm, onState, initialPrompt = '', sendOnOpen = false, captureId, isNew = false, onResume }) {
  const { toast } = useStore()
  const [tab, setTab] = useState('original')
  const previewTop = useRef(null)
  const [editing, setEditing] = useState(autoEdit)
  const [input, setInput] = useState(initialPrompt || (isNew ? '整理这个知识点' : ''))
  const initialSent = useRef(false)
  const [messages, setMessages] = useState([])
  const [proposal, setProposal] = useState(null)
  const [received, setReceived] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [streamed, setStreamed] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef(null)
  const running = !isNew && noteRunning(note.id)
  const captures = capturesOf(note)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { onState({ dirty: busy || !!proposal || !!input.trim(), busy: saving, editing }) }, [proposal, input, busy, saving, editing, onState])
  useEffect(() => { if (tab === 'draft' && proposal) previewTop.current?.parentElement.querySelector('.nb-document-scroll')?.scrollTo(0, 0) }, [proposal, tab])
  const send = async (text = input, target = null) => {
    if (!text.trim() || busy || saving || running) return
    if (!getKey()) { setError('请先在 AI 设置中配置模型'); return }
    const next = [...messages, { role: 'user', text: text.trim() }]
    setMessages(next); setInput(''); setBusy(true); setRetrying(false); setReceived(0); setStreamed(''); setError('')
    let partial = ''
    const started = performance.now()
    const ctl = new AbortController(); controller.current = ctl
    const effort = getThinkingLevel('note', getCfg().model)
    const think = effort !== 'off'
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; ctl.abort() }, think ? 600000 : 180000)
    const stopped = () => {
      clearTimeout(timer)
      if (controller.current !== ctl) return
      controller.current = null; setBusy(false); setInput(text); setError(timedOut ? '等待模型超时，输入已保留，可重试。' : '已停止生成，可以继续对话。')
      if (partial) setMessages(m => [...m, { role: 'assistant', text: partial, interrupted: true, failure: noteReplyFailure(null, { stopped: true, timedOut }) }])
    }
    ctl.signal.addEventListener('abort', stopped, { once: true })
    try {
      const base = proposal?.base || note
      const mergeTarget = target || proposal?.target
      const current = { ...base, ...(proposal?.result || {}), selectionExcerpt: captures.find(c => c.id === captureId)?.excerpt || note.excerpt }
      const result = await askNotebookEdit(current, next, mergeTarget, ctl.signal, (count, reply, retry) => { if (controller.current === ctl) { partial = reply; setRetrying(retry); setReceived(count); setStreamed(reply) } }, { think, effort })
      if (ctl.signal.aborted) return
      setMessages(m => [...m, { role: 'assistant', text: result.reply, elapsed: (performance.now() - started) / 1000 }])
      if (result.note) { setProposal({ base, target: mergeTarget, result: result.note }); setTab('draft') }
    } catch (e) { if (controller.current === ctl) { setError(e.message); setInput(text); if (partial) setMessages(m => [...m, { role: 'assistant', text: partial, interrupted: true, failure: noteReplyFailure(e) }]) } }
    finally { clearTimeout(timer); ctl.signal.removeEventListener('abort', stopped); if (controller.current === ctl) { controller.current = null; setBusy(false) } }
  }
  useEffect(() => {
    if (!sendOnOpen || initialSent.current || running) return
    const timer = setTimeout(() => {
      initialSent.current = true
      if (input.trim()) send(input)
    }, 0)
    return () => clearTimeout(timer)
  }, [sendOnOpen, running])
  const save = async () => {
    setSaving(true); setError('')
    try {
      const changes = { ...proposal.result, edited: true, error: '', updatedAt: Date.now() }
      const saved = proposal.target ? await mergeNotes(proposal.base, proposal.target, changes) : await saveNote({ ...proposal.base, ...changes, captures: capturesOf(proposal.base) }, isNew ? undefined : proposal.base.updatedAt)
      setProposal(null); setTab('original'); setMessages(m => [...m, { role: 'assistant', text: saved.status === 'ready' ? '已保存到笔记。' : '已保存为待核对，原文依据仍需确认。' }]); toast('笔记已保存'); onSaved(saved.id)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const discard = async () => {
    if (!await confirm({ title: '放弃这份修改建议？', body: '已保存的笔记保持不变。', ok: '放弃建议', cancel: '继续调整' })) return
    setProposal(null); setTab('original'); setMessages([])
  }
  return <article className={`nb-note nb-note-detail nb-workspace ${editing ? "is-editing" : ""}`}>
    <div className="nb-document">
    <div className="nb-document-toolbar">
    <div className="nb-version-tabs" role="tablist" aria-label="笔记版本" ref={previewTop}>
      {[['original', isNew ? '选中原文' : '原笔记'], ['draft', isNew ? '待保存' : '修改中']].map(([value, label]) => <button key={value} id={`note-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`note-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={e => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'original' : e.key === 'End' ? 'draft' : value === 'original' ? 'draft' : 'original'; setTab(next); document.getElementById(`note-tab-${next}`)?.focus() }
      }}>{label}{value === 'draft' && proposal && <span className="nb-unsaved-dot" aria-label="尚未保存" />}</button>)}
    </div>
    </div>
    <div className="nb-document-scroll" id="nb-document-content">
    <section id="note-panel-original" role="tabpanel" aria-labelledby="note-tab-original" hidden={tab !== 'original'}>
    <div className="nb-note-heading"><h3>{isNew ? '本次选中的内容' : note.title}</h3>{!isNew && note.status !== 'ready' && <span className="nb-state">{running ? '整理中' : '待核对'}</span>}</div>
    <p className="nb-note-meta">{note.subject} · {note.chapter}</p>
    <div className="nb-essence">{isNew ? <p className="nb-selected-excerpt">{note.excerpt}</p> : <NoteMarkdown note={note} />}</div>
    {!isNew && note.status !== 'ready' && <p className="nb-inbox-hint">{note.reviewReason || note.error || '原文已保存，正在后台整理。'}</p>}
    {note.status === 'review' && note.points.length > 0 && !proposal && !busy && <button className="btn-sm" disabled={saving || running} onClick={async () => {
      if (!await confirm({ title: '已核对原文与适用条件？', body: '确认当前内容准确后，将这条笔记收进章节精华。需要修改时可继续与 AI 对话。', ok: '确认收进精华', cancel: '继续核对' })) return
      setSaving(true)
      try { const saved = await saveNote({ ...note, status: 'ready', reviewReason: '', edited: true, updatedAt: Date.now() }, note.updatedAt); onSaved(saved.id); toast('已收进精华') }
      catch (e) { setError(e.message) } finally { setSaving(false) }
    }}>已核对，收进精华</button>}
    </section>
    <section id="note-panel-draft" role="tabpanel" aria-labelledby="note-tab-draft" hidden={tab !== 'draft'}>
    {proposal && <section className="nb-proposal" aria-label="修改预览"><h3>{proposal.result.title}</h3><small>{proposal.result.subject} · {proposal.result.chapter}</small><NoteMarkdown note={proposal.result} />{proposal.result.reviewReason && <p className="nb-error">{proposal.result.reviewReason}</p>}<div className="row nb-save-toolbar"><button className="btn-pri btn-sm" disabled={busy || saving} onClick={save}>{saving ? '保存中…' : proposal.target ? '确认合并' : isNew ? (proposal.result.status === 'ready' ? '加入笔记本' : '加入笔记本 · 待核对') : proposal.result.status === 'ready' ? '保存修改' : '保存为待核对'}</button><button className="btn-sm btn-ghost" disabled={busy || saving} onClick={discard}>放弃建议</button></div></section>}
      {!proposal && <div className="nb-draft-empty"><b>{busy ? 'AI 正在整理修改…' : '还没有修改建议'}</b><p>在下方对话框说说想怎么改，预览会显示在这里。确认保存后才会写入笔记本。</p></div>}
    </section>
    <div className="nb-note-actions">{!editing && <button className="btn-sm" onClick={() => setEditing(true)}>对话编辑</button>}{!isNew && <button className="btn-sm btn-ghost" disabled={busy || saving || running} onClick={async () => {
      if (await confirm({ title: '删除这个考点？', body: `同时删除 ${captures.length} 次摘录。`, ok: '删除考点', cancel: '保留' })) {
        try { await removeNote(note.id); onDeleted(); toast('已删除考点') } catch (e) { setError(e.message) }
      }
    }}>删除</button>}</div>
    {!editing && <details className="nb-source"><summary>原文与整理依据 · {captures.length} 次摘录</summary>{(note.evidence || []).map((e, i) => <blockquote key={i}>{e}</blockquote>)}{[...captures].reverse().map(c => <details key={c.id}><summary>{stamp(c.at)} · {c.sourceTitle || '学习摘录'}</summary><blockquote>{c.excerpt}</blockquote><p>{c.context}</p></details>)}</details>}
    {relatedNotes(note, allNotes).length > 0 && <details className="nb-source"><summary>相关考点</summary>{relatedNotes(note, allNotes).map(n => <div key={n.id}><b>{n.title}</b><p>{n.points.join(' ')}</p><button className="btn-sm" disabled={busy || saving || !!proposal || running} onClick={() => { setEditing(true); send(`请比较并合并“${n.title}”，保留必要条件，删除重复。`, n) }}>让 AI 比较并合并</button></div>)}</details>}
    </div></div>
    {editing && <ChatComposer retrying={retrying} streamed={streamed} received={received} messages={messages} draft={input} onDraft={setInput} onSend={() => { onResume?.(); send() }} busy={busy} disabled={saving || running} onStop={() => controller.current?.abort()} error={error || (running && sendOnOpen && !initialSent.current ? '原文正在整理，你的要求已保留，完成后会自动继续。' : '')} captures={captures} hasKey={!!getKey()} onSettings={() => go('data', { page: 'ai' })} />}



  </article>
}

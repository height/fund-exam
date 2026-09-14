import { useEffect, useRef, useState } from 'react'
import { Icon, PageHeader, ThemeToggle } from '../components/ui'
import { CHAPTERS } from '../data/chapters'
import { capturesOf, groupNotes } from '../lib/notebook'
import { noteRunning, useNotebook } from '../lib/notebookStorage'
import { openNote } from '../lib/noteModal'
import NoteMarkdown from '../components/NoteMarkdown'
import '../notebook.css'

const day = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
const stateLabel = note => note.status === 'review' ? '待核对' : noteRunning(note.id) ? '整理中' : '待整理'

export default function Notebook({ go, noteId, editRequested }) {
  const { notes, loading, error } = useNotebook()
  const [mode, setMode] = useState('outline')
  const [subject, setSubject] = useState('all')
  const [chapter, setChapter] = useState('all')
  const [query, setQuery] = useState('')
  const [outlineOpen, setOutlineOpen] = useState(false)
  const routed = useRef('')
  const ready = notes.filter(n => n.status === 'ready')
  const pending = notes.length - ready.length
  const base = mode === 'inbox' ? notes.filter(n => n.status !== 'ready') : mode === 'index' ? notes : ready
  const groups = groupNotes(base.filter(n => subject === 'all' || n.subject === subject))
  const search = query.trim().toLocaleLowerCase()
  const filtered = base.filter(n => (subject === 'all' || n.subject === subject) &&
    (chapter === 'all' || `${n.subject}:${n.chapter}` === chapter) &&
    (!search || [n.title, n.chapter, n.markdown || '', ...n.points, ...capturesOf(n).map(c => c.excerpt)].join(' ').toLocaleLowerCase().includes(search)))
  const index = filtered.flatMap(note => capturesOf(note).map(capture => ({ note, capture }))).sort((a, b) => b.capture.at - a.capture.at)
  useEffect(() => {
    const key = `${noteId}:${editRequested}`
    if (loading || !noteId || routed.current === key) return
    if (notes.some(n => n.id === noteId)) { openNote(noteId, editRequested ? 'edit' : 'view'); routed.current = key }
  }, [noteId, editRequested, loading, notes])
  const changeMode = next => { setMode(next); setChapter('all') }
  const selectChapter = value => { setChapter(value); setOutlineOpen(false) }
  const resetFilters = () => { setQuery(''); setSubject('all'); setChapter('all') }

  return <>
    <PageHeader variant="subpage" title="我的笔记本" onBack={() => go('home')} backLabel="首页" action={<div className="nb-print-action"><button className="nb-print-button" aria-label="小抄生成页面" onClick={() => go('cheatsheet')}><Icon name="sparkle" size={15} /><span>小抄</span></button><ThemeToggle iconOnly /></div>} />
    <div className="nb-summary"><div><b>{ready.length}</b><span>条精华</span><small>记住关键，也保留必要的复杂</small></div>
      {pending > 0 && <button className="nb-inbox-link" onClick={() => changeMode('inbox')}>{pending} 条待处理 <Icon name="right" /></button>}</div>
    <div className="nb-controls"><label className="nb-search"><Icon name="search" /><input type="search" aria-label="搜索笔记" placeholder="搜索考点或原文" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select aria-label="筛选笔记科目" value={subject} onChange={e => { setSubject(e.target.value); setChapter('all') }}><option value="all">全部科目</option>{Object.keys(CHAPTERS).map(s => <option key={s}>{s}</option>)}</select><select className="nb-mobile-chapters" aria-label="筛选笔记章节" value={chapter} onChange={e => selectChapter(e.target.value)}><option value="all">全部章节</option>{groups.map(g => <option key={`${g.subject}:${g.chapter}`} value={`${g.subject}:${g.chapter}`}>{g.subject} · {g.label}（{g.notes.length}）</option>)}</select></div>
    <div className="seg nb-tabs" role="tablist" aria-label="笔记浏览方式">{[['outline', '章节精华'], ['inbox', `待处理${pending ? ` ${pending}` : ''}`], ['index', '时间索引']].map(([value, label]) =>
      <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? 'on' : ''} onClick={() => changeMode(value)}>{label}{value === 'outline' && <span className="nb-mobile-count" aria-hidden="true">{ready.length}</span>}</button>)}</div>
    {error ? <div className="nb-empty" role="alert">笔记读取失败：{error}<button onClick={() => location.reload()}>重新加载</button></div>
      : loading ? <p role="status">正在打开笔记本…</p> : !notes.length ? <section className="nb-empty"><Icon name="list" size={32} /><h2>从一个想记住的考点开始</h2><p>长按选中文字，点“记笔记”后说说想怎么记。AI 整理后，确认才会加入笔记本。</p><button className="btn-pri" onClick={() => go('map')}>去知识图谱摘录 <Icon name="right" /></button></section>
        : <div className="nb-layout">
          <aside className={`nb-outline ${outlineOpen ? 'is-open' : ''}`}><button className="nb-outline-toggle" aria-expanded={outlineOpen} onClick={() => setOutlineOpen(v => !v)}>章节目录 <span>{chapter === 'all' ? '全部' : chapter.split(':')[1]} ▾</span></button>
            <nav aria-label="笔记章节目录"><button className={chapter === 'all' ? 'on' : ''} aria-pressed={chapter === 'all'} onClick={() => selectChapter('all')}>全部章节 <span>{groups.reduce((sum, g) => sum + g.notes.length, 0)}</span></button>
              {Object.keys(CHAPTERS).filter(s => groups.some(g => g.subject === s)).map(s => <div key={s}><h2>{s}</h2>{groups.filter(g => g.subject === s).map(g => {
                const key = `${s}:${g.chapter}`
                return <button key={key} className={chapter === key ? 'on' : ''} aria-pressed={chapter === key} onClick={() => selectChapter(key)}>{g.label}<span>{g.notes.length}</span></button>
              })}</div>)}
            </nav></aside>
          <div className="nb-content" role="tabpanel" aria-label={mode === 'outline' ? '章节精华' : mode === 'inbox' ? '待处理' : '时间索引'}>
            <div className="nb-result-count"><span role="status">{mode === 'index' ? `${index.length} 次摘录` : `${filtered.length} 条${mode === 'inbox' ? '待处理' : '精华'}`}</span>{chapter !== 'all' && <button onClick={() => setChapter('all')}>清除章节筛选</button>}</div>
            {mode === 'inbox' && filtered.length > 0 && <p className="nb-inbox-hint">这里保留尚未整理或需要核对的摘录。确认重点与依据后，再收进精华。</p>}
            {!filtered.length ? <div className="nb-empty"><h2>{query || chapter !== 'all' || subject !== 'all' ? '没有匹配的笔记' : mode === 'inbox' ? '没有待处理的摘录' : '精华正在积累'}</h2>
              <p>{query || chapter !== 'all' || subject !== 'all' ? '试试其他关键词或章节。' : mode === 'inbox' ? '继续学习，遇到重要的内容再记下。' : '摘录已保留，可先到待处理查看整理进度。'}</p>
              {query || chapter !== 'all' || subject !== 'all' ? <button onClick={resetFilters}>清除筛选</button> : mode !== 'inbox' && <button onClick={() => changeMode('inbox')}>查看待处理</button>}</div>
              : mode === 'index' ? <div className="nb-timeline">{index.map(({ note, capture }, i) => <div key={`${note.id}:${capture.id}`}>
                {(i === 0 || day(capture.at) !== day(index[i - 1].capture.at)) && <h2>{day(capture.at)}</h2>}
                <button className="nb-index-entry" onClick={() => openNote(note.id)}><time dateTime={new Date(capture.at).toISOString()}>{new Date(capture.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span><b>{note.title}</b><small>{note.subject} · {note.chapter}{note.status !== 'ready' && ` · ${stateLabel(note)}`}</small></span><Icon name="right" /></button>
              </div>)}</div> : groupNotes(filtered).map(g => <section className="nb-chapter" key={`${g.subject}:${g.chapter}`}><header><span>{g.subject}</span><h2>{g.label}</h2></header><div className="nb-note-list">
                {g.notes.map(note => <article className="nb-note" key={note.id} id={`note-${note.id}`}>
                  <div className="nb-note-heading"><h3><button className="nb-note-title" onClick={() => openNote(note.id)}>{note.title}</button></h3>{note.status !== 'ready' && <span className="nb-state">{stateLabel(note)}</span>}</div>
                  <div className="nb-essence nb-desktop-body"><NoteMarkdown note={note} /></div>
                  <button className="nb-mobile-preview" aria-label={`查看${note.title}的完整笔记`} onClick={() => openNote(note.id)}><span>{note.points.join(' ') || note.excerpt}</span></button>
                  <div className="nb-mobile-meta">{new Date(note.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} · {capturesOf(note).length} 次摘录{(note.formula || /\$/.test(note.markdown || '')) && ' · 公式'}{(note.diagram || /<svg|```svg/.test(note.markdown || '')) && ' · 图示'}</div>
                  {note.status !== 'ready' && <p className="muted">{note.reviewReason || note.error || '原文已保留，正在整理。'}</p>}
                  <div className="nb-note-actions"><button className="btn-sm btn-ghost" onClick={() => openNote(note.id)}>查看详情 <Icon name="right" /></button><button className="btn-sm" disabled={noteRunning(note.id)} onClick={() => openNote(note.id, 'edit')}>{note.status === 'ready' ? '编辑笔记' : '核对与调整'}</button></div>
                </article>)}
              </div></section>)}
          </div>
        </div>}
    <p className="nb-storage-hint">原文与摘录时间始终保留。笔记存于此设备，可到<button onClick={() => go('data', { page: 'storage' })}>数据管理</button>备份。</p>
  </>
}

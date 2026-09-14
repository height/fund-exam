import { renderToStaticMarkup } from 'react-dom/server'
import NoteMarkdown from '../components/NoteMarkdown'
import { groupNotes } from './notebook'
import styles from './notebookPrint.css?raw'
import controls from './notebookPrintControls.js?raw'

export function notebookPrintHTML(notes) {
  const ready = notes.filter(note => note.status === 'ready')
  if (!ready.length) throw new Error('还没有可生成小抄的章节精华')
  const groups = groupNotes(ready)
  const date = new Date().toLocaleDateString('zh-CN')
  let index = 0
  const body = renderToStaticMarkup(<>
    <header className="print-toolbar"><div><strong>A4 复习小抄</strong><span>{ready.length} 个考点 · {groups.length} 个章节</span></div>
      <label>排版 <select id="columns" defaultValue="3"><option value="3">三栏 · 高密度</option><option value="2">两栏 · 更易读</option></select></label>
      <button id="download">下载 HTML</button><button id="print">打印 / 另存 PDF</button>
      <p id="print-help">A4 纵向，多页自动排版。打印时建议关闭页眉页脚、使用 100% 缩放。仅收录已整理精华；图片加载后即可打印。</p>
    </header>
    <div className="preview"><main className="paper">
      <header className="sheet-title"><h1>基金从业 · 复习小抄</h1><span>{ready.length} 个考点 / {groups.length} 章 / {date}</span></header>
      <div className="sheet-columns">{groups.map(group => <section className="chapter" key={`${group.subject}:${group.chapter}`}>
        <h2>{group.subject} · {group.label}</h2>
        {group.notes.map(note => <article className="entry" key={note.id}>
          <h3><span className="entry-index">{String(++index).padStart(2, '0')}</span>{note.title}</h3>
          <NoteMarkdown note={note} />
        </article>)}
      </section>)}</div>
      <footer className="sheet-end">共 {ready.length} 个考点 · 完整内容来自已保存笔记，条件与例外保留</footer>
    </main></div>
  </>)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>基金从业复习小抄</title><style>${styles}</style></head><body>${body}<script>${controls}</script></body></html>`
}

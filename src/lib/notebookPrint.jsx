import { dedupeSheetSVG } from './cheatsheetAssets'
import brandLogo from '../assets/kaojibao-logo.png?inline'
import { renderToStaticMarkup } from 'react-dom/server'
import NoteMarkdown from '../components/NoteMarkdown'
import { groupNotes } from './notebook'
import styles from './notebookPrint.css?raw'
import controls from './notebookPrintControls.js?raw'

export function notebookPrintHTML(notes, { sourceCount = notes.length, generatedAt = Date.now(), returnUrl = '', embedded = false } = {}) {
  const seenFigures = new Set()
  const ready = notes.filter(note => note.status === 'ready').map(note => ({ ...note, markdown: dedupeSheetSVG(note.markdown || '', seenFigures) }))
  if (!ready.length) throw new Error('还没有可生成小抄的章节精华')
  const groups = groupNotes(ready)
  const subjects = [...new Set(groups.map(group => group.subject))].join(' / ')
  const date = new Date(generatedAt).toLocaleDateString('zh-CN')
  let index = 0
  const body = renderToStaticMarkup(<>
    <header className="print-toolbar"><div>{/^(https?|file):\/\//.test(returnUrl) && <a id="back" href={returnUrl} aria-label="返回小抄生成页">← 返回</a>}<strong>复习小抄</strong><span>{sourceCount} 条笔记 → {ready.length} 个考点</span></div>
      <label>预览 <select id="scale" defaultValue="fit"><option value="fit">适应屏幕</option><option value="1">100%</option><option value="1.5">150%</option></select></label>
      <button id="download">下载 HTML</button><button id="print">打印 / 另存 PDF</button>
      <p id="print-help">请核对后打印。A4 纵向自动分页，请选择彩色打印，关闭页眉页脚、使用 100% 缩放。原笔记保持不变。</p>
    </header>
    <div className="preview"><div className="paper-frame"><main className="paper">
      <header className="sheet-title"><h1>{subjects} · 复习小抄</h1><span className="pen-legend"><b>蓝 · 结论</b><b>绿 · 条件</b><b>红 · 易错</b></span><span>{ready.length} 个考点 / {date}</span></header>
      <div className="sheet-columns">{groups.flatMap(group => group.notes).map(note => <article className="entry" key={note.id}>
          <h3><span className="entry-index">{String(++index).padStart(2, '0')}</span>{note.title}</h3>
          <NoteMarkdown note={note} />
        </article>)}</div>
      <footer className="sheet-end">{sourceCount} 条笔记提炼为 {ready.length} 个考点 · 条件 / 例外 / 公式</footer>
    <div className="sheet-watermark" aria-label="考基宝"><img src={brandLogo} alt="" /><span>考基宝</span></div>
    </main></div></div>
    <div className="sheet-watermark print-watermark" aria-hidden="true"><img src={brandLogo} alt="" /><span>考基宝</span></div>
  </>)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>基金从业复习小抄</title><style>${styles}${embedded ? ".print-toolbar{display:none}.preview{padding:8px 12px}body{background:#f1f2f4}" : ""}</style></head><body>${body}<script>${controls}</script></body></html>`
}

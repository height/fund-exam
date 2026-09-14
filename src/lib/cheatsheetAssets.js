import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'

const parser = new MarkdownIt({ html: true }).use(texmath, { engine: katex, delimiters: 'dollars' })

// Keep source visuals as content; NoteMarkdown still sanitizes them at render time.
export function sheetAssets(markdown = '') {
  const assets = new Map()
  const add = (key, value) => assets.set(key, value)
  for (const svg of markdown.matchAll(/<svg\b[\s\S]*?<\/svg\s*>/gi)) add(svg[0], svg[0])
  const visit = tokens => tokens.forEach(token => {
    if (token.type === 'image') {
      const html = parser.renderer.render([token], parser.options, {})
      add(`image:${token.attrGet('src')}`, html)
    }
    if (token.type.startsWith('math_')) add(`math:${token.content.trim()}`, `$$\n${token.content.trim()}\n$$`)
    if (token.type === 'html_inline' || token.type === 'html_block') {
      for (const img of token.content.matchAll(/<img\b[^>]*>/gi)) {
        const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(img[0])?.[1]
        add(src ? `image:${src}` : img[0], img[0])
      }
    }
    if (token.children) visit(token.children)
  })
  visit(parser.parse(markdown, {}))
  return assets
}

export function retainSheetAssets(notes, sources) {
  for (const source of sources) {
    const targets = notes.filter(n => n.sourceIds.includes(source.id))
    if (!targets.length) continue // Source coverage is validated by the caller.
    const present = new Set(targets.flatMap(n => [...sheetAssets(n.markdown).keys()]))
    const missing = [...sheetAssets(source.markdown).entries()].filter(([key]) => !present.has(key))
    if (missing.length) targets[0].markdown += '\n\n' + missing.map(([, value]) => value).join('\n\n')
  }
  return notes
}

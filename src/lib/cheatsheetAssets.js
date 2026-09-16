import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'

const parser = new MarkdownIt({ html: true }).use(texmath, { engine: katex, delimiters: 'dollars' })

// Local SVG IDs can be renamed without changing the drawing (e.g. arrow → arrow2).
export function svgAssetKey(svg) {
  const ids = new Map([...svg.matchAll(/\bid=["']([^"']+)["']/g)].map((match, i) => [match[1], `ref${i}`]))
  const normalized = svg.replace(/\bid=(["'])([^"']+)\1/g, (_, quote, id) => `id="${ids.get(id)}"`)
    .replace(/url\(#([^)]*)\)/g, (value, id) => ids.has(id) ? `url(#${ids.get(id)})` : value)
    .replace(/(href=["'])#([^"']+)/g, (value, prefix, id) => ids.has(id) ? `${prefix}#${ids.get(id)}` : value)
    .replace(/<!--[\s\S]*?-->/g, '')
  // Compare XML structure, not serialization: quotes, attribute order, indentation,
  // entity encoding and <path/> versus <path></path> do not change a drawing.
  return 'svg:' + normalized.replace(/<([\w:-]+)\b([^>]*?)(\/?)>/g, (_, tag, raw, closed) => {
    const attrs = [...raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, name, double, single]) => [name, parser.utils.unescapeAll(double ?? single)])
      .sort(([a], [b]) => a.localeCompare(b))
    return `<${tag} ${JSON.stringify(attrs)}>${closed ? `</${tag}>` : ''}`
  }).replace(/>\s+</g, '><').trim()
}

export function dedupeSheetSVG(markdown, seen = new Set()) {
  return markdown.replace(/```svg[ \t]*\n\s*<svg\b[\s\S]*?<\/svg\s*>\s*\n```|<svg\b[\s\S]*?<\/svg\s*>/gi, block => {
    const svg = block.match(/<svg\b[\s\S]*?<\/svg\s*>/i)[0]
    const key = svgAssetKey(svg)
    if (seen.has(key)) return ''
    seen.add(key); return block
  })
}

// Keep source visuals as content; NoteMarkdown still sanitizes them at render time.
export function sheetAssets(markdown = '') {
  const assets = new Map()
  const add = (key, value) => assets.set(key, value)
  for (const svg of markdown.matchAll(/<svg\b[\s\S]*?<\/svg\s*>/gi)) add(svgAssetKey(svg[0]), svg[0])
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
  for (const note of notes) note.markdown = dedupeSheetSVG(note.markdown)
  for (const source of sources) {
    const targets = notes.filter(n => n.sourceIds.includes(source.id))
    if (!targets.length) continue // Source coverage is validated by the caller.
    const present = new Set(targets.flatMap(n => [...sheetAssets(n.markdown).keys()]))
    const missing = [...sheetAssets(source.markdown).entries()].filter(([key]) => !present.has(key))
    if (missing.length) targets[0].markdown += '\n\n' + missing.map(([, value]) => value).join('\n\n')
  }
  const seen = new Set()
  for (const note of notes) note.markdown = dedupeSheetSVG(note.markdown, seen)
  return notes
}

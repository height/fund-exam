import MarkdownIt from 'markdown-it'

const parser = new MarkdownIt({ html: true })

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

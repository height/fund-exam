// Stable chapter/section/point IDs keep navigation, search and both views in sync.
export function indexKnowledge(chapters) {
  const entries = [], byId = new Map()
  function visit(node, id, depth, chapterIndex, parent = null) {
    const entry = { ...node, id, depth, chapterIndex, parent,
      chapter: chapters[chapterIndex].chapter, children: [] }
    entries.push(entry)
    byId.set(id, entry)
    entry.children = (node.c || []).map((child, i) => visit(child, `${id}.${i}`, depth + 1, chapterIndex, id).id)
    entry.points = entry.children.length
      ? entry.children.reduce((n, child) => n + byId.get(child).points, 0) : 1
    return entry
  }
  chapters.forEach((ch, i) => visit(ch, `ch-${i}`, 1, i))
  return { entries, byId, chapters: entries.filter(n => n.depth === 1) }
}

export function searchKnowledge(index, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return index.entries.filter(n => terms.every(term => `${n.t} ${n.d || ''} ${Object.values(n.review || {}).flat().join(' ')}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => Number(terms.every(t => b.t.toLocaleLowerCase().includes(t)))
      - Number(terms.every(t => a.t.toLocaleLowerCase().includes(t))) || a.chapterIndex - b.chapterIndex)
}

export function ancestorsOf(index, id) {
  const ancestors = []
  let parent = index.byId.get(id)?.parent
  while (parent) { ancestors.unshift(parent); parent = index.byId.get(parent)?.parent }
  return ancestors
}

export function toggleBranch(open, id) {
  const next = new Set(open)
  if (next.has(id)) {
    for (const key of next) if (key === id || key.startsWith(`${id}.`)) next.delete(key)
  } else next.add(id)
  return next
}

// Nodes hug their labels. Long titles wrap instead of widening every node.
export function knowledgeNodeSize(entry) {
  const units = [...entry.t].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : .55), 0)
  const width = Math.min(250, Math.max(92, Math.ceil(units * 14) + 32))
  const lines = Math.max(1, Math.ceil(units * 14 / (width - 30)))
  return { width, height: Math.max(40, lines * 19 + 16) }
}

export function chapterLabel(entry) {
  const numbers = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八']
  return `${numbers[entry.chapterIndex]}、${entry.t}`
}

// All chapters always remain in one subject tree. chapterIndex is navigation
// context only; it never filters the graph or discards another open chapter.
export function layoutKnowledge(index, chapterIndex, open, rootLabel) {
  const nodes = [], edges = []
  const labelOf = entry => entry.depth === 1 ? chapterLabel(entry) : entry.t
  const measure = entry => {
    const size = knowledgeNodeSize({ t: labelOf(entry) })
    const children = open.has(entry.id) ? entry.children.map(id => measure(index.byId.get(id))) : []
    const childHeight = children.reduce((h, c) => h + c.span, 0) + Math.max(0, children.length - 1) * 14
    return { entry, children, size, childHeight, span: Math.max(size.height, childHeight) }
  }
  const addNode = (entry, position, extra = {}) => {
    const node = { id: entry.id, type: 'knowledge', position,
      ...knowledgeNodeSize({ t: labelOf(entry) }),
      data: { entry, label: labelOf(entry), expanded: open.has(entry.id), ...extra } }
    nodes.push(node)
    return node
  }
  const connect = (source, target, left) => edges.push({
    id: `${source.id}/${target.id}`, source: source.id, target: target.id,
    sourceHandle: left ? 'left' : 'right', targetHandle: left ? 'right-in' : 'left-in',
    type: 'default', selectable: false,
  })
  const half = Math.ceil(index.chapters.length / 2)
  const halves = [index.chapters.slice(0, half).map(measure), index.chapters.slice(half).map(measure)]
  const heightOf = trees => trees.reduce((h, t) => h + t.span, 0) + Math.max(0, trees.length - 1) * 24
  const totalHeight = Math.max(...halves.map(heightOf))
  const root = addNode({ id: 'subject', t: rootLabel, depth: 0, children: [],
    points: index.chapters.reduce((n, ch) => n + ch.points, 0) }, { x: 0, y: totalHeight / 2 - 16 }, { root: true })
  halves.forEach((trees, side) => {
    const left = side === 0, widths = []
    const collect = (tree, depth) => {
      widths[depth] = Math.max(widths[depth] || 0, tree.size.width)
      tree.children.forEach(child => collect(child, depth + 1))
    }
    trees.forEach(t => collect(t, 1))
    const place = (tree, depth, top) => {
      const offset = depth * 40 + widths.slice(1, depth).reduce((n, w) => n + w, 0)
      const node = addNode(tree.entry, {
        x: left ? -offset - tree.size.width : root.width + offset,
        y: top + (tree.span - tree.size.height) / 2,
      }, { left })
      let childTop = top + (tree.span - tree.childHeight) / 2
      for (const child of tree.children) {
        connect(node, place(child, depth + 1, childTop), left)
        childTop += child.span + 14
      }
      return node
    }
    let top = (totalHeight - heightOf(trees)) / 2
    for (const tree of trees) {
      connect(root, place(tree, 1, top), left)
      top += tree.span + 24
    }
  })
  return { nodes, edges }
}

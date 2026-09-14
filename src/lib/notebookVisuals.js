// 只接受图形数据，SVG 由 React 构造；不接收模型生成的标签、脚本或外部资源。
const short = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
export function validFormula(f) {
  return f == null || (short(f.expression, 500) && typeof f.condition === 'string' && f.condition.length <= 500 &&
    Array.isArray(f.symbols) && f.symbols.length <= 12 && f.symbols.every(s => short(s.symbol, 40) && short(s.meaning, 200)) &&
    (f.evidence === undefined || (typeof f.evidence === 'string' && f.evidence.length <= 12000)))
}
export function validDiagram(d) {
  if (d == null) return true
  if (!['flow', 'compare'].includes(d.kind) || !short(d.title, 60) || !Array.isArray(d.nodes) || d.nodes.length < 2 || d.nodes.length > 6 ||
    d.nodes.some(n => !n || !short(n.id, 30) || !short(n.label, 28) || (n.evidence !== undefined && (typeof n.evidence !== 'string' || n.evidence.length > 12000))) ||
    new Set(d.nodes.map(n => n.id)).size !== d.nodes.length || !Array.isArray(d.edges) || d.edges.length > 8) return false
  const ids = new Set(d.nodes.map(n => n.id))
  return d.edges.every(e => e && ids.has(e.from) && ids.has(e.to) && e.from !== e.to &&
    typeof e.label === 'string' && e.label.length <= 16 && (e.evidence === undefined || (typeof e.evidence === 'string' && e.evidence.length <= 12000))) &&
    (d.kind !== 'compare' || d.edges.length === 0)
}
export function visualFingerprint(note) {
  return JSON.stringify({ formula: note.formula ? { expression: note.formula.expression, condition: note.formula.condition, symbols: note.formula.symbols } : null,
    diagram: note.diagram ? { kind: note.diagram.kind, title: note.diagram.title, nodes: note.diagram.nodes.map(({ id, label }) => ({ id, label })), edges: note.diagram.edges.map(({ from, to, label }) => ({ from, to, label })) } : null })
}

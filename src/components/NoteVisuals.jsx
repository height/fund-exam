import { useId } from 'react'
import { validDiagram, validFormula } from '../lib/notebookVisuals'

const lines = (text, size) => Array.from(text).reduce((all, ch, i) => {
  if (i % size === 0) all.push('')
  all[all.length - 1] += ch
  return all
}, [])

export default function NoteVisuals({ note }) {
  return <>
    {note.formula && validFormula(note.formula) && <figure className="nb-formula" aria-label="笔记公式">
      <div className="nb-formula-expression">{note.formula.expression}</div>
      {note.formula.symbols.length > 0 && <dl>{note.formula.symbols.map((s, i) => <div key={i}><dt>{s.symbol}</dt><dd>{s.meaning}</dd></div>)}</dl>}
      {note.formula.condition && <figcaption><b>适用条件：</b>{note.formula.condition}</figcaption>}
    </figure>}
    {note.diagram && validDiagram(note.diagram) && <Diagram diagram={note.diagram} />}
  </>
}

function Diagram({ diagram }) {
  const id = useId().replaceAll(':', '')
  const compare = diagram.kind === 'compare'
  const height = compare ? Math.ceil(diagram.nodes.length / 2) * 92 + 8 : diagram.nodes.length * 104 - 24
  const positions = diagram.nodes.map((n, i) => ({ ...n, x: compare ? 4 + (i % 2) * 160 : 48, y: 8 + (compare ? Math.floor(i / 2) * 92 : i * 104), width: compare ? 152 : 224 }))
  return <figure className="nb-diagram"><figcaption>{diagram.title}</figcaption>
    <svg viewBox={`0 0 320 ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{diagram.title}</title><desc id={`${id}-desc`}>{compare ? positions.map(n => n.label).join('；') : diagram.edges.map(e => `${positions.find(n => n.id === e.from).label} → ${positions.find(n => n.id === e.to).label}${e.label ? `：${e.label}` : ''}`).join('；')}</desc>
      <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="var(--accent-ink)" strokeWidth="1.5" /></marker></defs>
      {diagram.edges.map((edge, i) => {
        const from = positions.find(n => n.id === edge.from), to = positions.find(n => n.id === edge.to)
        const adjacent = positions.indexOf(to) === positions.indexOf(from) + 1
        const x = from.x + from.width / 2, y = from.y + 60, end = to.y
        const lane = 284 + (i % 3) * 10
        const d = adjacent ? `M ${x} ${y} L ${x} ${end - 4}` : `M ${from.x + from.width} ${from.y + 30} H ${lane} V ${to.y + 30} H ${to.x + to.width + 4}`
        return <g key={i}><path d={d} fill="none" stroke="var(--accent-ink)" strokeWidth="1.5" markerEnd={`url(#${id}-arrow)`} />
          {edge.label && adjacent && <text x={x + 8} y={(y + end) / 2 + 4} fontSize="11" fill="var(--ink2)">{lines(edge.label, 10).map((line, j, all) => <tspan key={j} x={x + 8} y={(y + end) / 2 + 4 - (all.length - 1) * 6 + j * 12}>{line}</tspan>)}</text>}</g>
      })}
      {positions.map(n => <g key={n.id}><rect x={n.x} y={n.y} width={n.width} height={60} rx="8" fill="var(--sheet2)" stroke="var(--rule)" />
        <text x={n.x + n.width / 2} textAnchor="middle" fontSize="13" fill="var(--ink)">{lines(n.label, compare ? 10 : 16).map((line, i, all) => <tspan key={i} x={n.x + n.width / 2} y={n.y + 35 - (all.length - 1) * 9 + i * 18}>{line}</tspan>)}</text>
      </g>)}
    </svg>
    {diagram.edges.some(e => e.label && positions.findIndex(n => n.id === e.to) !== positions.findIndex(n => n.id === e.from) + 1) && <ul className="nb-diagram-relations">{diagram.edges.filter(e => e.label && positions.findIndex(n => n.id === e.to) !== positions.findIndex(n => n.id === e.from) + 1).map((e, i) => <li key={i}>{positions.find(n => n.id === e.from).label} → {positions.find(n => n.id === e.to).label}：{e.label}</li>)}</ul>}
  </figure>
}


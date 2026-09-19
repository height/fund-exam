import { STUDY_PENS } from '../lib/studyNotes'
import NoteMarkdown from './NoteMarkdown'
import KnowledgeDiagram from './KnowledgeDiagram'

const Markdown = ({ text }) => <NoteMarkdown note={{ markdown: text }} />

export default function StudyNotes({ review, study }) {
  if (study) return <article className="kg-sprint kg-distilled" aria-label="浓缩学习要点">
    <p className="kg-intuition"><span>先理解</span>{study.intuition}</p>
    <section className="kg-core-copy" aria-label="核心判断"><Markdown text={study.markdown} /></section>
    {study.formula && <section className="kg-formula-block" aria-label="公式与符号"><h3>把关系写成公式</h3><Markdown text={study.formula} /><p className="kg-symbols">{study.symbols}</p></section>}
    {study.condition && <p className="kg-boundary"><strong>条件</strong>{study.condition}</p>}
    {study.diagram && <KnowledgeDiagram kind={study.diagram} />}
    <p className="kg-caution"><strong>易错</strong>{study.caution}</p>
    {study.example && <details className="kg-mini-example"><summary>用一个小例子验算</summary><p>{study.example}</p></details>}
  </article>
  return <article className="kg-sprint" aria-label="冲刺学习要点">
    {STUDY_PENS.map(pen => <section key={pen.key} className={`kg-note-group kg-pen-${pen.key}`} aria-label={pen.label}>
      <h3>{pen.label}<small>{pen.color}</small></h3>
      <ol>{review[pen.key].map((text, i) => <li key={i}>{text}</li>)}</ol>
    </section>)}
  </article>
}

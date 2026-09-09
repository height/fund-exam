import { STUDY_PENS } from '../lib/studyNotes'

export default function StudyNotes({ review }) {
  return <article className="kg-sprint" aria-label="冲刺学习要点">
    {STUDY_PENS.map(pen => <section key={pen.key} className={`kg-note-group kg-pen-${pen.key}`} aria-label={pen.label}>
      <h3>{pen.label}<small>{pen.color}</small></h3>
      <ol>{review[pen.key].map((text, i) => <li key={i}>{text}</li>)}</ol>
    </section>)}
  </article>
}

export default function NoteKnowledge({ note }) {
  return <>
    {note?.evidenceKinds?.includes('common') && <p className="nb-note-meta">基础通识补充：部分常规定义、原理或公式由 AI 补全，未作为原文引用。</p>}
    {note?.knowledgeRefs?.map(ref => <details className="provided-source" key={`${ref.subject}:${ref.id}`}>
      <summary>图谱 · {ref.title}</summary>
      <p className="nb-note-meta">{ref.subject} · {ref.chapter}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{ref.text}</p>
    </details>)}
  </>
}

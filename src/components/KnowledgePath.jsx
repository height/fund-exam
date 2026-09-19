import { useEffect, useRef } from 'react'

export default function KnowledgePath({ path, index, chapterIndex, onChapter, onSelect }) {
  const active = useRef(null)
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }) }, [chapterIndex])
  return <div className="kg-learning-path" aria-label="原理学习主线">
    <header className="kg-path-intro"><h3>{path.thesis}</h3><p>{path.intro}</p><small>按理解顺序串联 · 章节编号与练习保持一致</small></header>
    {path.groups.map((group, i) => <section className="kg-path-stage" key={group.title}>
      <div className="kg-path-stage-heading"><span>{i + 1}</span><div><h3>{group.title}</h3><p>{group.question}</p></div></div>
      <p className="kg-path-mechanism">{group.mechanism}</p>
      {group.chapters.map(no => {
        const chapter = index.chapters[no - 1], expanded = chapterIndex === no - 1
        return <div className="kg-path-chapter" key={chapter.id}>
          <button ref={expanded ? active : undefined} aria-expanded={expanded} onClick={() => onChapter(expanded ? null : no - 1)}>
            <span className="kg-path-no">第{no}章</span><span><strong>{chapter.t}</strong><small>{path.questions[no - 1]}</small></span><span>{expanded ? '−' : '+'}</span>
          </button>
          {expanded && <div className="kg-path-leaves">{chapter.children.map(id => {
            const section = index.byId.get(id)
            return <section key={id}><h4>{section.t}</h4>{section.children.map(leafId => {
              const leaf = index.byId.get(leafId)
              return <button key={leafId} onClick={() => onSelect(leaf)}><strong>{leaf.t}</strong><span>{leaf.study?.intuition || leaf.d}</span></button>
            })}</section>
          })}</div>}
        </div>
      })}
    </section>)}
  </div>
}

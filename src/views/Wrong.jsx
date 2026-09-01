import { Icon, Options, Speaker, SubjectSeg } from '../components/ui'
import { mdToSpeech } from '../lib/ai'
import { track } from '../lib/analytics'
import { bySubject } from '../lib/bank'
import { ExplainBody, Plain, Stem } from '../lib/format'
import { useStore } from '../lib/store'

export default function Wrong({ go }) {
  const { records, subject, patchRecord } = useStore()

  const all = bySubject(subject)
    .filter(q => records[q.id]?.wrongFlag)
    .sort((a, b) => (records[b.id].lastTs || 0) - (records[a.id].lastTs || 0))
  const byCh = {}
  all.forEach(q => (byCh[q.chapter] = (byCh[q.chapter] || 0) + 1))

  return (
    <>
      <div>
        <h1>错题本</h1>
        <div className="muted">答错自动收进来，再答对自动移出去</div>
      </div>
      <SubjectSeg />

      <div className="card">
        <div className="row between">
          <span><b className="num" style={{ fontSize: 22 }}>{all.length}</b> 道待消灭</span>
          <button className="btn-pri btn-sm" disabled={!all.length}
            onClick={() => go('practice', { scope: 'wrong', order: 'seq' })}><Icon name="wrong" /> 错题重练</button>
        </div>
        {Object.keys(byCh).length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(byCh).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <span className="chip" key={c}>{c} {n}</span>
            ))}
          </div>
        )}
      </div>

      {all.length ? all.map(q => (
        <div className="card" key={q.id}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="chip">{q.chapter}</span>
            <span className="chip alert">错 {records[q.id].wrong} 次</span>
          </div>
          <Stem text={q.q} style={{ fontSize: 16 }} />
          <details>
            <summary className="chip">看答案解析 ▾</summary>
            <div style={{ marginTop: 10 }}><Options q={q} reveal /></div>
            <div className="explain" style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
                <Speaker getText={() => mdToSpeech(
                  `正确答案 ${'ABCD'[q.answer]}。${q.explain || '本题暂无解析'}`
                )} label="朗读答案解析" />
              </div>
              <ExplainBody text={q.explain} />
              <Plain id={q.id} />
            </div>
          </details>
          <button className="btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              patchRecord(q.id, { wrongFlag: false })
              track('wrong_question_mastered', { subject })
            }}><Icon name="done" /> 标记已掌握</button>
        </div>
      )) : (
        <div className="card">
          <div className="empty">
            <div><b>这一科还没有错题</b>答错的题会自动收进来，答对再自动移出。</div>
            <button className="btn-sm" onClick={() => go('practice')}>去练习</button>
          </div>
        </div>
      )}
    </>
  )
}

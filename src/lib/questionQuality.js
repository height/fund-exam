// 题面修订不意味着考生答错；旧版作答单独留存，不能混入新版掌握度。
export function staleQuestion(q, revision = 0) {
  return !!q?.materialReview?.invalidatesPriorRecords && revision < q.contentRevision
}
export function reconcileRecord(record, q) {
  if (!staleQuestion(q, record.contentRevision)) return record
  return {
    qid: record.qid, subject: record.subject, contentRevision: q.contentRevision,
    seen: 0, right: 0, wrong: 0, wrongFlag: false, lastTs: 0,
    superseded: [...(record.superseded || []), { ...record, superseded: undefined }],
    correctionReason: '原题缺少材料，旧版作答已作废并留存备份；请按完整题面重做。',
  }
}
export function reconcileExam(exam, lookup) {
  const invalid = exam.ids.filter(id => staleQuestion(lookup(id), exam.questionRevisions?.[id]))
  if (!invalid.length) return exam
  const ids = exam.ids.filter(id => !invalid.includes(id))
  const answers = Object.fromEntries(Object.entries(exam.answers).filter(([id]) => ids.includes(id)))
  const revisions = Object.fromEntries(ids.map(id => [id, lookup(id)?.contentRevision || 0]))
  const next = { ...exam, ids, answers, questionRevisions: revisions,
    i: Math.max(0, Math.min(exam.i || 0, ids.length - 1)),
    superseded: [...(exam.superseded || []), { ...exam, superseded: undefined }],
    voidedQuestionIds: [...new Set([...(exam.voidedQuestionIds || []), ...invalid])],
  }
  if ('score' in exam) {
    next.total = ids.length
    next.right = ids.filter(id => answers[id] === lookup(id)?.answer).length
    next.score = ids.length ? Math.round(next.right / ids.length * 100) : null
  }
  return next
}

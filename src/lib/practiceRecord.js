// Old records have counts but no selected option. Never invent a historical answer.
export function latestPick(question, record) {
  const picked = record?.lastPicked
  return record?.seen > 0 && Number.isInteger(picked) && picked >= 0 && picked < question.options.length
    ? picked : undefined
}

export function latestCorrect(record) {
  if (!record?.seen) return null
  if (typeof record.lastCorrect === 'boolean') return record.lastCorrect
  if (!record.wrong && record.right > 0) return true
  if (!record.right && record.wrong > 0) return false
  // Legacy mixed history cannot distinguish a correct retry from manual removal.
  if (record.wrongFlag === true) return false
  return null
}

export function answeredRecord(question, previous, picked, now = Date.now()) {
  const correct = picked === question.answer
  const old = previous || { seen: 0, right: 0, wrong: 0 }
  return { ...old, qid: question.id, subject: question.subject, contentRevision: question.contentRevision || 0,
    seen: old.seen + 1, right: old.right + Number(correct), wrong: old.wrong + Number(!correct),
    wrongFlag: !correct, lastPicked: picked, lastCorrect: correct, lastTs: now }
}

export function latestChapterScore(questions, records) {
  let done = 0, assessed = 0, correct = 0
  for (const question of questions) {
    const record = records[question.id]
    if (!record?.seen) continue
    done++
    const result = latestCorrect(record)
    if (result !== null) { assessed++; correct += Number(result) }
  }
  return { done, assessed, correct }
}

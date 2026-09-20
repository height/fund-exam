export function practiceQuestionStatus(question, record, picked) {
  if (picked !== undefined) return picked === question.answer
    ? { tone: 'r', label: '本轮答对' } : { tone: 'w', label: '本轮答错' }
  if (!record?.seen) return { tone: '', label: '未做' }
  // A wrong-book flag can be manually removed; use actual answer counts for history.
  if (record.wrong > 0) return { tone: 'w', label: '曾答错' }
  if (record.right > 0) return { tone: 'r', label: '曾答对' }
  return { tone: 'done', label: '已做' }
}

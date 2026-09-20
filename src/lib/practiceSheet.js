import { latestCorrect } from './practiceRecord.js'

export function practiceQuestionStatus(question, record, picked) {
  if (picked !== undefined) return picked === question.answer
    ? { tone: 'r', label: '本轮答对' } : { tone: 'w', label: '本轮答错' }
  if (!record?.seen) return { tone: '', label: '未做' }
  const correct = latestCorrect(record)
  if (correct === true) return { tone: 'r', label: '最近答对' }
  if (correct === false) return { tone: 'w', label: '最近答错' }
  return { tone: 'done', label: '已做，待重做确认' }
}

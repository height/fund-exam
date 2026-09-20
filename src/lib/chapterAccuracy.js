export const MIN_CHAPTER_QUESTIONS = 10

// Each question contributes only its latest known result; repeat attempts replace that result.
export function chapterAccuracy({ total, done, assessed, correct }) {
  if (!total) return { tone: 'pending', percent: null, label: '暂无题目' }
  if (assessed < MIN_CHAPTER_QUESTIONS || !assessed) {
    const label = !done ? '尚未开始' : total < MIN_CHAPTER_QUESTIONS
      ? '待评估 · 本章题量不足 10 题'
      : `待评估 · 再${done > assessed ? '确认' : '做'} ${MIN_CHAPTER_QUESTIONS - assessed} 题可评估`
    return { tone: 'pending', percent: null, label }
  }
  // Truncate rather than round up across a qualification threshold.
  const percent = Math.min(100, Math.max(0, Math.floor(correct / assessed * 100)))
  const tone = percent >= 90 ? 'excellent' : percent >= 80 ? 'good'
    : percent >= 70 ? 'steady' : percent >= 60 ? 'pass' : 'weak'
  return { tone, percent, label: `正确率 ${percent}%${percent < 60 ? ' · 待加强' : ''}` }
}

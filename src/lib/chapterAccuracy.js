export const MIN_CHAPTER_QUESTIONS = 10

// done counts distinct questions; seen/hit count all attempts, as in existing statistics.
export function chapterAccuracy({ total, done, seen, hit }) {
  if (!total) return { tone: 'pending', percent: null, label: '暂无题目' }
  if (done < MIN_CHAPTER_QUESTIONS || !seen) {
    const label = !done ? '尚未开始' : total < MIN_CHAPTER_QUESTIONS
      ? '待评估 · 本章题量不足 10 题'
      : `待评估 · 再做 ${MIN_CHAPTER_QUESTIONS - done} 题可评估`
    return { tone: 'pending', percent: null, label }
  }
  // Truncate rather than round up across a qualification threshold.
  const percent = Math.min(100, Math.max(0, Math.floor(hit / seen * 100)))
  const tone = percent >= 90 ? 'excellent' : percent >= 80 ? 'good'
    : percent >= 70 ? 'steady' : percent >= 60 ? 'pass' : 'weak'
  return { tone, percent, label: `正确率 ${percent}%${percent < 60 ? ' · 待加强' : ''}` }
}

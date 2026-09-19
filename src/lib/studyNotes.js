export const STUDY_PENS = [
  { key: 'core', label: '讲义要点', color: '蓝笔' },
  { key: 'trap', label: '易混易错', color: '红笔' },
  { key: 'extra', label: '理解补充', color: '正文' },
]

export function distilledStudyText(study) {
  return ['intuition', 'markdown', 'formula', 'symbols', 'condition', 'caution', 'example']
    .map(key => study?.[key]).filter(Boolean).join('\n\n')
}

// Reading aloud follows the same order as the note, without toolbar copy.
export function studyNoteSpeech(entry) {
  if (entry.study) return `${entry.t}。\n${distilledStudyText(entry.study)}`
  return [entry.t, ...STUDY_PENS.flatMap(pen =>
    entry.review?.[pen.key]?.length ? [pen.label, ...entry.review[pen.key]] : []),
  ...(!entry.review && entry.d ? [entry.d] : [])].join('。\n')
}

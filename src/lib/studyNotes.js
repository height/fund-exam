export const STUDY_PENS = [
  { key: 'core', label: '核心必背', color: '红笔' },
  { key: 'trap', label: '易混易错', color: '蓝笔' },
  { key: 'extra', label: '理解速记', color: '绿笔' },
]

// Reading aloud follows the same order as the note, without toolbar copy.
export function studyNoteSpeech(entry) {
  return [entry.t, ...STUDY_PENS.flatMap(pen =>
    entry.review?.[pen.key]?.length ? [pen.label, ...entry.review[pen.key]] : []),
  ...(!entry.review && entry.d ? [entry.d] : [])].join('。\n')
}

// 展示保留两位小数；及格判断始终使用原始答对比例。
export const examScore = (right, total) => total > 0 ? Math.round(right / total * 10000) / 100 : null
export const examPassed = (exam, passLine = 60) => exam.total > 0 && exam.right * 100 >= exam.total * passLine

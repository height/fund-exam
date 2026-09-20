import test from 'node:test'
import assert from 'node:assert/strict'
import { examScore, examPassed } from '../src/lib/examScore.js'

test('67题真题卷答对40题不及格，41题及格；忽略历史四舍五入的60分', () => {
  assert.equal(examScore(40, 67), 59.7)
  assert.equal(examPassed({ right: 40, total: 67, score: 60 }), false)
  assert.equal(examPassed({ right: 41, total: 67 }), true)
})

test('96题卷、标准百题卷和作废试卷的及格边界', () => {
  for (const total of [96, 100]) {
    const minimum = Math.ceil(total * 0.6)
    assert.equal(examPassed({ right: minimum - 1, total }), false)
    assert.equal(examPassed({ right: minimum, total }), true)
  }
  assert.equal(examScore(0, 0), null)
  assert.equal(examPassed({ right: 0, total: 0 }), false)
  assert.equal(examPassed({ right: 59999, total: 100000 }), false)
})

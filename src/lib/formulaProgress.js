import { COURSE_UNITS, COURSE_VERSION, DIMENSIONS, courseUnit, courseQuestion, guidedQuestion } from '../data/formulaCourses.js'
import { judgeQuestion } from './formulaMath.js'

export const FORMULA_PROGRESS_KEY = 'formula-course-progress-v1'
export const REVIEW_DELAY = 24 * 60 * 60 * 1000
export const emptyProgress = () => ({ version: 1, units: {}, diagnostic: { answers: {}, completed: false, updatedAt: 0 } })
export const initialCursor = () => ({ step: 0, phase: 'lesson', dimension: 'relation', qid: null, input: '', updatedAt: 0 })
const validTime = n => Number.isFinite(n) && n >= 0
export const questionById = (unit, id) => courseQuestion(unit.id, id) || unit.steps.map((_, i) => guidedQuestion(unit, i)).find(q => q?.id === id)

export function normalizeProgress(raw) {
  const result = emptyProgress()
  if (!raw || raw.version !== 1) return result
  for (const unit of COURSE_UNITS) {
    const data = raw.units?.[unit.id]
    if (!data || data.version !== COURSE_VERSION) continue
    const events = new Map()
    for (const e of Array.isArray(data.events) ? data.events : []) {
      if (!e || typeof e.id !== 'string' || !questionById(unit, e.qid) || !validTime(e.at) || !['answer', 'hint', 'reveal'].includes(e.type)) continue
      if (e.type === 'answer' && (typeof e.input !== 'string' || !judgeQuestion(questionById(unit, e.qid), e.input).valid)) continue
      events.set(e.id, { id: e.id, qid: e.qid, at: e.at, type: e.type, input: typeof e.input === 'string' ? e.input : '' })
    }
    const c = data.cursor || {}
    const cursor = { ...initialCursor(),
      step: Number.isInteger(c.step) ? Math.min(Math.max(c.step, 0), unit.steps.length) : 0,
      phase: ['lesson', 'assessment', 'review'].includes(c.phase) ? c.phase : 'lesson',
      dimension: DIMENSIONS.includes(c.dimension) ? c.dimension : 'relation',
      qid: courseQuestion(unit.id, c.qid) ? c.qid : null,
      input: typeof c.input === 'string' ? c.input : '',
      updatedAt: validTime(c.updatedAt) ? c.updatedAt : 0,
    }
    result.units[unit.id] = { version: COURSE_VERSION, startedAt: validTime(data.startedAt) ? data.startedAt : 0, cursor, events: [...events.values()].sort((a, b) => a.at - b.at) }
  }
  if (raw.diagnostic && validTime(raw.diagnostic.updatedAt)) {
    const answers = Object.fromEntries(Object.entries(raw.diagnostic.answers || {}).filter(([key, value]) => ['percent', 'base', 'negative', 'power'].includes(key) && typeof value === 'string'))
    result.diagnostic = { answers, completed: raw.diagnostic.completed === true, updatedAt: raw.diagnostic.updatedAt }
  }
  return result
}

export function mergeProgress(local, incoming, overwrite = false) {
  const left = normalizeProgress(local), right = normalizeProgress(incoming)
  if (overwrite) return right
  const merged = { ...left, units: { ...left.units }, diagnostic: left.diagnostic.updatedAt > right.diagnostic.updatedAt ? left.diagnostic : right.diagnostic }
  for (const [id, data] of Object.entries(right.units)) {
    const old = left.units[id]
    if (!old) { merged.units[id] = data; continue }
    // Immutable evidence IDs make import idempotent, including answers copied across devices.
    const events = new Map(old.events.map(e => [e.id, e]))
    for (const event of data.events) if (!events.has(event.id)) events.set(event.id, event)
    merged.units[id] = { ...old, cursor: old.cursor.updatedAt > data.cursor.updatedAt ? old.cursor : data.cursor,
      startedAt: Math.min(old.startedAt, data.startedAt), events: [...events.values()] }
  }
  return normalizeProgress(merged)
}

export function evidenceFor(unit, progress, now = Date.now()) {
  const data = progress.units?.[unit.id]
  const events = data?.events || []
  const touched = new Set(), answered = new Set(), assisted = new Set()
  const passed = {}, reviewed = {}
  let reviewFailure = null
  for (const e of events) {
    const q = courseQuestion(unit.id, e.qid)
    if (!q) continue
    touched.add(e.qid)
    if (e.type !== 'answer') { assisted.add(e.qid); continue }
    // Only the very first response to a new item can be independent evidence.
    if (answered.has(e.qid)) continue
    answered.add(e.qid)
    const independent = !assisted.has(e.qid) && judgeQuestion(q, e.input).correct
    if (q.phase === 'assessment') {
      if (independent && passed[q.dimension] === undefined) passed[q.dimension] = e.at
    } else {
      const since = DIMENSIONS.every(d => passed[d] !== undefined) ? Math.max(...Object.values(passed)) : null
      if (since === null || e.at < since + REVIEW_DELAY) continue
      if (independent) reviewed[q.dimension] = e.at
      else {
        delete passed[q.dimension]
        for (const d of DIMENSIONS) delete reviewed[d]
        reviewFailure = q.dimension
      }
    }
  }
  const independentAt = DIMENSIONS.every(d => passed[d] !== undefined) ? Math.max(...Object.values(passed)) : null
  const consolidated = independentAt !== null && DIMENSIONS.every(d => reviewed[d] >= independentAt + REVIEW_DELAY)
  const dueAt = independentAt === null ? null : independentAt + REVIEW_DELAY
  const status = !data ? '未开始' : consolidated ? '已巩固' : independentAt === null ? '学习中' : now >= dueAt ? '待复习' : '能独立完成'
  return { status, passed, reviewed, touched, answered, independentAt, dueAt, consolidated, reviewFailure }
}

export function nextQuestion(unit, progress, phase, dimension) {
  const { touched } = evidenceFor(unit, progress)
  return unit.questions.find(q => q.phase === phase && q.dimension === dimension && !touched.has(q.id)) || null
}

export function formulaReducer(state, action) {
  if (action.type === 'load') return normalizeProgress(action.value)
  if (action.type === 'diagnostic') return { ...state, diagnostic: { ...state.diagnostic, ...action.patch, updatedAt: action.at } }
  const unit = courseUnit(action.unitId)
  if (!unit) return state
  const old = state.units[unit.id] || { version: COURSE_VERSION, startedAt: action.at, cursor: initialCursor(), events: [] }
  let data = old
  if (action.type === 'cursor') data = { ...old, cursor: { ...old.cursor, ...action.patch, updatedAt: action.at } }
  if (action.type === 'event' && !old.events.some(e => e.id === action.event.id)) data = { ...old, events: [...old.events, action.event] }
  return { ...state, units: { ...state.units, [unit.id]: data } }
}

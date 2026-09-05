// All rates are decimals. Rounding is a display/input concern, never an intermediate step.
export const roundTo = (n, digits = 2) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON * Math.max(1, Math.abs(n))) * 10 ** digits) / 10 ** digits
export const formatNumber = (n, digits = 2) => roundTo(n, digits).toLocaleString('zh-CN', { maximumFractionDigits: digits })
export const percent = n => `${formatNumber(n * 100)}%`

export function returnModel({ initial, final, income = 0 }) {
  if (!(initial > 0)) throw new Error('最初投入必须大于 0')
  const gain = final - initial + income
  return { initial, final, income, priceGain: final - initial, gain, rate: gain / initial }
}

export function timeModel({ principal, rate, periods }) {
  if (principal < 0 || rate <= -1 || !Number.isInteger(periods) || periods < 0) throw new Error('请检查本金、每期利率和期数')
  const rows = Array.from({ length: periods + 1 }, (_, period) => ({
    period, compound: principal * (1 + rate) ** period, simple: principal * (1 + rate * period),
  }))
  const final = rows[periods].compound
  return { principal, rate, periods, rows, final, interest: final - principal }
}

export function discountModel({ future, rate, periods }) {
  if (future < 0 || rate <= -1 || !Number.isInteger(periods) || periods < 0) throw new Error('请检查未来金额、每期利率和期数')
  const present = future / (1 + rate) ** periods
  return { ...timeModel({ principal: present, rate, periods }), future, present }
}

export function weightedModel({ weights, rates }) {
  if (weights.length !== rates.length || !weights.length || weights.some(w => w < 0) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error('权重必须非负，合计为 100%')
  const contributions = weights.map((w, i) => w * rates[i])
  return { weights, rates, contributions, rate: contributions.reduce((a, b) => a + b, 0) }
}

export function calculate(kind, values) {
  if (kind === 'return') return returnModel(values)
  if (kind === 'compound') return timeModel(values)
  if (kind === 'discount') return discountModel(values)
  return weightedModel(values)
}

// Tiny presentation tree: explicit semantics, no string parsing or arbitrary evaluation.
export const atom = (plain, symbol, value) => ({ type: 'atom', plain, symbol, value })
export const op = (sign, ...children) => ({ type: 'op', sign, children })
export const fraction = (top, bottom) => ({ type: 'fraction', top, bottom })
export const power = (base, exponent) => ({ type: 'power', base, exponent })
export const sum = terms => ({ type: 'sum', terms })

export function formulaFor(unit, values) {
  const m = calculate(unit.kind, values)
  if (unit.kind === 'return') {
    const gain = op('+', op('−', atom('卖出金额', 'P₁', m.final), atom('最初投入', 'P₀', m.initial)), atom('期间收入', 'D', m.income))
    return unit.id === 'return-amount' ? gain : fraction(gain, atom('最初投入', 'P₀', m.initial))
  }
  if (unit.kind === 'compound' || unit.kind === 'discount') {
    const growth = power(op('+', atom('原有的一份', '1', 1), atom('每期利率', 'r', m.rate)), atom('期数', 'n', m.periods))
    return unit.kind === 'compound' ? op('×', atom('最初本金', 'PV', m.principal), growth) : fraction(atom('未来金额', 'FV', m.future), growth)
  }
  return sum(m.weights.map((w, i) => op('×', atom(unit.kind === 'expectation' ? `结果 ${i + 1} 的概率` : `资产 ${i + 1} 的资金占比`, unit.kind === 'expectation' ? `p${i + 1}` : `w${i + 1}`, w), atom(`收益率 ${i + 1}`, `r${i + 1}`, m.rates[i]))))
}

export function parseNumeric(raw, unit) {
  let text = String(raw).trim().replace(/[０-９]/g, c => String(c.charCodeAt(0) - 65296)).replace(/％/g, '%').replace(/．/g, '.').replace(/[−－]/g, '-')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(text)) return null
  if (text.endsWith('%') && unit !== '%') return null
  text = text.replace(/%$/, '')
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export function judgeQuestion(question, input) {
  if (question.options) return { valid: input !== '', correct: String(input) === String(question.answer) }
  const n = parseNumeric(input, question.unit)
  if (n === null) return { valid: false, correct: false }
  const target = roundTo(question.answer, question.digits ?? 2)
  return { valid: true, correct: Math.abs(n - target) < 1e-7 }
}

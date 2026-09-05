import { calculate, formatNumber as f, percent } from '../lib/formulaMath.js'

export const COURSE_VERSION = 1
export const DIMENSIONS = ['relation', 'calculation', 'transfer']
export const DIMENSION_NAMES = { relation: '建立关系', calculation: '完成计算', transfer: '换情境迁移' }
export const COURSE_PATHS = [
  { id: 'returns', title: '赚了多少，赚得怎样', description: '先数清赚的钱，再找到公平的比较基准。', units: ['return-amount', 'return-rate'] },
  { id: 'time', title: '让钱沿时间走一遍', description: '向前逐期增长，向后还原今天的价值。', units: ['compound', 'discount'] },
  { id: 'weights', title: '每一份都算上它的分量', description: '从资金分配走到组合收益，再理解概率。', units: ['weights', 'expectation'] },
]

export const BRIDGES = [
  { id: 'percent', title: '百分数是一百份里的几份', question: '10% 写成小数是多少？', answer: '0.1', options: ['10', '0.1', '0.01'], explanation: '10% = 10 ÷ 100 = 0.1。求 200 元的 10%，就是 200 × 0.1 = 20 元。', followup: '20% 写成小数是多少？', followAnswer: '0.2', followOptions: ['20', '0.2', '0.02'] },
  { id: 'base', title: '先找“跟谁比”', question: '原来有 80 元，增加了 20 元。增长率应该用 20 除以谁？', answer: '80', options: ['100', '20', '80'], explanation: '问“比原来增加多少”，原来就是比较基准。20 ÷ 80 = 25%，不能用增加后的 100 作分母。', followup: '原来 50 元，现在 60 元。增长率的分母是多少？', followAnswer: '50', followOptions: ['60', '50', '10'] },
  { id: 'negative', title: '负号记录减少', question: '花 100 元买入，卖出只拿回 90 元，价差是多少元？', answer: '-10', options: ['10', '-10', '90'], explanation: '90 − 100 = −10。负号说的是亏损方向，亏了 10 元仍然是一个明确的结果。', followup: '花 80 元买入，卖出拿回 76 元，价差是多少元？', followAnswer: '-4', followOptions: ['4', '-4', '76'] },
  { id: 'power', title: '次方是把乘法缩写', question: '1.1² 表示哪一个计算？', answer: '1.1 × 1.1', options: ['1.1 × 2', '1.1 + 1.1', '1.1 × 1.1'], explanation: '1.1² = 1.1 × 1.1 = 1.21。上角的 2 记录重复乘了两次，并不是乘以 2。', followup: '1.2³ 表示哪一个计算？', followAnswer: '1.2 × 1.2 × 1.2', followOptions: ['1.2 × 3', '1.2 × 1.2 × 1.2', '1.2 + 3'] },
]

/** @typedef {Object} CourseUnit
 * @property {string} id Stable identity; history never uses array position.
 * @property {string[]} prerequisites Foundational skill IDs.
 * @property {string[]} objectives Observable capabilities.
 * @property {Object[]} steps Authored demonstrations / guided exercises.
 * @property {Object[]} questions Independent and delayed-review items.
 * @property {string[]} bankIds Manually checked subject-two questions.
 */
const definitions = [
  {
    id: 'return-amount', kind: 'return', title: '先分清本金与收益', subtitle: '拿回的钱里，哪些才是赚到的？', prerequisites: ['negative'], legacyIds: [33], bankIds: ['80caed111002'],
    objectives: ['区分本金与收益', '把价差和期间收入合起来', '识别亏损与分红抵亏'],
    scene: { initial: 100, final: 108, income: 2 },
    story: '花 100 元买入，卖出拿回 108 元，中间收到 2 元分红。先不背公式，我们把钱分清楚。',
    explanation: '卖出拿回的 108 元里，100 元是原来的本金，8 元才是价差收益。再加上单独收到的 2 元，总共赚 10 元。',
    check: '卖出金额低于买入金额时，价差是负数；期间收入仍要单独加上。',
    steps: [
      { title: '先看钱从哪里来', text: '本金是原来的钱。收益来自价格变化，也可能来自分红或利息。', action: 'observe' },
      { title: '先把本金拿掉', text: '只看买入和卖出，价差是多少元？', action: 'guided', field: 'priceGain', unit: '元', hint: '卖出 108 元，先减去原来投入的 100 元。' },
      { title: '把另一笔收入加回来', text: '再加上分红，持有期间一共赚了多少元？', action: 'guided', field: 'gain', unit: '元', hint: '价差收益加上单独收到的分红。' },
      { title: '把动作写成关系', text: '收益金额 = 卖出金额 − 最初投入 + 期间收入。看一遍中文、数字和字母，它们说的是同一件事。', action: 'formula' },
    ],
  },
  {
    id: 'return-rate', kind: 'return', title: '为收益找到比较基准', subtitle: '同样赚 10 元，为什么不一定一样好？', prerequisites: ['percent', 'base', 'negative'], legacyIds: [7, 33], bankIds: ['80caed111002'],
    objectives: ['以最初投入为分母', '完成百分数转换', '在新情境中计算持有期收益率'],
    scene: { initial: 100, final: 108, income: 2 },
    story: '第一笔投入 100 元，赚 10 元；第二笔投入 200 元，也赚 10 元。怎样公平比较？',
    explanation: '第一笔每投入 100 元赚 10 元，是 10%；第二笔每投入 100 元只赚 5 元，是 5%。要把收益放到各自最初投入的尺度上。',
    check: '收益率的正负与收益金额一致。0.1 与 10% 是同一个比例；在标着 % 的框里填 10。',
    steps: [
      { title: '同样赚 10 元，投入却不同', text: '对照两笔投入，比较每 100 元带回多少收益。', action: 'observe' },
      { title: '选对分母', text: '第一笔应该把 10 元收益除以哪个数量？', action: 'guided', options: ['最初投入的 100 元', '卖出的 108 元', '拿回的 110 元'], answer: '最初投入的 100 元', hint: '问投入赚得怎样，就与最初投入比。' },
      { title: '把比例写成百分数', text: '第一笔持有期收益率是多少？', action: 'guided', field: 'rate', unit: '%', hint: '10 ÷ 100 = 0.1 = 10%。此框填 10。' },
      { title: '换成教材里的字母', text: '分数线上是全部收益，线下是期初投入。字母只是给这些数量起了短名字。', action: 'formula' },
    ],
  },
  {
    id: 'compound', kind: 'compound', title: '每一期重新算本金', subtitle: '第二年的利息，为什么多了一点？', prerequisites: ['percent', 'power'], legacyIds: [9, 11, 12], bankIds: ['9c25a16d6816', '572e7cb191de', 'be672a362e76'],
    objectives: ['区分单利和复利', '逐期推算本息合计', '分清利息与终值'],
    scene: { principal: 100, rate: 0.1, periods: 2 },
    story: '本金 100 元，每年利率 10%，两年不取出，也不追加。第一年赚的利息，第二年也留在账户里。',
    explanation: '第 1 年：100 + 10 = 110。第 2 年：110 + 11 = 121。单利每年只按原来的 100 算利息，两年后是 120。',
    check: '利率与期数必须使用同一时间单位。年利率配年数。终值含本金，利息 = 终值 − 本金。',
    steps: [
      { title: '沿着年份走一遍', text: '对照账本，看看第二年开始时的本金变成了多少。', action: 'observe' },
      { title: '填第 1 年期末余额', text: '100 元增长 10% 后，余额是多少元？', action: 'guided', answer: 110, unit: '元', hint: '本金 100 元，再加上 100 × 10% 的利息。' },
      { title: '用新的本金算第 2 年', text: '第 2 年期末，本金和利息合计多少元？', action: 'guided', field: 'final', unit: '元', hint: '这次从 110 元出发，再乘 1.1。' },
      { title: '重复乘法可以缩写', text: '100 × 1.1 × 1.1 写作 100 × 1.1²。n 次方只是把 n 次相乘收起来。', action: 'formula' },
    ],
  },
  {
    id: 'discount', kind: 'discount', title: '把未来的钱还原到今天', subtitle: '先看它怎样长大，再反着走回来。', prerequisites: ['percent', 'power'], legacyIds: [9, 12, 18], bankIds: [],
    objectives: ['区分求现值和求终值', '用除法还原逐期增长', '用正向增长检查现值'],
    scene: { future: 121, rate: 0.1, periods: 2 },
    story: '两年后需要 121 元，假设每年按 10% 复利增长，今天应准备多少元？',
    explanation: '从未来反着走：121 ÷ 1.1 = 110，再 110 ÷ 1.1 = 100。用同一套增长规则，可以从今天算未来，也可以从未来还原今天。',
    check: '正利率下，未来同一笔正金额折回今天应更小。把现值再增长相同的期数，应回到题目给的未来金额。',
    steps: [
      { title: '终点已知，寻找起点', text: '时间轴右端是 121 元。现在要找左端今天的钱。', action: 'observe' },
      { title: '先退回一年', text: '121 元除以一次 1.1，退回一年前是多少元？', action: 'guided', answer: 110, unit: '元', hint: '向前乘 1.1，向后就除以 1.1。' },
      { title: '再退回今天', text: '再除以一次 1.1，今天应准备多少元？', action: 'guided', field: 'present', unit: '元', hint: '110 ÷ 1.1。最后用增长两年的结果来检查。' },
      { title: '一条关系，两个方向', text: '现值 = 未来金额 ÷ 增长倍数。不是减去两年的利率，而是逐期除回来。', action: 'formula' },
    ],
  },
  {
    id: 'weights', kind: 'weights', title: '先算各份收益，再合起来', subtitle: '钱分得不一样，收益率能直接平均吗？', prerequisites: ['percent', 'base'], legacyIds: [24], bankIds: ['f0c4d7b12698', 'c73a08b0b9e5'],
    objectives: ['从金额求资金权重', '由分项收益得到组合收益', '检查结果在分项收益率之间'],
    scene: { weights: [0.3, 0.7], rates: [0.1, 0.2] },
    story: '共有 100 元，30 元投向 A，收益率 10%；70 元投向 B，收益率 20%。先各算各的收益。',
    explanation: 'A 赚 30 × 10% = 3 元，B 赚 70 × 20% = 14 元。合计赚 17 元，除以总投入 100 元，组合收益率为 17%。',
    check: '本课不借钱、不卖空，权重非负且合计 100%。结果应在最低与最高收益率之间，更靠近资金占比较大的那一项。',
    steps: [
      { title: '把资金分成两份', text: '分配条的长短表示资金占比。试着调整 A 的份额，观察两部分的贡献。', action: 'observe' },
      { title: '先求 B 赚的钱', text: '回到原题，B 的 70 元按 20% 收益率，赚多少元？', action: 'guided', answer: 14, unit: '元', hint: '70 × 0.2。这里求金额，不是收益率。' },
      { title: '再看整体', text: '两部分合计后，组合收益率是多少？', action: 'guided', field: 'rate', unit: '%', hint: '(3 + 14) ÷ 100 = 17%。' },
      { title: '金额如何变成权重', text: '(30 × 10% + 70 × 20%) ÷ 100，等于 30% × 10% + 70% × 20%。', action: 'formula' },
    ],
  },
  {
    id: 'expectation', kind: 'expectation', title: '用发生的机会分配重量', subtitle: '期望是平均水平，不是保证会发生的结果。', prerequisites: ['percent', 'negative'], legacyIds: [14, 24], bankIds: [],
    objectives: ['区分资金权重与概率', '计算概率加权收益', '解释期望不等于承诺收益'],
    scene: { weights: [0.5, 0.5], rates: [0.1, -0.02] },
    story: '某项投资有一半机会赚 10%，另一半机会亏 2%。一次投资只会发生其中一种情况。',
    explanation: '把两种结果按机会分配重量：0.5 × 10% + 0.5 × (−2%) = 4%。4% 是按概率计算的平均水平，不保证这一次能赚 4%。',
    check: '所有可能情况互斥且完整，概率合计 100%。资金占比说的是钱投在哪，概率说的是结果发生的机会。',
    steps: [
      { title: '这次分配的是机会', text: '图中的 50% 表示发生机会，不表示拿一半钱去投资。', action: 'observe' },
      { title: '分清它代表什么', text: '这里的 50% 是什么？', action: 'guided', options: ['结果发生的概率', '投入的资金占比', '保证获得的收益率'], answer: '结果发生的概率', hint: '题目描述的是两种可能结果，而不是两个投资账户。' },
      { title: '亏损也要带着负号参加', text: '按概率加权后的期望收益率是多少？', action: 'guided', field: 'rate', unit: '%', hint: '0.5 × 10% + 0.5 × (−2%) = 5% − 1%。' },
      { title: '相同的加权动作，不同的含义', text: '每个可能结果乘自己的概率，再求和。Σ 表示把这些贡献加起来。', action: 'formula' },
    ],
  },
]

// Six disjoint numerical scenarios per unit: first three for assessment, last three for review.
const returns = [
  { initial: 200, final: 214, income: 6 }, { initial: 80, final: 72, income: 4 }, { initial: 500, final: 550, income: 10 },
  { initial: 300, final: 315, income: 9 }, { initial: 120, final: 102, income: 6 }, { initial: 400, final: 436, income: 4 },
]
const times = [
  { principal: 200, rate: 0.05, periods: 2 }, { principal: 500, rate: 0.02, periods: 3 }, { principal: 800, rate: 0, periods: 2 },
  { principal: 300, rate: 0.1, periods: 2 }, { principal: 600, rate: 0.05, periods: 3 }, { principal: 400, rate: 0.02, periods: 2 },
]
const allocations = [
  { weights: [0.4, 0.6], rates: [0.05, 0.1] }, { weights: [0.75, 0.25], rates: [0.08, -0.04] }, { weights: [0.2, 0.8], rates: [0, 0.15] },
  { weights: [0.6, 0.4], rates: [0.12, 0.02] }, { weights: [0.25, 0.75], rates: [-0.08, 0.04] }, { weights: [0.8, 0.2], rates: [0.05, 0.2] },
]

function scenario(unit, index, transfer = false) {
  if (unit.kind === 'return') {
    const v = returns[index]
    return transfer ? { initial: v.initial * 10, final: v.final * 10 + 10, income: v.income * 10 } : v
  }
  if (unit.kind === 'compound' || unit.kind === 'discount') {
    const v = { ...times[index], ...(transfer ? { principal: times[index].principal * 10, periods: times[index].periods + 1 } : {}) }
    return unit.kind === 'discount' ? { future: v.principal * (1 + v.rate) ** v.periods, rate: v.rate, periods: v.periods } : v
  }
  const v = allocations[index]
  return transfer ? { weights: [...v.weights].reverse(), rates: v.rates } : v
}

const numeric = (data, unit, field) => {
  const m = calculate(unit.kind, data)
  const answer = field === 'rate' ? m.rate * 100 : m[field]
  return { answer, field, unit: field === 'rate' ? '%' : '元', digits: 2 }
}

function relation(unit, i, values) {
  const m = calculate(unit.kind, values)
  const variants = {
    'return-amount': [
      { question: '要找这笔投资真正赚到的钱，应怎样列式？', options: ['卖出金额 + 期间收入', '卖出金额 − 最初投入 + 期间收入', '卖出金额 − 最初投入'], answer: '卖出金额 − 最初投入 + 期间收入', hint: '原来的本金不算赚到的钱，分红也不能遗漏。' },
      { question: '卖出金额低于投入，但收到分红。该怎样判断盈亏？', options: ['只要卖出价低就一定亏损', '只看分红金额', '先算负的价差，再加分红'], answer: '先算负的价差，再加分红', hint: '两项收益需要合在一起，才能知道总盈亏。' },
      { question: '收益金额和最后一共拿回的钱，有什么区别？', options: ['一共拿回的钱还包含最初投入', '两个数量完全相同', '收益金额一定大于拿回的钱'], answer: '一共拿回的钱还包含最初投入', hint: '取回自己的本金，并不表示又赚了一次本金。' },
    ],
    'return-rate': [
      { question: '计算持有期收益率，应选择哪种关系？', options: ['收益金额 ÷ 最初投入', '收益金额 ÷ 卖出金额', '拿回的总金额 ÷ 最初投入'], answer: '收益金额 ÷ 最初投入', hint: '分子只算赚到的钱，分母是最初投入。' },
      { question: `甲投入 ${f(m.initial || 100)} 元，乙投入 ${f((m.initial || 100) * 2)} 元，两人都赚 8 元。谁的收益率更高？`, options: ['甲', '乙', '一样高'], answer: '甲', hint: '同样的收益，较小的投入对应更高的收益比例。' },
      { question: '算式得到 0.12，在标着 % 的答案框应该填什么？', options: ['0.12', '12', '120'], answer: '12', hint: '0.12 = 12%。答案框的百分号已经写好了。' },
    ],
    compound: [
      { question: '复利计算下一期利息，应该以什么为基数？', options: ['最初本金，永远不变', '上一期末的全部余额', '只用上一期的利息'], answer: '上一期末的全部余额', hint: '上一期的利息留在账户里，也参与下一期增长。' },
      { question: '本金 100 元，年利率 10%，哪项正确比较了两年的单利和复利本息？', options: ['两者都是 120 元', '单利 120 元，复利 121 元', '单利 121 元，复利 120 元'], answer: '单利 120 元，复利 121 元', hint: '复利第二年的利息来自 110 元，而单利仍从 100 元计算。' },
      { question: '题目问“利息”，算出复利终值以后还要做什么？', options: ['直接把终值当利息', '再加上本金', '终值减去本金'], answer: '终值减去本金', hint: '终值中包含最初投入。把本金扣掉才是利息。' },
    ],
    discount: [
      { question: '已知未来金额，求今天的现值，应该选择哪个方向？', options: ['乘增长倍数', '除以增长倍数', '减去利率'], answer: '除以增长倍数', hint: '这是把向前的逐期乘法反过来做。' },
      { question: '正利率下，未来一笔正金额折回今天，现值应怎样？', options: ['比未来金额小', '比未来金额大', '一定相等'], answer: '比未来金额小', hint: '今天较小的一笔钱经过增长，才到达未来的金额。' },
      { question: '哪种做法能检查刚算出的现值？', options: ['把现值再按原利率增长原来的期数', '用现值减去年利率', '把期数与金额相加'], answer: '把现值再按原利率增长原来的期数', hint: '把还原出来的起点沿原路走到终点，应回到未来金额。' },
    ],
    weights: [
      { question: '两项资产投入金额不相等，组合收益率该怎样求？', options: ['把两个收益率直接相加', '按各自资金占比乘收益率，再相加', '无条件取两个收益率的平均数'], answer: '按各自资金占比乘收益率，再相加', hint: '先算每一部分赚的钱，再除以总投入。' },
      { question: 'A 投入 30 元，B 投入 70 元。A 的资金权重是哪项？', options: ['30 ÷ 70', '30 ÷ 100', '70 ÷ 100'], answer: '30 ÷ 100', hint: '权重是这一份占全部的多少。' },
      { question: '在不借钱、不卖空的本课情境中，组合收益率如何检查？', options: ['应在各项收益率的最小值与最大值之间', '一定高于所有资产', '一定等于所有收益率的和'], answer: '应在各项收益率的最小值与最大值之间', hint: '每部分权重非负，合计一整份。' },
    ],
    expectation: [
      { question: '“有 40% 的机会赚 5%”中，40% 表示什么？', options: ['投入资金的占比', '结果发生的概率', '保证的收益率'], answer: '结果发生的概率', hint: '机会描述结果会不会发生，不描述钱怎么分配。' },
      { question: '算出期望收益率为 4%，能否说这一次一定赚 4%？', options: ['能，这是承诺收益', '不能，这是按概率得到的平均水平', '能，只要计算没有出错'], answer: '不能，这是按概率得到的平均水平', hint: '单次结果和概率加权后的平均水平不是同一个概念。' },
      { question: '列出了所有互斥的可能结果，它们的概率应满足什么？', options: ['可以合计 150%', '只计获利的情况', '每项非负且合计 100%'], answer: '每项非负且合计 100%', hint: '所有可能结果要完整，亏损情况也需要计入。' },
    ],
  }
  return variants[unit.id][i % 3]
}

function calculationQuestion(unit, values, transfer, i) {
  const m = calculate(unit.kind, values)
  if (unit.kind === 'return') {
    const field = unit.id === 'return-amount' ? 'gain' : 'rate'
    const contexts = ['一笔股票投资', '一笔基金投资', '一笔债券投资']
    const question = `${transfer ? contexts[i % 3] : '一笔投资'}投入 ${f(m.initial)} 元，卖出收回 ${f(m.final)} 元，期间另收${transfer && i % 3 === 2 ? '利息' : '分红'} ${f(m.income)} 元。${field === 'gain' ? '总收益金额' : '持有期收益率'}是多少？不计其他费用。`
    return { question, ...numeric(values, unit, field), hint: '先把卖出金额减去投入，再加期间收入；求比例时，再与最初投入比较。', explanation: `收益 = ${f(m.final)} − ${f(m.initial)} + ${f(m.income)} = ${f(m.gain)} 元。${field === 'rate' ? `收益率 = ${f(m.gain)} ÷ ${f(m.initial)} = ${percent(m.rate)}。` : ''}`, errors: [
      { value: field === 'gain' ? m.priceGain : m.priceGain / m.initial * 100, text: '这个结果只算了价差。题目还有一笔单独收到的分红或利息。' },
      { value: field === 'gain' ? m.final + m.income : (m.final + m.income) / m.initial * 100, text: '这个结果包含了原来的本金。先区分拿回的钱与赚到的钱。' },
      ...(field === 'rate' ? [{ value: m.gain / m.final * 100, text: '这个结果以卖出金额作分母。这里要比较的是最初投入。' }, { value: m.rate, text: '你可能写了小数形式。这里的单位是 %，例如 0.1 应填 10。' }] : []),
    ] }
  }
  if (unit.kind === 'compound') {
    const field = transfer ? 'interest' : 'final'
    return { question: `${transfer ? '为一笔学习费用做准备，' : ''}本金 ${f(m.principal)} 元，年利率 ${percent(m.rate)}，按复利计息 ${m.periods} 年，不追加、不取出。${transfer ? '累计利息' : '到期本息合计'}是多少元？`, ...numeric(values, unit, field), hint: '每一年都乘一次 1 加年利率。题目问利息时，最后还要减去本金。', explanation: `${f(m.principal)} × (1 + ${percent(m.rate)})^${m.periods} = ${f(m.final)} 元。${transfer ? `扣除本金，利息为 ${f(m.interest)} 元。` : ''}`, errors: [
      { value: transfer ? m.rows[m.periods].simple - m.principal : m.rows[m.periods].simple, text: '这相当于一直按最初本金算利息，是单利。复利要用上一年期末余额。' },
      { value: transfer ? m.final : m.interest, text: '注意题目问的是利息还是本息合计：两者差一个本金。' },
    ] }
  }
  if (unit.kind === 'discount') {
    return { question: `${transfer ? '一笔零息债券到期只支付一笔钱：' : ''}${m.periods} 年后收到 ${Number(m.future.toFixed(8))} 元，年折现率 ${percent(m.rate)}，按年复利。今天的现值是多少元？`, ...numeric(values, unit, 'present'), hint: '从未来向今天，每退回一年除以一次 1 加年利率。', explanation: `${Number(m.future.toFixed(8))} ÷ (1 + ${percent(m.rate)})^${m.periods} = ${f(m.present)} 元。再向前增长相同期数可以核对。`, errors: [{ value: m.future * (1 + m.rate) ** m.periods, text: '你可能又向未来增长了一次。求现值应该沿时间轴向回走，用除法。' }] }
  }
  const probability = unit.kind === 'expectation'
  const parts = values.weights.map((w, n) => probability ? `${percent(w)} 的机会收益率为 ${percent(values.rates[n])}` : `${transfer ? '资产' : ''}${['A', 'B'][n]} 投入 ${f(w * (transfer ? 1000 : 100))} 元，收益率 ${percent(values.rates[n])}`)
  return { question: `${probability ? (transfer ? '另一项投资只有以下两种可能结果：' : '一项投资有两种互斥且完整的可能结果：') : '全部资金只投入以下两项：'}${parts.join('；')}。${probability ? '期望' : '组合'}收益率是多少？`, ...numeric(values, unit, 'rate'), hint: probability ? '每个结果乘自己的发生概率，亏损带负号，再加起来。' : '先求各部分收益金额，再除以总投入；等价于各权重乘各收益率后相加。', explanation: `${values.weights.map((w, n) => `${percent(w)} × (${percent(values.rates[n])})`).join(' + ')} = ${percent(m.rate)}。${probability ? '这是平均水平，不是保证收益。' : ''}`, errors: [{ value: (m.rates[0] + m.rates[1]) / 2 * 100, text: '这个结果把两部分当成同样重。请使用题目给出的占比或概率。' }] }
}

function buildQuestions(unit) {
  return ['assessment', 'review'].flatMap((phase, p) => DIMENSIONS.flatMap(dimension => Array.from({ length: 3 }, (_, i) => {
    const values = scenario(unit, p * 3 + i, dimension === 'transfer')
    // Review relations use a new concrete numerical scenario and an application of the relation.
    let item = dimension === 'relation' ? relation(unit, i, values) : calculationQuestion(unit, values, dimension === 'transfer', i)
    if (phase === 'review' && dimension === 'relation') {
      const calculated = calculationQuestion(unit, values, false, i)
      const m = calculate(unit.kind, values)
      const right = unit.kind === 'return' ? (unit.id === 'return-amount' ? `${f(m.final)} − ${f(m.initial)} + ${f(m.income)}` : `(${f(m.final)} − ${f(m.initial)} + ${f(m.income)}) ÷ ${f(m.initial)}`)
        : unit.kind === 'compound' ? `${f(m.principal)} × (1 + ${percent(m.rate)})^${m.periods}`
          : unit.kind === 'discount' ? `${Number(m.future.toFixed(8))} ÷ (1 + ${percent(m.rate)})^${m.periods}`
            : `${percent(m.weights[0])} × (${percent(m.rates[0])}) + ${percent(m.weights[1])} × (${percent(m.rates[1])})`
      const wrong = unit.kind === 'return' ? `${f(m.final)} + ${f(m.income)}` : unit.kind === 'compound' ? `${f(m.principal)} × (1 + ${percent(m.rate)} × ${m.periods})` : unit.kind === 'discount' ? `${Number(m.future.toFixed(8))} × (1 + ${percent(m.rate)})^${m.periods}` : `(${percent(m.rates[0])} + ${percent(m.rates[1])}) ÷ 2`
      item = { question: `${calculated.question}先选择列式。`, options: [right, wrong, '只看题目中最大的数字'], answer: right, hint: item.hint, explanation: calculated.explanation }
    }
    // Stable rotation avoids a constant answer position without changing item identity.
    if (item.options) {
      const shift = (i + p + unit.id.length) % item.options.length
      item.options = [...item.options.slice(shift), ...item.options.slice(0, shift)]
    }
    return { ...item, id: `${unit.id}:${phase}:${dimension}:${i + 1}`, phase, dimension, values, source: '教学自编题', explanation: item.explanation || item.hint }
  })))
}

export const COURSE_UNITS = definitions.map(unit => ({ ...unit, version: COURSE_VERSION, questions: buildQuestions(unit) }))
export const courseUnit = id => COURSE_UNITS.find(unit => unit.id === id)
export const courseQuestion = (unitId, questionId) => courseUnit(unitId)?.questions.find(q => q.id === questionId)

export function guidedQuestion(unit, stepIndex) {
  const step = unit.steps[stepIndex]
  if (!step || step.action !== 'guided') return null
  const model = calculate(unit.kind, unit.scene)
  return { ...step, id: `${unit.id}:guided:${stepIndex}`, phase: 'guided', question: step.text,
    answer: step.field ? model[step.field] * (step.unit === '%' ? 100 : 1) : step.answer,
    explanation: step.hint, digits: 2, source: '带练题',
  }
}

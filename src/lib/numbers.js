/*
 * 数字必背题集。
 *
 * 这里不维护第二份题库：从原题中挑出「正确项和干扰项都在考固定数字」的题，
 * 背题卡直接拿原题做线索，模拟练习也从同一批 id 抽题。题库更新后会自动跟进。
 *
 * 三类数字不进来：
 * 1. 公式攻坚已经收录的计算题；
 * 2. 案例把数据全给出、要求现场算结果的题；
 * 3. 正确项只是把题干里已经给出的数字再抄一遍，不需要记忆的题。
 */
import { BANK, CALC_IDS, shuffle } from './bank'

export const NUMBER_EXAM_N = 30

export const NUMBER_TYPES = [
  ['all', '全部'],
  ['ratio', '比例'],
  ['duration', '期限'],
  ['money', '金额'],
  ['year', '年份'],
  ['count', '数量'],
]

export const NUMBER_TYPE_LABEL = Object.fromEntries(NUMBER_TYPES)

const calcSet = new Set(CALC_IDS)
const sourcePrefix = /^【(?:18|19|20)\d{2}[^】]*】\s*/
const stripSource = text => text.replace(sourcePrefix, '').trim()

// 一项里只要有数字且带考试常见单位，就是数字候选；纯数字、分数、年份也算。
const hasMemoryNumber = text => {
  const s = stripSource(text)
  if (!/\d/.test(s)) return false
  return /%|％|年|月|日|天|小时|分钟|工作日|元|万|亿|家|人|名|只|个|次|份|倍|层级|项|种|笔|户|股|点|BP|基点/i.test(s)
    || /\d\s*[\/+—-]\s*\d/.test(s)
    || /^(?:18|19|20)\d{2}/.test(s)
    || /^\d+(?:\.\d+)?$/.test(s)
}

// 用于比较「答案里的数字是不是题干已经明说了」。保留单位，避免 20 元和 20 天混成一项。
export function numberParts(text) {
  const re = /(?:\d+(?:[.,]\d+)?(?:\s*[\/—-]\s*\d+(?:[.,]\d+)?)?\s*(?:%|％|个?工作日|年|个月|月|日|天|小时|分钟|万元|亿元|元|万|亿|家|人|名|只|个|次|份|倍|层级|项|种|笔|户|股|点|BP|基点)?)/gi
  return [...stripSource(text).matchAll(re)]
    .map(m => m[0].replace(/\s+/g, '').replace('％', '%').toLowerCase())
    .filter(Boolean)
}

/**
 * 题卡正面只遮数值、不遮单位：1年 → ?年，20个工作日 → ?个工作日，
 * 1998—2002年 → ?—?年。单位本来就是回忆线索，藏掉只会增加无意义难度。
 */
export function numberHints(text) {
  const raw = stripSource(text)
  const unitRe = /^(.*?)(%|个?工作日|年|个月|月|日|天|小时|分钟|万元|亿元|元|万|亿|家|人|名|只|个|次|份|倍|层级|项|种|笔|户|股|点|bp|基点)$/i
  const parts = numberParts(raw).map((p, i) => {
    let masked = p.replace(/\d+(?:[.,]\d+)?/g, '?')
    if (i === 0 && /T\s*\+\s*\d+/i.test(raw)) masked = `T+${masked}`
    if (i === 0 && /±\s*\d/.test(raw)) masked = `±${masked}`
    const split = masked.match(unitRe)
    return split ? { mask: split[1], unit: split[2] } : { mask: masked, unit: '' }
  })
  return parts.length ? parts : [{ mask: '?', unit: '' }]
}

function looksLikeCalculation(q) {
  if (calcSet.has(q.id)) return true
  const stem = stripSource(q.q)
  const data = numberParts(stem).length

  // 出现这些词时，数字通常是法规/制度本身的一部分；即使题干套了一个人物案例，
  // 考的仍是固定门槛，不应当被「某某 + 两个数字」的计算题规则误杀。
  const asksFixedRule = /根据.{0,8}规定|法规.{0,8}要求|基金法|不得|不低于|不超过|不少于|至少|最多|最低|最高|最长|最短|应当|开始实施|正式实施|发展阶段|层级|共有|分为|分类标准|募集期限|偿还期限|交割时间|上市条件|合格投资者|GIPS|涨跌停|回购期限|会计年度|所得税|信息披露|第一只|首只|最早/.test(stem)

  // 这些措辞描述的是「拿题干数据算一个新数」，而不是回忆法规阈值。
  const givesScenarioData = /假设|已知|若|下表|如下|净值|面值|市场价格|收益率|总资产|营业收入|付息|成交金额|投资组合|票面价值|销售收入|管理费率|成本/.test(stem)
  const asksComputedResult = /计算|用.+计算|则|求|是多少|最接近|得到|参考价|内在价值|年化|平均需要|总利润|净利润|市值|方差|标准差|速动比率|名义利率|远期利率|贴现因子|最大回撤|分位数|现金净变动|总收益|应提.{0,8}费|天数相差/.test(stem)
  if (!asksFixedRule && data >= 1 && givesScenarioData && asksComputedResult) return true

  // 材料表、行情表和参数案例即使没写「计算」二字，也是在读数或推导，不是背固定值。
  const dataExercise = /材料回答|根据以上表格|下表|如下表|如图所示|现金流量表|资产负债表|利润表|随机变量|概率分别|转换价格|转换比例|相关系数|久期|即期利率|麦考利久期|贝塔系数|β系数|历史模拟法|最大回撤|除权参考价/.test(stem)
  if (dataExercise) return true

  // 普通人物/公司案例给出两组以上数据，答案又不是法规阈值，仍属于现场推导。
  if (!asksFixedRule && data >= 2 && /某|小明|小张|小王|甲公司|A股票|企业|投资组合|投资者/.test(stem)) return true

  // 数字只是用来解释指标含义，不是教材要求硬记的固定值。
  if (/天数相差/.test(stem)) return true
  if (!asksFixedRule && /绝对收益目标|捕获率指标/.test(stem)) return true

  // 数字在题干和答案里完全相同、又没有阈值/时点限定时，通常只是案例复述。
  const answerNums = numberParts(q.options[q.answer])
  const stemNums = new Set(numberParts(stem))
  const repeatsGiven = answerNums.length && answerNums.every(n => stemNums.has(n))
  return repeatsGiven && !asksFixedRule
}

export function numberType(q) {
  const a = q.options[q.answer]
  if (/%|％|\d\s*\/\s*\d/.test(a)) return 'ratio'
  if (/(?:18|19|20)\d{2}/.test(a)) return 'year'
  if (/个?工作日|年|个月|月|日|天|小时|分钟/.test(a)) return 'duration'
  if (/万元|亿元|元|万|亿/.test(a)) return 'money'
  return 'count'
}

export function isNumberMemoryQuestion(q) {
  const answer = q.options[q.answer]
  return hasMemoryNumber(answer)
    && q.options.filter(hasMemoryNumber).length >= 2
    && !looksLikeCalculation(q)
}

// 题库虽然已经做过文本去重，这里再按「题干 + 正确项」兜一层，避免同一张卡重复出现。
const seen = new Set()
export const NUMBER_QUESTIONS = BANK.filter(q => {
  if (!isNumberMemoryQuestion(q)) return false
  const key = `${stripSource(q.q).replace(/\s+/g, '')}|${q.options[q.answer].replace(/\s+/g, '')}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

export const NUMBER_IDS = NUMBER_QUESTIONS.map(q => q.id)
const numberIdSet = new Set(NUMBER_IDS)

export const isNumberId = id => numberIdSet.has(id)

export function numberQuestions(subject) {
  return NUMBER_QUESTIONS.filter(q => q.subject === subject)
}

export function pickNumberExamSet(subject, onlyIds) {
  const allow = onlyIds?.length ? new Set(onlyIds) : null
  const pool = numberQuestions(subject).filter(q => !allow || allow.has(q.id))
  return shuffle(pool).slice(0, Math.min(NUMBER_EXAM_N, pool.length))
}

/** 数字型干扰项：题卡背面只摆真正会互相串台的项，纯文字干扰不占位置。 */
export function numberDistractors(q) {
  return q.options
    .map((text, i) => ({ text, i }))
    .filter(x => x.i !== q.answer && hasMemoryNumber(x.text))
}

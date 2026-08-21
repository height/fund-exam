/**
 * 表达式求值。手写词法分析 + 调度场，不用 eval——
 * eval 会被 CSP 拦（单文件 PWA 常部署在带 CSP 的环境），而且用户输入直接进 eval
 * 本身就不该出现在代码里。这里只认数字和 + - × ÷ ( ) √ ² %，跑不了任意代码。
 *
 * % 按「百分号」处理而不是取模：50% = 0.5。考场计算器都是这个语义。
 */

// 前缀的 √ 和负号优先级高于乘除，且右结合：√9+7 是 (√9)+7，2×-3 是 2×(-3)
const PREC = { '+': 1, '-': 1, '×': 2, '÷': 2, neg: 3, sqrt: 3 }
const RIGHT = new Set(['neg', 'sqrt'])

/** 切成 token：数字、运算符、括号、一元的 √、后缀的 ² 和 % */
function tokenize(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ') { i++; continue }
    if (/[\d.]/.test(c)) {
      let j = i
      while (j < src.length && /[\d.]/.test(src[j])) j++
      const text = src.slice(i, j)
      if ((text.match(/\./g) || []).length > 1) throw new Error('小数点太多')
      out.push({ t: 'num', v: Number(text) })
      i = j
      continue
    }
    if ('+-×÷()'.includes(c)) { out.push({ t: c }); i++; continue }
    if (c === '√') { out.push({ t: 'sqrt' }); i++; continue }
    if (c === '²') { out.push({ t: 'sq' }); i++; continue }
    if (c === '%') { out.push({ t: 'pct' }); i++; continue }
    throw new Error(`看不懂的符号 ${c}`)
  }
  return out
}

/** 中缀转后缀（调度场）。一元负号单独当成前缀运算符 neg，
    早先用「插入 0 再减」实现，碰上 2×-3 会把 × 先弹出来，算成 2×0-3 */
function toRPN(tokens) {
  const out = []
  const ops = []
  let prev = null
  const pushOp = op => {
    while (ops.length && ops[ops.length - 1].t !== '(') {
      const top = PREC[ops[ops.length - 1].t]
      if (top > PREC[op.t] || (top === PREC[op.t] && !RIGHT.has(op.t))) out.push(ops.pop())
      else break
    }
    ops.push(op)
  }
  for (const tk of tokens) {
    if (tk.t === 'num') { out.push(tk); prev = tk; continue }
    if (tk.t === 'sq' || tk.t === 'pct') { out.push(tk); prev = tk; continue }
    if (tk.t === 'sqrt') { pushOp(tk); prev = tk; continue }
    if (tk.t === '(') { ops.push(tk); prev = tk; continue }
    if (tk.t === ')') {
      while (ops.length && ops[ops.length - 1].t !== '(') out.push(ops.pop())
      if (!ops.length) throw new Error('括号不配对')
      ops.pop()
      prev = tk
      continue
    }
    // 开头、或紧跟运算符 / 左括号的 -，是负号不是减号
    const unary = tk.t === '-' && (!prev || prev.t === '(' || PREC[prev.t] !== undefined)
    pushOp(unary ? { t: 'neg' } : tk)
    prev = tk
  }
  while (ops.length) {
    const op = ops.pop()
    if (op.t === '(') throw new Error('括号不配对')
    out.push(op)
  }
  return out
}

function evalRPN(rpn) {
  const st = []
  for (const tk of rpn) {
    if (tk.t === 'num') { st.push(tk.v); continue }
    if (tk.t === 'sq') { st.push(st.pop() ** 2); continue }
    if (tk.t === 'pct') { st.push(st.pop() / 100); continue }
    if (tk.t === 'neg') { st.push(-st.pop()); continue }
    if (tk.t === 'sqrt') {
      const x = st.pop()
      if (x < 0) throw new Error('负数开不了平方')
      st.push(Math.sqrt(x))
      continue
    }
    const b = st.pop(), a = st.pop()
    if (a === undefined || b === undefined) throw new Error('算式不完整')
    if (tk.t === '÷' && b === 0) throw new Error('不能除以 0')
    st.push(tk.t === '+' ? a + b : tk.t === '-' ? a - b : tk.t === '×' ? a * b : a / b)
  }
  if (st.length !== 1) throw new Error('算式不完整')
  return st[0]
}

/** 结果格式化：去掉浮点毛刺（0.1+0.2），整数不带小数点，太大太小转科学计数 */
export function format(n) {
  if (!Number.isFinite(n)) throw new Error('结果不是有效数字')
  const r = Number(n.toPrecision(12))
  if (r !== 0 && (Math.abs(r) >= 1e12 || Math.abs(r) < 1e-9)) return r.toExponential(6)
  return String(r)
}

/** 求值，算不出来就抛错（调用方按「还没算完」处理，不弹提示） */
export function evaluate(src) {
  if (!src.trim()) throw new Error('空算式')
  return evalRPN(toRPN(tokenize(src)))
}

/** 边打边算：算得出就给结果，算不出返回 null，不打断输入 */
export function preview(src) {
  try {
    return format(evaluate(src))
  } catch {
    return null
  }
}

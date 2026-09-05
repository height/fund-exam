import { useState } from 'react'
import { calculate, formatNumber as f, percent, formulaFor } from '../../lib/formulaMath'

function MathNode({ node, mode }) {
  if (node.type === 'atom') return <span className="fc-math-atom" title={node.plain}>{mode === 'numeric' ? f(node.value, 8) : node[mode === 'plain' ? 'plain' : 'symbol']}</span>
  if (node.type === 'fraction') return <span className="fc-fraction"><span><MathNode node={node.top} mode={mode} /></span><span><MathNode node={node.bottom} mode={mode} /></span></span>
  if (node.type === 'power') return <span>(<MathNode node={node.base} mode={mode} />)<sup><MathNode node={node.exponent} mode={mode} /></sup></span>
  const children = node.type === 'sum' ? node.terms : node.children
  return <span>{node.type === 'sum' && mode === 'symbol' && <span title="Σ 表示将各项相加">Σ：</span>}{children.map((child, i) => <span key={i}>{i > 0 && <span className="fc-math-op">{node.sign || '+'}</span>}{child.type === 'op' && child.sign === '−' && node.sign === '+' ? <>(<MathNode node={child} mode={mode} />)</> : <MathNode node={child} mode={mode} />}</span>)}</span>
}

export function FormulaExpression({ unit }) {
  const [mode, setMode] = useState('plain')
  return <section className="fc-expression" aria-label="同一个关系的三种写法">
    <div className="fc-switch" role="group" aria-label="公式表示">
      {[['plain', '中文关系'], ['numeric', '代入数字'], ['symbol', '字母写法']].map(([id, title]) => <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{title}</button>)}
    </div>
    <div className="fc-math"><MathNode node={formulaFor(unit, unit.scene)} mode={mode} /></div>
    <p className="muted">比例在公式内用小数表示，例如 0.1 = 10%。</p>
    <details><summary>字母和数量怎么对应</summary><p>{unit.kind === 'return' ? 'P₀ 是最初投入，P₁ 是卖出金额，D 是期间单独收到的分红或利息。' : ['compound', 'discount'].includes(unit.kind) ? 'PV 是今天的本金或现值，FV 是未来的金额或终值，r 是每期利率，n 是期数。' : unit.kind === 'expectation' ? 'p 是结果发生的概率，r 是该结果的收益率，下标区分不同结果。Σ 表示把各项贡献相加。' : 'w 是资产占全部资金的比例，r 是该资产收益率，下标区分不同资产。Σ 表示把各项贡献相加。'}</p></details>
  </section>
}

function ValueBar({ label, value, scale, tone }) {
  return <div className="fc-value-row"><div><span>{label}</span><b>{f(value)} 元</b></div><div className="fc-value-track" aria-hidden="true"><span className={tone || ''} style={{ width: `${Math.min(100, Math.abs(value) / scale * 100)}%` }} /></div></div>
}

export default function FormulaScene({ unit, interactive = false }) {
  const [values, setValues] = useState(unit.scene)
  const m = calculate(unit.kind, values)
  const reset = () => setValues(unit.scene)
  return <section className="fc-scene" aria-label="数量图解">
    <div className="fc-scene-heading"><span>{JSON.stringify(values) === JSON.stringify(unit.scene) ? '把数量放在眼前' : '试验中的数量 · 下步回到原题'}</span>{interactive && <button className="btn-sm btn-ghost" onClick={reset}>还原原题</button>}</div>
    {unit.kind === 'return' ? <>
      <h2>本金回来，收益留下</h2>
      <ValueBar label="最初投入" value={m.initial} scale={Math.max(m.initial, m.final + m.income)} />
      <ValueBar label="卖出收回" value={m.final} scale={Math.max(m.initial, m.final + m.income)} />
      <div className="fc-cash-parts"><div><span>价差</span><strong className={m.priceGain < 0 ? 'fc-negative' : ''}>{f(m.priceGain)}<small>元</small></strong></div><span aria-hidden="true">+</span><div><span>期间收入</span><strong>{f(m.income)}<small>元</small></strong></div><span aria-hidden="true">=</span><div><span>总收益</span><strong className={m.gain < 0 ? 'fc-negative' : ''}>{f(m.gain)}<small>元</small></strong></div></div>
      {unit.id === 'return-rate' && <div className="fc-comparison"><p>同样赚 {f(m.gain)} 元</p><div><span>投入 {f(m.initial)} 元</span><b>{percent(m.rate)}</b></div><div><span>投入 {f(m.initial * 2)} 元</span><b>{percent(m.rate / 2)}</b></div></div>}
      {interactive && <label className="fc-slider">试一试：卖出金额 <output>{f(m.final)} 元</output><input aria-label="卖出金额" type="range" min="60" max="140" step="2" value={values.final} onChange={e => setValues({ ...values, final: Number(e.target.value) })} /><span>把卖出金额调低，观察价差的负号和分红的作用。</span></label>}
    </> : ['compound', 'discount'].includes(unit.kind) ? <>
      <h2>{unit.kind === 'discount' ? '从未来，走回今天' : '利息留下，下一年一起长大'}</h2>
      <div className="fc-time-flow" aria-label="时间轴">
        {m.rows.map(row => <div key={row.period}><span>{row.period === 0 ? '今天' : `第 ${row.period} 年末`}</span><strong>{f(row.compound)}</strong><small>元</small></div>)}
      </div>
      <p className="fc-operation">{unit.kind === 'discount' ? `向左，每退一年 ÷ ${f(1 + m.rate)} ←` : `向右，每过一年 × ${f(1 + m.rate)} →`}</p>
      <table><caption>逐期账本 · 单位：元</caption><thead><tr><th>时间</th><th>复利余额</th><th>单利余额</th></tr></thead><tbody>{m.rows.map(row => <tr key={row.period}><th>{row.period === 0 ? '今天' : `${row.period} 年末`}</th><td>{f(row.compound)}</td><td>{f(row.simple)}</td></tr>)}</tbody></table>
      {interactive && <label className="fc-slider">试一试：年利率 <output>{percent(m.rate)}</output><input aria-label="年利率" type="range" min="0" max="20" value={Math.round(values.rate * 100)} onChange={e => setValues({ ...values, rate: Number(e.target.value) / 100 })} /><span>{unit.kind === 'discount' ? '未来金额不变，观察今天需要准备的钱。' : '利率为 0 时，单利和复利会怎样？'}</span></label>}
    </> : <>
      <h2>{unit.kind === 'expectation' ? '每种可能，都带上它的机会' : '资金多的那份，分量也大'}</h2>
      <div className="fc-allocation" aria-label={`${unit.kind === 'expectation' ? '概率' : '资金'}分配：A ${percent(m.weights[0])}，B ${percent(m.weights[1])}`}>
        {m.weights.map((w, i) => <span key={i} style={{ flex: w }}>{w >= 0.15 && `${['A', 'B'][i]} ${percent(w)}`}</span>)}
      </div>
      <table><caption>{unit.kind === 'expectation' ? '概率加权，不代表保证收益' : '按总投入 100 元计算'}</caption><thead><tr><th>{unit.kind === 'expectation' ? '结果' : '资产'}</th><th>{unit.kind === 'expectation' ? '概率' : '资金占比'}</th><th>收益率</th><th>{unit.kind === 'expectation' ? '加权贡献' : '赚到的钱'}</th></tr></thead><tbody>{m.weights.map((w, i) => <tr key={i}><th>{['A', 'B'][i]}</th><td>{percent(w)}</td><td>{percent(m.rates[i])}</td><td>{unit.kind === 'expectation' ? `${f(m.contributions[i] * 100)} 个百分点` : `${f(m.contributions[i] * 100)} 元`}</td></tr>)}</tbody></table>
      <p className="fc-scene-result">{unit.kind === 'expectation' ? '期望收益率' : '组合收益率'} <strong>{percent(m.rate)}</strong></p>
      {interactive && <label className="fc-slider">试一试：A 的{unit.kind === 'expectation' ? '概率' : '资金占比'} <output>{percent(m.weights[0])}</output><input aria-label={unit.kind === 'expectation' ? 'A 的概率' : 'A 的资金占比'} type="range" min="0" max="100" step="5" value={Math.round(m.weights[0] * 100)} onChange={e => { const w = Number(e.target.value) / 100; setValues({ ...values, weights: [w, 1 - w] }) }} /><span>B 自动取剩下的份额，始终合计 100%。</span></label>}
    </>}
    <p className="fc-scene-note">{unit.check}</p>
  </section>
}

import { useId } from 'react'

const flows = {
  roles: { title: '三方分工', labels: ['持有人 · 出资与承担风险', '管理人 · 投资决策与运作', '托管人 · 保管、复核与监督'], desc: '三方围绕独立的基金财产分工；托管人监督投资运作，不替代管理人决策。' },
  separation: { title: '财产隔离', labels: ['管理人固有财产', '基金财产 · 独立账本', '托管人固有财产'], desc: '三份财产独立管理，基金财产不为管理人、托管人的固有债务抵销。' },
  launch: { title: '从募集到生效', labels: ['申请注册 → 发售募集', '满足条件 → 验资备案', '合同生效 → 按合同运作'], desc: '完成前一环节，不自动等于完成后一环节。' },
  investment: { title: '决策与执行分离', labels: ['研究支持 · 投委会总体决策', '投资部门 · 构建组合', '交易部门 · 审核、执行、反馈'], desc: '投资决定与下单执行分别承担职责，交易结果反馈到管理过程。' },
  liquidity: { title: '流动性风险的传导', labels: ['赎回增加 · 需要更多现金', '折价卖出 · 资产变现承压', '净值下跌 · 可能引发更多赎回'], desc: '流动性压力可能形成循环，图示不是每次赎回的必然结果。' },
}

export default function KnowledgeDiagram({ kind }) {
  const id = useId().replaceAll(':', ''), flow = flows[kind]
  const title = flow?.title || (kind === 'duration' ? '价格与收益率反向变化' : 'CML与SML：先看横轴')
  const desc = flow?.desc || (kind === 'duration' ? '固定现金流债券：收益率上升，贴现值下降；曲线与久期切线仅作示意。' : '资本市场线使用总波动标准差，只描述有效组合；证券市场线使用贝塔，为证券和组合给出均衡要求收益。')
  return <figure className="kg-concept-diagram">
    <svg viewBox={`0 0 340 ${flow ? 218 : kind === 'duration' ? 220 : 340}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{title}</title><desc id={`${id}-desc`}>{desc}</desc>
      <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
      {flow ? <>
        {flow.labels.map((label, i) => <g key={label}>
          <rect x="24" y={12 + i * 72} width="292" height="46" rx="7" />
          <text x="170" y={41 + i * 72} textAnchor="middle">{label}</text>
          {i < 2 && (kind === 'separation' ? <text x="170" y={77 + i * 72} textAnchor="middle" className="kg-svg-condition">隔离</text>
            : kind === 'roles' ? <path d={`M 170 ${59 + i * 72} v 22`} strokeDasharray="3 3" />
              : <path d={`M 170 ${59 + i * 72} v 20`} markerEnd={`url(#${id}-arrow)`} />)}
        </g>)}
      </> : kind === 'duration' ? <>
        <path d="M 46 25 V 178 H 310" /><text x="15" y="19">价格 P</text><text x="236" y="203">收益率 y →</text>
        <path d="M 70 42 Q 145 140 296 153" className="kg-svg-curve" />
        <path d="M 103 89 L 264 166" strokeDasharray="5 5" />
        <circle cx="180" cy="126" r="4" /><text x="202" y="85">曲线：实际关系</text><text x="190" y="105">虚线：久期近似</text>
      </> : <>
        {[{ y: 0, name: 'CML · 有效组合', axis: '总波动 σ', slope: '斜率：市场夏普比率' }, { y: 166, name: 'SML · 证券与组合', axis: '系统性风险 β', slope: '斜率：市场风险溢价' }].map(line => <g key={line.name} transform={`translate(0 ${line.y})`}>
          <text x="20" y="18" className="kg-svg-heading">{line.name}</text>
          <path d="M 54 39 V 128 H 315" />
          <path d="M 54 109 L 280 46" className="kg-svg-curve" />
          <text x="20" y="112">Rƒ</text><text x="20" y="37">E(R)</text><text x="214" y="149">{line.axis}</text>
          <text x="109" y="123">{line.slope}</text>
        </g>)}
      </>}
    </svg>
    <figcaption>{title} · {desc}{!flow && ' 示意图，无实测数据。'}</figcaption>
  </figure>
}

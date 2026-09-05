import { Icon, PageHeader } from '../components/ui'
import { TL_N } from '../data/timeline'

const TOOLS = [
  { v: 'timeline', icon: 'timeline', t: '发展时间线', d: `基金业从 1822 到今天的 ${TL_N.total} 个可考时点 · 默认只看重点` },
  { v: 'fundops', icon: 'play', t: '基金运作动画', d: '九大运作环节逐格演示，看钱和份额在管理人、托管人、持有人之间怎么流转' },
  { v: 'dupont', icon: 'chart', t: '杜邦分析动画', d: '本钱过三关变成利润，看懂 ROE = 敢借 × 勤快 × 会赚，最后自己拖滑块验证' },
]

/** 其他工具：不计分的辅助理解工具频道，从这里进具体页面 */
export default function Tools({ go }) {
  return (
    <>
      <PageHeader
        variant="subpage"
        title="其他工具"
        subtitle="辅助理解 · 不计练习成绩"
        onBack={() => go('home')}
        backLabel="首页"
      />

      <div className="card tools">
        {TOOLS.map(tool => (
          <button className="tool-row" key={tool.v} onClick={() => go(tool.v)}>
            <Icon name={tool.icon} />
            <span className="grow"><b>{tool.t}</b><small className="muted">{tool.d}</small></span>
            <Icon name="right" />
          </button>
        ))}
      </div>
    </>
  )
}

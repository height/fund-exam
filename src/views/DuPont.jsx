import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { Icon, PageHeader } from '../components/ui'
import { BANK } from '../lib/bank'
import { useReducedMotion } from './FundOps'

gsap.registerPlugin(useGSAP)

/*
 * 杜邦分析：科目二「杜邦恒等式」。
 * 第一性原理：本钱 100 经过三道关变成净利润 20——
 *   借钱关 ×2（权益乘数）→ 做生意关 ×2（总资产周转率）→ 扣费用关 ×5%（销售利润率）。
 * 一步到位是 ×20%（ROE）。连续放大缩小，总倍数 = 各倍数相乘，这就是恒等式；
 * 分数写法里中间的 400、200 上下约掉，是同一件事的另一种写法。
 *
 * 舞台：一条「四站三关」的链贯穿第 1~4 步和最后的滑块互动步，
 * 每一步只新添自己那一截（dp-k{n}），走过的截由 .done 常亮；
 * 第 5、6 步是独立场景（约分证明、权益乘数三张面孔）。
 */

const DEF = { m: 2, t: 2, p: 5 }   // 权益乘数、总资产周转率、销售利润率(%)
const BASE = 330, MAXH = 170, BW = 70
const SX = [95, 285, 475, 665]     // 四站：净资产 → 总资产 → 销售收入 → 净利润
const STATIONS = [
  { name: '净资产', sub: '自己出的本钱', k: 0 },
  { name: '总资产', sub: '本钱 + 借款', k: 0 },
  { name: '销售收入', sub: '一年卖了多少', k: 1 },
  { name: '净利润', sub: '扣费用后到手', k: 2 },
]
const LAST = 6

const fmt = v => String(+v.toFixed(1))

/** 由三个比率算出四站的数值和柱高 */
function chain({ m, t, p }) {
  const v = [100, 100 * m, 100 * m * t, 100 * m * t * p / 100]
  const vmax = Math.max(...v)
  const h = v.map(x => Math.max(6, MAXH * x / vmax))
  return { v, h, top: h.map(x => BASE - x), roe: m * t * p, cost: v[2] - v[3] }
}

/** 站 i → 站 i+1 的弧线箭头，起止点在数值标签上方；返回路径和标签落点（弧顶） */
function arc(c, i) {
  const x0 = SX[i] + BW / 2 + 4, y0 = c.top[i] - 30
  const x1 = SX[i + 1] - BW / 2 - 4, y1 = c.top[i + 1] - 30
  const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 70
  return { d: `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`, lx: cx, ly: (y0 + 2 * cy + y1) / 4 - 28 }
}

function pop(tl, sel, at, d = 0.45) {
  tl.fromTo(sel, { autoAlpha: 0, scale: 0.5, transformOrigin: '50% 50%' },
    { autoAlpha: 1, scale: 1, duration: d, ease: 'back.out(2)' }, at)
}
function grow(tl, sel, at, d = 0.6) {
  tl.fromTo(sel, { autoAlpha: 1, scaleY: 0, transformOrigin: '50% 100%' },
    { scaleY: 1, duration: d, ease: 'power2.out' }, at)
}

const STEPS = [
  {
    t: '本钱 + 借款 = 总资产', tag: '借钱关 ×2 · 权益乘数',
    d: '开一家奶茶店：自己出 100 元本钱（净资产），再向银行借 100 元（负债）。手里的全部家当（总资产）就是 200 元。本钱 100 变成家当 200，放大了 2 倍——这个倍数叫权益乘数，看敢借多少。',
    ask: '先猜一猜：自己出 100、借 100，一年净赚 20，股东的回报率是多少？',
    ans: '20 ÷ 100 = 20%。分母是股东自己出的 100，不是 200——借来的钱不算股东的本钱。看完后面几步再回来对答案。',
    build(tl, q) {
      tl.set(q('.dp-s0, .dp-s1, .dp-a0'), { autoAlpha: 1 }, 0)
      grow(tl, q('.dp-s0 .dp-bar'), 0.1)
      pop(tl, q('.dp-s0 text'), 0.5)
      grow(tl, q('.dp-bar-e'), 1.1)
      tl.fromTo(q('.dp-bar-d'), { autoAlpha: 0, y: -70 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'bounce.out' }, 1.7)
      pop(tl, q('.dp-s1 text'), 2.4)
      pop(tl, q('.dp-a0'), 3.0, 0.55)
    },
  },
  {
    t: '家当转起来做生意', tag: '做生意关 ×2 · 总资产周转率',
    d: '200 元家当去买原料、租店面、雇人，一年卖出 400 元奶茶（销售收入）。200 变 400，又放大 2 倍——这个倍数叫总资产周转率，看家当一年转了几次生意，勤不勤快。',
    ask: '为什么周转率用「总资产 200」而不是「本钱 100」当分母？',
    ans: '做生意用的是全部家当（含借来的），家当转得快不快，自然拿全部家当去比。本钱那一份已经在借钱关算过，不能重复计。',
    build(tl, q) {
      tl.set(q('.dp-s2, .dp-a1'), { autoAlpha: 1 }, 0)
      grow(tl, q('.dp-s2 .dp-bar'), 0.2, 0.9)
      pop(tl, q('.dp-s2 text'), 1.0)
      pop(tl, q('.dp-a1'), 1.7, 0.55)
    },
  },
  {
    t: '扣掉费用，剩下净利润', tag: '扣费用关 ×5% · 销售利润率',
    d: '400 元收入不能全揣兜里：原料、房租、工资一扣，只剩 20 元（净利润）。400 缩到 20，只剩 5%——这个比率叫销售利润率，每卖 1 元净赚 5 分，看会不会赚。',
    ask: '费用少花 10 元，哪个比率会变？ROE 变成多少？',
    ans: '只有销售利润率变：净利润 30，利润率 30 ÷ 400 = 7.5%，ROE = 2 × 2 × 7.5% = 30%。周转率、权益乘数都没动——拆成三个比率就是为了看清赚的是哪份钱。',
    build(tl, q, c) {
      tl.set(q('.dp-s3, .dp-a2, .dp-cost'), { autoAlpha: 1 }, 0)
      const big = c.h[2] / c.h[3]
      tl.fromTo(q('.dp-s3 .dp-bar'), { autoAlpha: 1, scaleY: big, transformOrigin: '50% 100%' }, { scaleY: big, duration: 0.5 }, 0.1)
      tl.to(q('.dp-s3 .dp-bar'), { scaleY: 1, duration: 1.3, ease: 'power2.inOut' }, 0.7)
      tl.fromTo(q('.dp-cost'), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.9)
      pop(tl, q('.dp-s3 text'), 2.1)
      pop(tl, q('.dp-a2'), 2.7, 0.55)
    },
  },
  {
    t: '一步到位 = 三步连乘', tag: '杜邦恒等式',
    d: '股东最关心：我出的 100 元，一年赚回 20 元，回报率 20%，这就是净资产收益率（ROE）。从 100 到 20 分三步走：×2、×2、×5%。三个倍数乘起来 2 × 2 × 5% = 20%，正好等于一步到位的 20%。连续放大缩小，总倍数等于各倍数相乘——这就是杜邦恒等式。',
    ask: '把三关顺序换一换，先扣费用再借钱，结果还是 20% 吗？',
    ans: '还是。三个倍数相乘，乘法交换律，顺序不影响结果。所以考试写成 销售利润率 × 总资产周转率 × 权益乘数，和这里顺序不同，是同一个式子。',
    build(tl, q) {
      tl.set(q('.dp-k3'), { autoAlpha: 1 }, 0)
      tl.fromTo(q('.dp-roe'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, 0.2)
      pop(tl, q('.dp-roe-lab'), 0.9, 0.6)
      tl.fromTo(q('.dp-formula rect'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.8)
      tl.fromTo(q('.dp-formula text'), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, stagger: 0.25, duration: 0.35 }, 2.0)
      tl.fromTo(q('.dp-eq'), { scale: 1 }, { scale: 1.2, yoyo: true, repeat: 1, duration: 0.3, transformOrigin: '50% 50%' }, 3.8)
    },
  },
  {
    t: '为什么一定相等', tag: '分数约分',
    d: '每一关的倍数 = 后一站 ÷ 前一站。三个分数乘起来，中间的 400 上下各一个、200 上下各一个，都约掉了，只剩 20/100。所以不管数字怎么变，三个比率的乘积永远等于 ROE。考试还常把后两关合成一关：净利润 ÷ 总资产 = 资产收益率（ROA），ROE = ROA × 权益乘数。',
    ask: '为什么杜邦用「乘」而不是「加」把三个比率拼起来？',
    ans: '因为每一关是倍数，倍数叠加靠乘。用分数看更明白：后一站 ÷ 前一站，连乘后中间项约掉只剩首尾；加法做不到约分。',
    build(tl, q) {
      ;['.dp-q0', '.dp-q1', '.dp-q2', '.dp-q3'].forEach((s, i) => pop(tl, q(s), 0.2 + i * 0.5, 0.5))
      tl.fromTo(q('.dp-x'), { autoAlpha: 0, scaleX: 0, transformOrigin: '0% 50%' },
        { autoAlpha: 1, scaleX: 1, duration: 0.4, stagger: 0.3, ease: 'power2.inOut' }, 2.5)
      pop(tl, q('.dp-chip'), 3.9, 0.5)
      pop(tl, q('.dp-roa'), 4.7, 0.5)
    },
  },
  {
    t: '权益乘数的三张面孔', tag: '必考换算',
    d: '总资产 = 负债 + 净资产。同一个 2 倍有三种算法：总资产 ÷ 净资产；1 ÷ (1 − 资产负债率)；1 + 负债权益比。题目给的是资产负债率还是负债权益比，都能换回权益乘数；反过来，负债权益比 = 权益乘数 − 1。',
    ask: '资产负债率从 50% 升到 75%，权益乘数变成几？ROE 呢？',
    ans: '权益乘数 = 1 ÷ (1 − 75%) = 4，翻了一倍；其他不变时 ROE = 2 × 5% × 4 = 40%。借得多 ROE 好看，亏的时候也按 4 倍放大——这就是杠杆。',
    build(tl, q) {
      grow(tl, q('.dp-seg-e'), 0.1)
      tl.fromTo(q('.dp-seg-d'), { autoAlpha: 0, y: -70 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'bounce.out' }, 0.6)
      pop(tl, q('.dp-seg-t'), 1.2)
      ;['.dp-face0', '.dp-face1', '.dp-face2'].forEach((s, i) => pop(tl, q(s), 1.9 + i * 0.9, 0.5))
    },
  },
  {
    t: '动手调一调', tag: '考试三种问法',
    d: '拖动下面三个滑块：任何一个变小，ROE 都跟着变小；借得越多乘数越大，ROE 越高，但风险也越大。考试的正算、倒算、问方向三种题，都是在这条链上做乘除法。',
    ask: '用滑块验证：ROE 15%、利润率 5%、周转率 2，权益乘数该拖到几？',
    ans: '15% ÷ 5% ÷ 2 = 1.5。把权益乘数拖到 1.5、利润率拖到 5%，看公式行是不是 ROE 15%；负债权益比 = 1.5 − 1 = 0.5，这正是题库里的原题。',
    build(tl, q) {
      tl.fromTo(q('.dp-roe-lab'), { scale: 1 }, { scale: 1.15, yoyo: true, repeat: 1, duration: 0.3, transformOrigin: '50% 50%' }, 0.3)
    },
  },
]

/** 分数（约分场景） */
function Fr({ cls, x, y, num, den, name }) {
  return (
    <g className={cls} transform={`translate(${x},${y})`}>
      <text className="dp-frac-num" y="-10" textAnchor="middle">{num}</text>
      <line className="dp-frac-line" x1="-30" y1="0" x2="30" y2="0" />
      <text className="dp-frac-num" y="30" textAnchor="middle">{den}</text>
      <text className="dp-frac-name" y="54" textAnchor="middle">{name}</text>
    </g>
  )
}

const FACES = [
  ['面孔一：总资产 ÷ 净资产', '200 ÷ 100 = 2', '考试写法：资产总额 ÷ 所有者权益'],
  ['面孔二：1 ÷ (1 − 资产负债率)', '资产负债率 = 负债 ÷ 总资产 = 100 ÷ 200 = 50%', '1 ÷ (1 − 50%) = 1 ÷ 0.5 = 2'],
  ['面孔三：1 + 负债权益比', '负债权益比 = 负债 ÷ 净资产 = 100 ÷ 100 = 1', '1 + 1 = 2；反过来 负债权益比 = 权益乘数 − 1'],
]

/* 例题 → 同型练习：例题和练习题都来自题库真题的数字 */
const DRILL = [
  { t: '正着算', ex: '销售利润率 20%、周转率 0.8、权益乘数 2 → ROE = 20% × 0.8 × 2 = 32%',
    q: '销售利润率 25%、周转率 0.4、资产负债率 50%，ROE 是多少？',
    a: '先换权益乘数：1 ÷ (1 − 50%) = 2；ROE = 25% × 0.4 × 2 = 20%。' },
  { t: '倒着算', ex: 'ROE 15%、销售利润率 5%、周转率 2 → 权益乘数 = 15% ÷ 5% ÷ 2 = 1.5 → 负债权益比 = 1.5 − 1 = 0.5',
    q: 'ROE 24%、销售利润率 8%、周转率 1.5，资产负债率是多少？',
    a: '权益乘数 = 24% ÷ 8% ÷ 1.5 = 2；1 − 1 ÷ 2 = 50%。' },
  { t: '问方向', ex: '资产负债率降低 → 权益乘数变小 → ROE 下降；流动比率、市盈率不在恒等式里，与 ROE 无关',
    q: '其他不变，哪项会提高 ROE：A 降低负债权益比；B 提高总资产周转率；C 降低销售利润率？',
    a: 'B。A 让权益乘数变小，C 让利润率变小，都拉低 ROE；三个因子任何一个变大，ROE 才变大。' },
]
const DUPONT_KW = '杜邦|权益乘数'
const DUPONT_N = BANK.filter(q => new RegExp(DUPONT_KW).test(q.q + q.explain)).length

const SLIDERS = [
  ['m', '权益乘数 · 敢借多少', 1, 5, 0.5, ' 倍'],
  ['t', '总资产周转率 · 勤不勤快', 0.2, 3, 0.1, ' 次'],
  ['p', '销售利润率 · 会不会赚', 1, 30, 1, '%'],
]

export default function DuPont({ go }) {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(!reduceMotion)
  const [run, setRun] = useState(0)
  const [vals, setVals] = useState(DEF)
  const sceneRef = useRef(null)
  const stepsRef = useRef(null)
  const tlRef = useRef(null)
  const playingRef = useRef(playing)
  playingRef.current = playing

  const cur = STEPS[step]
  const live = step === LAST
  const { m, t, p } = live ? vals : DEF
  const c = chain({ m, t, p })
  const arcs = [0, 1, 2].map(i => arc(c, i))
  const ratios = [
    { k: `×${fmt(m)}`, n: `权益乘数 ${fmt(c.v[1])}÷100` },
    { k: `×${fmt(t)}`, n: `总资产周转率 ${fmt(c.v[2])}÷${fmt(c.v[1])}` },
    { k: `×${fmt(p)}%`, n: `销售利润率 ${fmt(c.v[3])}÷${fmt(c.v[2])}` },
  ]

  useGSAP(() => {
    const q = gsap.utils.selector(sceneRef.current)
    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onComplete() {
        if (!playingRef.current) return
        if (step < LAST) setStep(step + 1)
        else setPlaying(false)
      },
    })
    tlRef.current = tl
    // 先清掉上一步留下的内联样式（revert 对 set+fromTo 叠在同一元素上时还原不净），再演本步
    gsap.set(q('.dp-p, .dp-p *'), { clearProps: 'opacity,visibility' })
    cur.build(tl, q, c)
    // 没在连播（手动跳步、减弱动态效果下未点播放）：直接落到本步终态
    if (!playingRef.current) tl.progress(1)
    return () => { tl.kill() }
  }, { scope: sceneRef, dependencies: [step, run], revertOnUpdate: true })

  // 减弱动态效果只关自动播放：中途打开时停在本步终态，用户点播放仍然会演
  useEffect(() => {
    if (!reduceMotion) return
    tlRef.current?.progress(1)
    setPlaying(false)
  }, [reduceMotion])

  useEffect(() => {
    stepsRef.current?.children[step]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [step])

  function jump(i) {
    setPlaying(false)
    setStep(i)
  }
  function togglePlay() {
    if (playing) {
      tlRef.current?.pause()
      setPlaying(false)
      return
    }
    setPlaying(true)
    const tl = tlRef.current
    if (live && (!tl || tl.progress() >= 1)) setStep(0)
    if (!tl || tl.progress() >= 1) setRun(r => r + 1)
    else tl.play()
  }

  /** 链上的一截：走过的步常亮，当前步交给 GSAP，滑块步全亮 */
  const pc = (k, extra) => `dp-p dp-k${k} ${extra}${k < step || live ? ' done' : ''}`
  const chainOn = step <= 3 || live

  return (
    <>
      <PageHeader
        variant="subpage"
        title="杜邦分析"
        subtitle="本钱过三关变成利润 · 倍数相乘就是 ROE"
        onBack={() => go('tools')}
        backLabel="工具"
        action={(
          <button onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
            <Icon name={playing ? 'stop' : 'play'} /> {playing ? '暂停' : '播放'}
          </button>
        )}
      />

      <div className="fo-stage card" ref={sceneRef}>
        <svg className="fo-svg" viewBox="0 0 760 470" role="img"
          aria-label={`杜邦分析动画：当前第${step + 1}步，${cur.t}`}>
          <defs>
            <marker id="dp-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0 0L7 3.5L0 7Z" className="fo-arrow-head" />
            </marker>
          </defs>

          {/* ===== 链：四站三关（第 1~4 步 + 滑块步） ===== */}
          <g className={`dp-scene${chainOn ? '' : ' hide'}`}>
            <line className="dp-base" x1="40" x2="720" y1={BASE} y2={BASE} />
            {STATIONS.map((s, i) => (
              <g key={s.name} className={pc(s.k, `dp-s${i}`)} transform={`translate(${SX[i]},0)`}>
                {i === 1 ? (
                  <>
                    <rect className="dp-bar dp-bar-e" x={-BW / 2} y={BASE - c.h[0]} width={BW} height={c.h[0]} />
                    <rect className="dp-bar dp-bar-d" x={-BW / 2} y={c.top[1]} width={BW} height={c.h[1] - c.h[0]} />
                  </>
                ) : <rect className={`dp-bar dp-bar-${i}`} x={-BW / 2} y={c.top[i]} width={BW} height={c.h[i]} />}
                <text className="dp-val" y={c.top[i] - 8} textAnchor="middle">{fmt(c.v[i])}</text>
                <text className="dp-name" y={BASE + 22} textAnchor="middle">{s.name}</text>
                <text className="dp-sub" y={BASE + 39} textAnchor="middle">{s.sub}</text>
              </g>
            ))}
            {arcs.map((a, i) => (
              <g key={i} className={pc(i, `dp-a${i}`)}>
                <path className="dp-arr" d={a.d} markerEnd="url(#dp-arrow)" />
                <g className="dp-lab" transform={`translate(${a.lx},${a.ly})`}>
                  <rect x="-72" y="-21" width="144" height="42" rx="10" />
                  <text className="dp-lab-k" y="-2" textAnchor="middle">{ratios[i].k}</text>
                  <text className="dp-lab-n" y="14" textAnchor="middle">{ratios[i].n}</text>
                </g>
              </g>
            ))}
            <g transform="translate(700,200)">
              <g className={pc(2, 'dp-cost')}>
                <rect x="-55" y="-19" width="110" height="38" rx="9" />
                <text y="-3" textAnchor="middle">费用 −{fmt(c.cost)}</text>
                <text y="12" textAnchor="middle">原料 · 房租 · 工资</text>
              </g>
            </g>
            {/* 一步到位：链条下方一条括线，从净资产直接括到净利润 */}
            <g className={pc(3, '')}>
              <path className="dp-roe" d={`M${SX[0]},386 v10 H${SX[3]} v-10`} />
              <g className="dp-roe-lab" transform="translate(380,396)">
                <rect x="-104" y="-21" width="208" height="42" rx="10" />
                <text className="dp-roe-v" y="-2" textAnchor="middle">一步到位 ×{fmt(c.roe)}%</text>
                <text className="dp-roe-n" y="14" textAnchor="middle">净资产收益率 ROE = {fmt(c.v[3])} ÷ 100</text>
              </g>
              <g className="dp-formula" transform="translate(0,444)">
                <rect x="40" y="-18" width="680" height="36" rx="10" />
                {[[`权益乘数 ${fmt(m)}`, 140], ['×', 232], [`周转率 ${fmt(t)}`, 320], ['×', 408], [`利润率 ${fmt(p)}%`, 495], ['=', 578]].map(([s, x]) => (
                  <text key={x} x={x} y="5" textAnchor="middle">{s}</text>
                ))}
                <text className="dp-eq" x="660" y="5" textAnchor="middle">ROE {fmt(c.roe)}%</text>
              </g>
            </g>
          </g>

          {/* ===== 第 5 步：约分证明 ===== */}
          <g className={`dp-scene${step === 4 ? '' : ' hide'}`} transform="translate(0,20)">
            <Fr cls="dp-p dp-q0" x={90} y={110} num="20" den="100" name="ROE" />
            <text className="dp-p dp-q1 dp-op" x="170" y="118" textAnchor="middle">=</text>
            <Fr cls="dp-p dp-q1" x={250} y={110} num="20" den="400" name="销售利润率" />
            <text className="dp-p dp-q2 dp-op" x="330" y="118" textAnchor="middle">×</text>
            <Fr cls="dp-p dp-q2" x={410} y={110} num="400" den="200" name="总资产周转率" />
            <text className="dp-p dp-q3 dp-op" x="490" y="118" textAnchor="middle">×</text>
            <Fr cls="dp-p dp-q3" x={570} y={110} num="200" den="100" name="权益乘数" />
            {/* 约分线：先划两个 400，再划两个 200 */}
            <line className="dp-p dp-x" x1="226" y1="132" x2="274" y2="132" />
            <line className="dp-p dp-x" x1="386" y1="92" x2="434" y2="92" />
            <line className="dp-p dp-x" x1="386" y1="132" x2="434" y2="132" />
            <line className="dp-p dp-x" x1="546" y1="92" x2="594" y2="92" />
            <g className="dp-p dp-chip" transform="translate(380,205)">
              <rect x="-210" y="-19" width="420" height="38" rx="19" />
              <text y="6" textAnchor="middle">中间的 400、200 上下约掉，只剩 20/100，左右一模一样</text>
            </g>
            <g className="dp-p dp-roa dp-box" transform="translate(0,255)">
              <rect x="40" y="0" width="680" height="130" rx="12" />
              <text className="dp-h" x="60" y="30">两层写法（同样常考）</text>
              <text className="dp-l" x="60" y="62">后两关合成一关：净利润 ÷ 总资产 = 20 ÷ 200 = 10%，叫资产收益率（ROA）</text>
              <text className="dp-l" x="60" y="88">ROA = 销售利润率 × 总资产周转率 = 5% × 2 = 10%</text>
              <text className="dp-l" x="60" y="114">净资产收益率 = 资产收益率 × 权益乘数 = 10% × 2 = 20%</text>
            </g>
          </g>

          {/* ===== 第 6 步：权益乘数三张面孔 ===== */}
          <g className={`dp-scene${step === 5 ? '' : ' hide'}`} transform="translate(0,20)">
            <line className="dp-base" x1="50" x2="260" y1="330" y2="330" />
            <rect className="dp-p dp-seg-e" x="75" y="230" width="70" height="100" />
            <rect className="dp-p dp-seg-d" x="75" y="130" width="70" height="100" />
            <g className="dp-p dp-seg-t">
              <text className="dp-name" x="110" y="112" textAnchor="middle">总资产 200</text>
              <text className="dp-name" x="155" y="176">负债 100</text>
              <text className="dp-sub" x="155" y="192">借的</text>
              <text className="dp-name" x="155" y="276">净资产 100</text>
              <text className="dp-sub" x="155" y="292">自己的</text>
            </g>
            {FACES.map((f, i) => (
              <g key={i} className={`dp-p dp-face${i} dp-box`} transform={`translate(0,${60 + i * 118})`}>
                <rect x="290" y="0" width="450" height="98" rx="12" />
                <text className="dp-h" x="306" y="28">{f[0]}</text>
                <text className="dp-l" x="306" y="54">{f[1]}</text>
                <text className="dp-l" x="306" y="78">{f[2]}</text>
                <text className="dp-big" x="722" y="36" textAnchor="end">= 2</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* 步骤条：点哪步演哪步，跟着动画滚 */}
      <div className="fo-steps" role="tablist" aria-label="杜邦分析步骤" ref={stepsRef}>
        {STEPS.map((s, i) => (
          <button key={s.t} role="tab" aria-selected={i === step} className={i === step ? 'on' : ''}
            onClick={() => jump(i)}>
            <i className="num">{i + 1}</i>{s.t}
          </button>
        ))}
      </div>

      <div className="fo-caption card" key={step} aria-live="polite">
        <div className="row between">
          <b><span className="num fo-no">{step + 1}</span>{cur.t}</b>
          <span className="chip">{cur.tag}</span>
        </div>
        <p>{cur.d}</p>
        {/* 深层追问：第 1 步兼作前测，其余逼学生说「为什么」 */}
        <details className="plain dp-ask">
          <summary>想一想：{cur.ask}</summary>
          <p>{cur.ans}</p>
        </details>
        <div className="row between">
          <button className="btn-sm btn-ghost" disabled={step === 0} onClick={() => jump(step - 1)}>
            <Icon name="left" /> 上一步
          </button>
          {live
            ? <button className="btn-sm" onClick={() => { setStep(0); setPlaying(true); setRun(r => r + 1) }}>
                <Icon name="refresh" /> 再演一遍
              </button>
            : <button className="btn-sm" onClick={() => jump(step + 1)}>下一步 <Icon name="right" /></button>}
        </div>
      </div>

      {live && (
        <div className="card dp-ctl">
          {SLIDERS.map(([k, label, min, max, st, unit]) => (
            <label key={k}>
              <span>{label}</span><b>{fmt(vals[k])}{unit}</b>
              <input type="range" min={min} max={max} step={st} value={vals[k]}
                onChange={e => setVals(v => ({ ...v, [k]: +e.target.value }))} />
            </label>
          ))}
          <small className="muted">
            资产负债率 {fmt((1 - 1 / vals.m) * 100)}% · 负债权益比 {fmt(vals.m - 1)} · 资产收益率 {fmt(vals.t * vals.p)}%
          </small>
        </div>
      )}

      {/* 例题↔练习交替：每种问法先看一道解好的，再自己算一道同型的 */}
      <div className="card fo-parties">
        <b>例题 → 你来算</b>
        <dl>
          <dt>公式</dt>
          <dd>净资产收益率 = 销售利润率 × 总资产周转率 × 权益乘数 = 资产收益率 × 权益乘数</dd>
          <dt>权益乘数</dt>
          <dd>= 资产总额 ÷ 所有者权益 = 1 ÷ (1 − 资产负债率) = 1 + 负债权益比</dd>
          {DRILL.map(d => (
            <div key={d.t}>
              <dt>例题 · {d.t}</dt>
              <dd>{d.ex}</dd>
              <details className="plain dp-ask">
                <summary>你来算：{d.q}</summary>
                <p>{d.a}</p>
              </details>
            </div>
          ))}
        </dl>
        <button className="btn-sm" onClick={() => go('practice', { scope: `kw:${DUPONT_KW}`, order: 'seq' })}>
          <Icon name="right" /> 去题库练 {DUPONT_N} 道杜邦题
        </button>
      </div>
    </>
  )
}

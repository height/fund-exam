import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { useGSAP } from '@gsap/react'
import { Icon, PageHeader } from '../components/ui'

gsap.registerPlugin(useGSAP, MotionPathPlugin)

/*
 * 基金运作动画：科目二考点「基金的运作和参与主体」。
 * 场景固定四位主角——持有人（投资人）在左、基金管理人在上、基金托管人在下、
 * 证券市场在右，证监会/基金业协会在右上角拉虚线监督；
 * 九个运作环节按教材顺序排成时间轴，每一步用钱币、文件、锁、天平这些小道具
 * 把「谁在动、动的是什么」演出来。术语全部按科目二口径。
 */

// 演员站位（SVG viewBox 760×430 下的圆心坐标），动画里的飞行都围着它们转
const INV = { x: 110, y: 236 }  // 投资人 = 基金份额持有人
const MGR = { x: 380, y: 108 }  // 基金管理人
const CUS = { x: 380, y: 330 }  // 基金托管人
const MKT = { x: 648, y: 205 }  // 证券市场
const REG = { x: 648, y: 44 }   // 监管与自律

const COINS = Array.from({ length: 9 }, (_, i) => `.fo-c${i}`)

/** 钱币沿弧线飞：fromCurrent:false 让它先瞬移到起点，再按路径走 */
function fly(tl, sel, pts, at, d = 0.9) {
  tl.to(sel, {
    motionPath: { path: pts, fromCurrent: false, curviness: 1.35 },
    autoAlpha: 1, duration: d, ease: 'power1.inOut',
  }, at)
}
/** 飞完落袋：缩没，免得下一场戏里悬在半空 */
function sink(tl, sel, at) {
  tl.to(sel, { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.in' }, at)
}
/** 道具从空气里弹出来 */
function pop(tl, sel, at, d = 0.45) {
  tl.fromTo(sel, { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%' },
    { autoAlpha: 1, scale: 1, duration: d, ease: 'back.out(2.2)' }, at)
}

const STEPS = [
  {
    t: '基金产品的设计', tag: '基金管理人',
    d: '管理人设计一只基金：投什么（股票/债券）、风险收益特征、怎么收费，写成基金合同、招募说明书等文件，报证监会注册。产品画好图纸，一只基金才算有了起点。',
    build(tl, q, lit) {
      lit('manager', 0)
      tl.to(q('.fo-gear'), { rotation: 360, transformOrigin: '50% 50%', duration: 1.4, ease: 'none', repeat: 1 }, 0)
      pop(tl, q('.fo-blueprint'), 0.35)
      tl.fromTo(q('.fo-bp-line'), { autoAlpha: 0, x: -6 }, { autoAlpha: 1, x: 0, stagger: 0.18, duration: 0.3 }, 0.8)
    },
  },
  {
    t: '基金的募集', tag: '持有人认购 · 钱进托管专户',
    d: '募集期投资人（基金份额持有人）掏钱认购。注意钱的走向：认购资金不经过管理人的口袋，直接存进托管人开立的账户；验资、备案后基金合同生效，投资人确认拿到基金份额。',
    build(tl, q, lit) {
      lit('investor', 0)
      COINS.slice(0, 3).forEach((c, i) => {
        fly(tl, q(c), [INV, { x: 250, y: 200 }, { x: CUS.x, y: CUS.y - 10 }], 0.2 + i * 0.3)
        sink(tl, q(c), 1.35 + i * 0.3)
      })
      lit('custodian', 1.2)
      pop(tl, q('.fo-share'), 2.1)
      tl.to(q('.fo-share'), {
        motionPath: { path: [{ x: CUS.x - 40, y: CUS.y - 66 }, { x: 240, y: 180 }, { x: INV.x, y: INV.y - 58 }], fromCurrent: false, curviness: 1.2 },
        duration: 1, ease: 'power1.inOut',
      }, 2.2)
      lit('investor', 3.1)
    },
  },
  {
    t: '基金财产的托管', tag: '托管人管钱 · 管理人管指令',
    d: '基金财产交给托管人保管，与管理人、托管人的自有财产严格分开。金库门上锁那一刻就是考点：管理人下达投资指令，托管人管钱并监督管理人；二者不得为同一机构、不得相互出资或持股。',
    build(tl, q, lit) {
      lit('custodian', 0)
      COINS.slice(0, 3).forEach((c, i) => {
        fly(tl, q(c), [{ x: INV.x, y: INV.y }, { x: 260, y: 220 }, { x: CUS.x, y: CUS.y - 8 }], i * 0.12, 0.6)
      })
      // 金库门从旁边滑回合拢，再上锁：钱进了托管人手里，管理人碰不到
      tl.fromTo(q('.fo-vault-door'), { x: 30 }, { x: 0, duration: 0.5, ease: 'power3.inOut' }, 1.0)
      pop(tl, q('.fo-lock'), 1.55)
      lit('manager', 2.0)
      tl.fromTo(q('.fo-watch'), { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: 0.8, repeat: 2, ease: 'none' }, 2.0)
    },
  },
  {
    t: '投资管理', tag: '指令 → 复核 → 入市',
    d: '管理人按基金合同做投资，向托管人下达投资指令；托管人审核无误后执行，资金从托管账户划入证券市场买卖证券。行情柱长高后，本金带着收益回家——赚到的钱和买到的证券，都还是基金财产。',
    build(tl, q, lit) {
      lit('manager', 0)
      pop(tl, q('.fo-order'), 0.2)
      tl.to(q('.fo-order'), {
        motionPath: { path: [{ x: MGR.x - 28, y: MGR.y + 34 }, { x: MGR.x - 10, y: 220 }, { x: CUS.x - 30, y: CUS.y - 62 }], fromCurrent: false, curviness: 1 },
        duration: 0.9, ease: 'power1.inOut',
      }, 0.35)
      lit('custodian', 1.2)
      COINS.slice(3, 6).forEach((c, i) => {
        fly(tl, q(c), [{ x: CUS.x + 30, y: CUS.y - 10 }, { x: 520, y: 220 }, { x: MKT.x - 30, y: MKT.y }], 1.5 + i * 0.25)
        sink(tl, q(c), 2.6 + i * 0.25)
      })
      // 行情走强，本金带着收益回家
      lit('market', 2.4)
      tl.fromTo(q('.fo-bar'), { scaleY: 0.45 }, { scaleY: 1.7, stagger: 0.15, duration: 0.7, ease: 'power2.out' }, 2.6)
      lit('custodian', 3.6)
      COINS.slice(3, 7).forEach((c, i) => {
        fly(tl, q(c), [{ x: MKT.x - 30, y: MKT.y }, { x: 540, y: 300 }, { x: CUS.x + 30, y: CUS.y - 8 }], 3.6 + i * 0.18, 0.8)
        sink(tl, q(c), 4.6 + i * 0.18)
      })
    },
  },
  {
    t: '申购、赎回、转让交易及登记', tag: '份额登记机构记账',
    d: '开放后持有人可以申购（钱换份额）、赎回（份额换钱），也可以转让交易。每一笔份额变动都由基金份额登记机构记到账上——登记结果是权属的依据。',
    build(tl, q, lit) {
      lit('investor', 0)
      // 申购：钱进，份额出
      fly(tl, q(COINS[0]), [INV, { x: 250, y: 210 }, { x: CUS.x, y: CUS.y - 10 }], 0.2)
      sink(tl, q(COINS[0]), 1.25)
      tl.to(q('.fo-share'), {
        motionPath: { path: [{ x: CUS.x - 40, y: CUS.y - 66 }, { x: 250, y: 170 }, { x: INV.x, y: INV.y - 58 }], fromCurrent: false, curviness: 1.2 },
        autoAlpha: 1, duration: 0.9, ease: 'power1.inOut',
      }, 1.35)
      lit('custodian', 1.2)
      lit('investor', 2.6)
      // 赎回：份额回，钱出
      tl.to(q('.fo-share'), {
        motionPath: { path: [{ x: INV.x, y: INV.y - 58 }, { x: 250, y: 180 }, { x: CUS.x - 40, y: CUS.y - 66 }], fromCurrent: false, curviness: 1.2 },
        duration: 0.9, ease: 'power1.inOut',
      }, 2.6)
      tl.to(q('.fo-share'), { autoAlpha: 0, duration: 0.25 }, 3.5)
      lit('custodian', 3.5)
      fly(tl, q(COINS[1]), [{ x: CUS.x, y: CUS.y - 10 }, { x: 250, y: 250 }, INV], 3.6)
      lit('investor', 4.5)
      sink(tl, q(COINS[1]), 4.55)
      // 登记机构把每一笔记到账上
      pop(tl, q('.fo-ledger'), 1.2)
      tl.fromTo(q('.fo-ledger'), { skewX: 0 }, { skewX: -14, yoyo: true, repeat: 5, duration: 0.18, ease: 'power1.inOut' }, 1.7)
      tl.fromTo(q('.fo-ldg-line'), { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.4, duration: 0.2 }, 1.5)
    },
  },
  {
    t: '基金估值与会计核算', tag: '管理人估值 · 托管人复核',
    d: '管理人每个交易日对基金资产进行估值与会计核算，算出基金份额净值——申购赎回都按它定价；托管人负责复核确认。天平停平、两边账对得上，净值才作数。',
    build(tl, q, lit) {
      lit('market', 0.2)
      tl.to(q('.fo-bar'), { scaleY: gsap.utils.wrap([1.4, 0.9, 1.7]), duration: 0.5, stagger: 0.12 }, 0.2)
      lit('manager', 0.8)
      pop(tl, q('.fo-scale'), 0.7)
      // 天平左右晃两下，最后停平：估出来的值得经得起复核
      tl.fromTo(q('.fo-beam'), { rotation: -9 }, { rotation: 9, transformOrigin: '50% 12%', yoyo: true, repeat: 3, duration: 0.45, ease: 'sine.inOut' }, 1.1)
      tl.to(q('.fo-beam'), { rotation: 0, duration: 0.4, ease: 'sine.out' }, 3.0)
      lit('custodian', 3.4)
      pop(tl, q('.fo-check'), 3.4)
    },
  },
  {
    t: '基金信息披露', tag: '向持有人和监管如实报告',
    d: '管理人按规定披露净值、公告和定期报告：一份讲给持有人听，一份报给监管（证监会、基金业协会）。披露必须真实、准确、完整、及时——这是持有人的知情权。',
    build(tl, q, lit) {
      lit('manager', 0)
      pop(tl, q('.fo-mega'), 0.15)
      tl.fromTo(q('.fo-arc'), { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.22, duration: 0.25 }, 0.6)
      tl.to(q('.fo-arc'), { autoAlpha: 0, stagger: 0.15, duration: 0.25 }, 1.6)
      pop(tl, q('.fo-r1'), 1.2)
      tl.to(q('.fo-r1'), {
        motionPath: { path: [{ x: MGR.x - 30, y: MGR.y + 30 }, { x: 240, y: 160 }, { x: INV.x + 6, y: INV.y - 62 }], fromCurrent: false, curviness: 1.2 },
        duration: 1, ease: 'power1.inOut',
      }, 1.3)
      lit('investor', 2.2)
      pop(tl, q('.fo-r2'), 1.5)
      lit('regulator', 2.5)
      tl.to(q('.fo-r2'), {
        motionPath: { path: [{ x: MGR.x + 24, y: MGR.y + 26 }, { x: 540, y: 110 }, { x: REG.x - 60, y: REG.y + 6 }], fromCurrent: false, curviness: 1.2 },
        duration: 1, ease: 'power1.inOut',
      }, 1.6)
    },
  },
  {
    t: '基金收益分配', tag: '按份额分给持有人',
    d: '基金赚了钱，把可供分配收益按持有份额分给持有人：可以现金分红，也可以红利再投资（分红转成份额）。记住分的是收益，不是本金。',
    build(tl, q, lit) {
      lit('custodian', 0)
      COINS.slice(0, 6).forEach((c, i) => {
        const tgt = [{ x: INV.x - 38, y: INV.y - 46 }, { x: INV.x, y: INV.y - 60 }, { x: INV.x + 38, y: INV.y - 46 }][i % 3]
        fly(tl, q(c), [{ x: CUS.x, y: CUS.y - 10 }, { x: 250, y: 140 + i * 14 }, tgt], 0.25 + i * 0.22, 0.85)
        // 金币落袋前翻个面，分红是件开心事，但人不跳
        tl.to(q(c), { rotation: 360, duration: 0.85, ease: 'none' }, 0.25 + i * 0.22)
        sink(tl, q(c), 1.35 + i * 0.22)
      })
      lit('investor', 1.4)
    },
  },
  {
    t: '基金清算终止', tag: '清算组 = 管理人 + 托管人 + 中介服务机构',
    d: '基金合同终止时成立清算组，由管理人、托管人和相关中介服务机构组成；变现基金财产、清偿费用后，剩余财产按份额退给持有人，基金终止谢幕。',
    build(tl, q, lit) {
      lit('market', 0.2)
      // 市场里的资产变现回金库
      COINS.slice(3, 5).forEach((c, i) => {
        fly(tl, q(c), [{ x: MKT.x - 30, y: MKT.y }, { x: 540, y: 300 }, { x: CUS.x + 30, y: CUS.y - 8 }], 0.2 + i * 0.2, 0.8)
        sink(tl, q(c), 1.15 + i * 0.2)
      })
      lit('custodian', 1.0)
      lit('investor', 1.7)
      // 按份额退给持有人
      COINS.slice(0, 3).forEach((c, i) => {
        fly(tl, q(c), [{ x: CUS.x, y: CUS.y - 10 }, { x: 250, y: 170 + i * 20 }, INV], 1.7 + i * 0.22, 0.9)
        sink(tl, q(c), 2.8 + i * 0.22)
      })
      pop(tl, q('.fo-done'), 3.3, 0.6)
      // 主角们淡出谢幕，只留清算完成的印章
      lit(null, 3.5)
      tl.to(q('.fo-actor, .fo-bar, .fo-mkt-wick'), { opacity: 0.3, duration: 0.8 }, 3.6)
    },
  },
]

export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = e => setReduce(e.matches)
    // iOS 13 及更早的 Safari 只实现了 MediaQueryList.addListener。
    if (media.addEventListener) {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])
  return reduce
}

export default function FundOps({ go }) {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(!reduceMotion)
  // 系统开启「减弱动态效果」时不自动播；用户主动点播放后允许本次动画正常运行。
  const [allowMotion, setAllowMotion] = useState(!reduceMotion)
  const [lit, setLit] = useState(null) // 当前被点名的演员：跟着钱/份额的流向走
  const [run, setRun] = useState(0) // 播放按钮的重放令牌：步数没变也要让当前步重跑一遍
  const sceneRef = useRef(null)
  const stepsRef = useRef(null)
  const tlRef = useRef(null)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const allowMotionRef = useRef(allowMotion)
  allowMotionRef.current = allowMotion

  const cur = STEPS[step]
  const last = step === STEPS.length - 1

  useGSAP(() => {
    const q = gsap.utils.selector(sceneRef.current)
    const tl = gsap.timeline({
      defaults: { ease: 'power2.out', overwrite: 'auto' },
      onComplete() {
        if (!playingRef.current || !allowMotionRef.current) return
        if (step < STEPS.length - 1) setStep(step + 1)
        else setPlaying(false)
      },
    })
    tlRef.current = tl
    setLit(null)
    cur.build(tl, q, (who, at) => tl.call(() => setLit(who), [], at))
    // 减弱动态效果默认展示本步终态；手动点击播放会把 allowMotion 打开并重建时间轴。
    if (!allowMotion) tl.progress(1)
    return () => { tl.kill() }
  }, { scope: sceneRef, dependencies: [step, run, allowMotion], revertOnUpdate: true })

  useEffect(() => {
    if (!reduceMotion) {
      setAllowMotion(true)
      return
    }
    tlRef.current?.progress(1)
    setPlaying(false)
    setAllowMotion(false)
  }, [reduceMotion])

  // 步骤条跟着动画走：自动播到靠后的环节时，把当前那颗滚进视野中间
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
    // 用户的明确播放操作优先于系统的自动播放偏好；仍然不会在进入页面时自行播放。
    setAllowMotion(true)
    setPlaying(true)
    const tl = tlRef.current
    if (last && (!tl || tl.progress() >= 1)) setStep(0) // 演完了再按播放＝从头来
    if (!tl || tl.progress() >= 1) setRun(r => r + 1)
    else tl.play()
  }

  return (
    <>
      <PageHeader
        variant="subpage"
        title="基金运作"
        subtitle="运作环节 × 参与主体 · 科目二口径"
        onBack={() => go('tools')}
        backLabel="工具"
        action={(
          <button onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
            <Icon name={playing ? 'stop' : 'play'} /> {playing ? '暂停' : '播放'}
          </button>
        )}
      />

      <div className="fo-stage card" ref={sceneRef}>
        <svg className="fo-svg" viewBox="0 0 760 430" role="img"
          aria-label={`基金运作动画：当前第${step + 1}步，${cur.t}`}>
          <defs>
            <marker id="fo-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0 0L7 3.5L0 7Z" className="fo-arrow-head" />
            </marker>
          </defs>

          {/* 资金/指令的固定走向（虚线导轨，动画里的钱币沿它们飞） */}
          <path className="fo-guide" d="M152,258 C230,296 290,314 332,322" />
          <path className="fo-guide" d="M380,152 V282" />
          <path className="fo-guide" d="M428,318 C500,296 566,252 602,226" />

          {/* 监管：虚线从徽章底下出发，照着管理人和托管人 */}
          <g className={`fo-actor fo-actor-reg${lit === 'regulator' ? ' on' : ''}`} transform={`translate(${REG.x},${REG.y})`}>
            <g className="fo-bob">
              <rect x="-80" y="-19" width="160" height="38" rx="19" className="fo-reg-box" />
              <text y="5" textAnchor="middle" className="fo-reg-txt">证监会 · 基金业协会</text>
            </g>
          </g>
          <path className="fo-watch" d="M618,64 C566,72 486,86 428,100" markerEnd="url(#fo-arrow)" />
          <path className="fo-watch" d="M640,64 C612,148 520,236 436,290" markerEnd="url(#fo-arrow)" />

          {/* 基金管理人 */}
          <g className={`fo-actor fo-actor-mgr${lit === 'manager' ? ' on' : ''}`} transform={`translate(${MGR.x},${MGR.y})`}>
            <g className="fo-bob">
            <ellipse className="fo-shadow" cx="0" cy="27" rx="42" ry="5.5" />
            <path className="fo-roof" d="M-38,-14 L0,-40 L38,-14 Z" />
            <rect className="fo-body" x="-34" y="-14" width="68" height="38" rx="5" />
            <rect className="fo-win" x="-24" y="-5" width="12" height="12" rx="2" />
            <rect className="fo-win" x="12" y="-5" width="12" height="12" rx="2" />
            <rect className="fo-door" x="-5" y="6" width="10" height="18" rx="2" />
            <g className="fo-gear" transform="translate(48,-32)">
              <circle r="9" className="fo-gear-c" />
              {[0, 60, 120].map(a => (
                <line key={a} x1="-13" y1="0" x2="13" y2="0" className="fo-gear-s" transform={`rotate(${a})`} />
              ))}
              <circle r="3" className="fo-gear-c" />
            </g>
            <text y="48" textAnchor="middle">基金管理人</text>
            <text y="64" textAnchor="middle" className="fo-sub">基金公司 · 管投资</text>
            </g>
          </g>

          {/* 基金托管人（银行金库） */}
          <g className={`fo-actor fo-actor-cus${lit === 'custodian' ? ' on' : ''}`} transform={`translate(${CUS.x},${CUS.y})`}>
            <g className="fo-bob">
            <ellipse className="fo-shadow" cx="0" cy="26" rx="48" ry="5.5" />
            <path className="fo-roof" d="M-46,-30 L0,-52 L46,-30 Z" />
            <rect className="fo-body" x="-40" y="-30" width="80" height="52" rx="5" />
            <line className="fo-col" x1="-28" y1="-24" x2="-28" y2="16" />
            <line className="fo-col" x1="28" y1="-24" x2="28" y2="16" />
            <circle className="fo-vault" cx="0" cy="-5" r="14" />
            <circle className="fo-vault-door" cx="0" cy="-5" r="14" />
            <circle className="fo-vault-knob" cx="0" cy="-5" r="5.5" />
            <text y="46" textAnchor="middle">基金托管人</text>
            <text y="62" textAnchor="middle" className="fo-sub">商业银行等 · 管钱管账</text>
            </g>
          </g>

          {/* 投资人 = 基金份额持有人 */}
          <g className={`fo-actor fo-actor-inv${lit === 'investor' ? ' on' : ''}`} transform={`translate(${INV.x},${INV.y})`}>
            <g className="fo-bob">
            <ellipse className="fo-shadow" cx="0" cy="27" rx="58" ry="5.5" />
            {[[-38, 8], [0, -4], [38, 8]].map(([dx, dy], i) => (
              <g key={i} className="fo-person" transform={`translate(${dx},${dy})`}>
                <circle className="fo-head" cy="-13" r="7" />
                <path className="fo-torso" d="M-11,10 C-11,-5 11,-5 11,10 Z" />
              </g>
            ))}
            <text y="44" textAnchor="middle">投资人</text>
            <text y="60" textAnchor="middle" className="fo-sub">基金份额持有人</text>
            </g>
          </g>

          {/* 证券市场 */}
          <g className={`fo-actor fo-actor-mkt${lit === 'market' ? ' on' : ''}`} transform={`translate(${MKT.x},${MKT.y})`}>
            <g className="fo-bob">
            <ellipse className="fo-shadow" cx="0" cy="41" rx="56" ry="5.5" />
            <rect className="fo-mkt-box" x="-54" y="-56" width="108" height="92" rx="10" />
            <line className="fo-axis" x1="-42" y1="26" x2="42" y2="26" />
            <line className="fo-axis" x1="-42" y1="26" x2="-42" y2="-46" />
            {[[-32, 18], [-6, 26], [20, 22]].map(([bx, h], i) => (
              <g key={i}>
                <line className="fo-mkt-wick" x1={bx + 6} y1={26 - h - 8} x2={bx + 6} y2={26 - h + 4} />
                <rect className={`fo-bar fo-b${i}`} x={bx} y={26 - h} width="12" height={h} rx="2" />
              </g>
            ))}
            <text y="60" textAnchor="middle">证券市场</text>
            <text y="76" textAnchor="middle" className="fo-sub">交易所</text>
            </g>
          </g>

          {/* ---- 道具层：默认隐身，由每一步的 build 唤出来 ---- */}
          <g className="fo-prop fo-blueprint" transform="translate(282,116)">
            <rect width="56" height="42" rx="4" />
            <text x="28" y="15" textAnchor="middle" className="fo-prop-t">合同·招募</text>
            {[0, 1, 2].map(i => <line key={i} className="fo-bp-line" x1="9" y1={24 + i * 6} x2="47" y2={24 + i * 6} />)}
          </g>
          <g className="fo-prop fo-order" transform="translate(346,140)">
            <rect width="46" height="26" rx="4" />
            <text x="23" y="17" textAnchor="middle" className="fo-prop-t">投资指令</text>
          </g>
          <g className="fo-prop fo-share" transform="translate(334,262)">
            <rect width="46" height="24" rx="4" />
            <text x="23" y="16" textAnchor="middle" className="fo-prop-t">基金份额</text>
          </g>
          <g className="fo-prop fo-ledger" transform="translate(448,296)">
            <rect width="36" height="28" rx="3" />
            <line x1="18" y1="0" x2="18" y2="28" className="fo-ldg-spine" />
            {[0, 1, 2].map(i => <line key={i} className="fo-ldg-line" x1="4" y1={7 + i * 7} x2="15" y2={7 + i * 7} />)}
            {[0, 1, 2].map(i => <line key={i} className="fo-ldg-line" x1="22" y1={7 + i * 7} x2="33" y2={7 + i * 7} />)}
          </g>
          <g className="fo-prop fo-scale" transform="translate(648,110)">
            <line x1="0" y1="0" x2="0" y2="18" className="fo-scale-post" />
            <g className="fo-beam">
              <line x1="-30" y1="0" x2="30" y2="0" className="fo-scale-post" />
              <path className="fo-pan" d="M-38,10 a8,6 0 0 0 16,0 Z" transform="translate(0,0)" />
              <path className="fo-pan" d="M22,10 a8,6 0 0 0 16,0 Z" />
            </g>
            <text y="34" textAnchor="middle" className="fo-prop-t">估值核算</text>
          </g>
          <g className="fo-prop fo-mega" transform="translate(296,56)">
            <path d="M0,10 L22,0 L22,26 L0,16 Z" className="fo-mega-b" />
            <line x1="3" y1="17" x2="6" y2="26" className="fo-mega-b" />
            <path className="fo-arc" d="M28,6 a11,11 0 0 1 0,14" />
            <path className="fo-arc" d="M34,1 a18,18 0 0 1 0,24" />
          </g>
          <g className="fo-prop fo-r1" transform="translate(350,136)">
            <rect width="30" height="22" rx="3" /><text x="15" y="15" textAnchor="middle" className="fo-prop-t">报告</text>
          </g>
          <g className="fo-prop fo-r2" transform="translate(404,134)">
            <rect width="30" height="22" rx="3" /><text x="15" y="15" textAnchor="middle" className="fo-prop-t">报告</text>
          </g>
          <g className="fo-prop fo-lock" transform={`translate(${CUS.x},${CUS.y - 30})`}>
            <path d="M-7,0 v-4 a7,7 0 0 1 14,0 v4" className="fo-lock-t" />
            <rect x="-9" y="0" width="18" height="14" rx="3" className="fo-lock-b" />
          </g>
          <g className="fo-prop fo-check" transform="translate(420,268)">
            <circle r="13" /><path d="M-5,0 l4,4 l7,-8" className="fo-check-m" />
          </g>
          <g className="fo-prop fo-done" transform="translate(380,212)">
            <circle r="30" /><path d="M-13,0 l9,10 l18,-20" className="fo-check-m" />
            <text y="50" textAnchor="middle" className="fo-prop-t">清算完成 · 按份额退还</text>
          </g>

          {/* 钱币池：¥ 代币，飞哪一步用哪几枚 */}
          {COINS.map((c, i) => (
            <g key={i} className={`fo-coin fo-c${i}`}>
              <circle r="11" className="fo-coin-b" />
              <text y="4" textAnchor="middle" className="fo-coin-t">¥</text>
            </g>
          ))}
        </svg>
      </div>

      {/* 九步时间轴：点哪步演哪步 */}
      <div className="fo-steps" role="tablist" aria-label="基金运作环节" ref={stepsRef}>
        {STEPS.map((s, i) => (
          <button key={s.t} role="tab" aria-selected={i === step} className={i === step ? 'on' : ''}
            onClick={() => jump(i)}>
            <i className="num">{i + 1}</i>{s.t}
          </button>
        ))}
      </div>

      {/* 当前这一步在讲什么 */}
      <div className="fo-caption card" key={step} aria-live="polite">
        <div className="row between">
          <b><span className="num fo-no">{step + 1}</span>{cur.t}</b>
          <span className="chip">{cur.tag}</span>
        </div>
        <p>{cur.d}</p>
        <div className="row between">
          <button className="btn-sm btn-ghost" disabled={step === 0} onClick={() => jump(step - 1)}>
            <Icon name="left" /> 上一步
          </button>
          {last
            ? <button className="btn-sm" onClick={() => {
                setAllowMotion(true); setStep(0); setPlaying(true); setRun(r => r + 1)
              }}>
                <Icon name="refresh" /> 再演一遍
              </button>
            : <button className="btn-sm" onClick={() => jump(step + 1)}>下一步 <Icon name="right" /></button>}
        </div>
      </div>


      {/* 参与主体速记：当事人 / 服务机构 / 监管，按科目二口径 */}
      <div className="card fo-parties">
        <b>参与主体对号入座</b>
        <dl>
          <dt>基金当事人</dt>
          <dd>基金管理人、基金托管人、基金份额持有人（投资人）——三方签在同一份基金合同上</dd>
          <dt>基金服务机构</dt>
          <dd>销售机构、份额登记机构、估值核算机构、投资顾问机构、基金评价机构、律师事务所、会计师事务所</dd>
          <dt>监管与自律</dt>
          <dd>中国证监会（监管）、基金业协会与证券交易所（自律管理）</dd>
        </dl>
      </div>
    </>
  )
}

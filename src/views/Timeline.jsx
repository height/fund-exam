import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/ui'
import { TIMELINE, TL_N as N, TRAPS } from '../data/timeline'
import { Md } from '../lib/format'

/*
 * 发展时间线：基金业从 1822 到今天的可考时点，一条竖轴滚到底。
 *
 * 分级不用星星用词：「必背 / 常考」直接说清要拿它怎么办，
 * 星星还得回头找图例——这页的读者是在背书，不是在看评分。
 * 了解级不挂标签，留白本身就是「这条不用背」。
 *
 * 年份轴常驻顶部，点一下跳到对应事件；反过来滚动时它也跟着走，
 * 所以任何时候都知道自己站在哪一年。
 */

const LEVEL = [null, { c: 'lv1', t: '常考' }, { c: 'lv2', t: '必背' }]
const yearOf = d => (d.match(/\d{4}/) || [d])[0]


function Tags({ g }) {
  const t = g.filter(x => x !== '必背')
  if (!t.length) return null
  return (
    <div className="tl-tags">
      {t.map(x => <span className={`chip ${x === '易错' ? 'alert' : ''}`} key={x}>{x}</span>)}
    </div>
  )
}

export default function Timeline({ go }) {
  const [key, setKey] = useState(true)   // 只看考试重点（默认开）
  const [n26, setN26] = useState(false)  // 只看 2026 更新点
  const [core, setCore] = useState(false)
  const [q, setQ] = useState('')
  const [mask, setMask] = useState(false)      // 盖住年份自测
  const [shown, setShown] = useState(() => new Set())
  const [active, setActive] = useState(null)
  const [flash, setFlash] = useState(null)

  const items = useRef({})
  const chips = useRef({})
  const rail = useRef(null)

  // 过滤后按阶段重新分组，年份轴和正文读的是同一份结果
  const eras = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return TIMELINE.map((e, ei) => ({
      ...e,
      items: e.items
        .map((it, ii) => ({ ...it, id: `${ei}-${ii}`, y: yearOf(it.d) }))
        .filter(it =>
          (!key || it.n26 || it.lv >= 1)
          && (!n26 || it.n26)
          && (!core || it.lv === 2)
          && (!kw || `${it.d}${it.t}${it.x}${it.g.join('')}`.toLowerCase().includes(kw))),
    })).filter(e => e.items.length)
  }, [key, n26, core, q])

  const count = eras.reduce((a, e) => a + e.items.length, 0)

  // 年份轴：同一阶段里同年只留第一条，指向那条事件
  const years = useMemo(() => eras.map(e => {
    let last = ''
    return {
      short: e.short,
      ys: e.items.filter(it => it.y !== last && (last = it.y)).map(it => ({
        y: it.y, id: it.id, core: it.lv === 2,
      })),
    }
  }), [eras])

  // 滚到哪条就点亮哪一年
  useEffect(() => {
    const io = new IntersectionObserver(es => {
      const hit = es.find(en => en.isIntersecting)
      if (hit) setActive(hit.target.dataset.id)
    }, { rootMargin: '-22% 0px -68% 0px' })
    Object.values(items.current).forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [eras])

  // 把当前年份滚进轴的中间。手动改 scrollLeft 而不是 scrollIntoView——
  // 后者在 Safari 上会顺手把整页也滚一下，正文位置就跳了
  useEffect(() => {
    const el = chips.current[active], box = rail.current
    if (el && box) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2
  }, [active])

  function jump(id) {
    items.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setFlash(id)
    setTimeout(() => setFlash(f => (f === id ? null : f)), 1200)
  }

  function reveal(id) {
    setShown(s => new Set(s).add(id))
  }

  return (
    <>
      {/* 这页没有底栏，顶栏的返回就是唯一出口——和年份轴一起钉在顶上，别让它滚走 */}
      <div className="tl-sticky">
        <header className="appbar">
          <button className="btn-sm btn-ghost" onClick={() => go('home')} aria-label="返回首页">
            <Icon name="back" />
          </button>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={key} className={key ? 'on' : ''} onClick={() => setKey(true)}>
              考试重点<small>{N.key}</small>
            </button>
            <button role="tab" aria-selected={!key} className={!key ? 'on' : ''} onClick={() => setKey(false)}>
              全部<small>{N.total}</small>
            </button>
          </div>
        </header>

        <div className="tl-years" ref={rail}>
          {years.map(g => (
            <span className="tl-yg" key={g.short}>
              <i>{g.short}</i>
              {g.ys.map(y => (
                <button key={y.id} ref={el => { chips.current[y.id] = el }}
                  className={`${active === y.id ? 'on' : ''}${y.core ? ' k' : ''}`}
                  onClick={() => jump(y.id)}>{y.y}</button>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="row tl-filters">
        <button className={`chip ${n26 ? 'on' : ''}`} onClick={() => setN26(v => !v)}>2026 更新 {N.n26}</button>
        <button className={`chip ${core ? 'on' : ''}`} onClick={() => setCore(v => !v)}>必背 {N.core}</button>
        <button className={`chip ${mask ? 'on' : ''}`}
          onClick={() => { setMask(v => !v); setShown(new Set()) }}>盖住年份</button>
        <input className="tl-search" type="search" value={q} placeholder="搜年份 / 法规"
          onChange={e => setQ(e.target.value)} aria-label="搜索时间线" />
      </div>

      <p className="muted tl-hint">
        {mask
          ? '年份已盖住，先自己想一遍再点开对答案。'
          : `${count} 条 · 挂「必背」的先背熟，「常考」的混个脸熟，没标的读一遍就行。`}
      </p>

      {eras.map(e => (
        <section key={e.name}>
          <h2 className="tl-era">
            <b>{e.name}</b><span>{e.yr}</span><span className="note">{e.note}</span>
          </h2>
          <ol className="tl">
            {e.items.map(it => {
              const lv = LEVEL[it.lv]
              const hide = mask && !shown.has(it.id)
              return (
                <li key={it.id} data-id={it.id} ref={el => { items.current[it.id] = el }}
                  className={`${lv ? lv.c : ''}${flash === it.id ? ' flash' : ''}`}>
                  <div className="tl-card">
                    <div className="tl-head">
                      {hide ? (
                        <button className="tl-date hidden" onClick={() => reveal(it.id)}>点开看年份</button>
                      ) : <span className="tl-date">{it.d}</span>}
                      {lv && <span className={`tl-lv ${lv.c}`}>{lv.t}</span>}
                      {it.n26 && <span className="tl-lv new">2026 更新</span>}
                    </div>
                    <div className="tl-t">{it.t}</div>
                    <div className="tl-x"><Md text={it.x} /></div>
                    {/* 「必背」已经在上面挂了级别标签，标签栏里再来一个就是重复 */}
                    <Tags g={it.g} />
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {count === 0 && (
        <div className="empty">
          <div><b>没有匹配的事件</b>换个词，或者把筛选去掉。</div>
          <button className="btn-sm" onClick={() => { setQ(''); setN26(false); setCore(false); setKey(false) }}>
            看全部 {N.total} 条
          </button>
        </div>
      )}

      <section className="section">
        <div className="section-head"><h2>易混考点速查</h2><span className="muted">考前扫一遍</span></div>
        <div className="stack">
          {TRAPS.map(t => (
            <details className="tl-trap" key={t.t}>
              <summary><b>{t.t}</b><span className="muted">{t.n}</span></summary>
              <Md text={t.md} />
            </details>
          ))}
        </div>
      </section>

      <footer className="colophon">
        <span>整理自官方教材历史沿革，并与题库里 31 道史实类真题的解析口径对齐。</span>
        <span>文件的「公布 / 施行」日期各版教材略有出入，做题以题干口径为准。</span>
      </footer>
    </>
  )
}

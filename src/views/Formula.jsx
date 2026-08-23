import { useEffect, useState } from 'react'
import { Icon } from '../components/ui'
import { CALC_IDS, qById } from '../lib/bank'
import formulas from '../data/formulas.json'

/*
 * 公式攻坚：计算题练习 + 公式图谱两个入口。
 * 科学计算器不在这儿挂——它跟着「可能要算」的页面走，统一在 App.jsx 里判断，
 * 否则点「开练」跳到 practice 之后，正要算题的那一刻计算器反而没了。
 *
 * 公式图谱是图片不是文字：源 PDF 是扫描件，一个字也抽不出来。
 * 图片放 public/formulas/ 按需加载，没有内联进 bundle——18 页 1.4MB，
 * 内联会把首屏从 1.2MB 撑到 3MB 往上。
 */
export default function Formula({ go }) {
  const [tab, setTab] = useState('drill')
  const [zoom, setZoom] = useState(null) // 正在全屏看的页码

  const qs = CALC_IDS.map(qById).filter(Boolean)
  const chapters = [...new Set(qs.map(q => q.chapter))]

  return (
    <>
      <header className="appbar">
        <button className="btn-sm btn-ghost" onClick={() => go('home')} aria-label="返回首页">
          <Icon name="back" />
        </button>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'drill'}
            className={tab === 'drill' ? 'on' : ''} onClick={() => setTab('drill')}>计算题</button>
          <button role="tab" aria-selected={tab === 'map'}
            className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>公式图谱</button>
        </div>
      </header>

      {tab === 'drill' ? (
        <>
          <div className="card">
            <div className="hero-top">
              <b className="hero-num">{qs.length}</b>
              <div className="hero-verdict">
                <b>道计算题</b>
                <span className="muted">全题库筛出来的，两科合在一起练</span>
              </div>
            </div>
            <button className="go go-seq" onClick={() => go('practice', { scope: 'calc', order: 'seq' })}>
              <Icon name="play" />
              <b>开练</b>
              <small>做错了直接翻公式图谱</small>
            </button>
          </div>

          <section className="section">
            <div className="section-head"><h2>涉及章节</h2><span className="muted">共 {chapters.length} 个</span></div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {chapters.map(c => (
                <span className="chip" key={c}>{c} {qs.filter(q => q.chapter === c).length}</span>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="muted map-hint">
            共 {formulas.pages.length} 页。点开可放大，横竖都能拖动；看过的页离线也能翻。
          </p>
          <div className="fx-list">
            {formulas.pages.map((f, i) => (
              <button className="fx-page" key={f} onClick={() => setZoom(i)} aria-label={`第 ${i + 1} 页，点击放大`}>
                <img src={`./formulas/${f}`} alt={`公式汇总第 ${i + 1} 页`} loading="lazy" />
                <span className="fx-no num">{i + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {zoom !== null && <PageZoom pages={formulas.pages} at={zoom} onClose={() => setZoom(null)} />}
    </>
  )
}

/**
 * 全屏看图。全局缩放被禁掉了（禁双击/双指放大），所以这里自带一个放大开关：
 * 「适应宽度」看整页，「放大」按 2.2 倍横竖滚动看细节。
 */
function PageZoom({ pages, at, onClose }) {
  const [i, setI] = useState(at)
  const [big, setBig] = useState(false)

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setI(v => Math.min(pages.length - 1, v + 1))
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [pages.length, onClose])

  return (
    <div className="fx-full" role="dialog" aria-modal="true" aria-label="公式图谱">
      <div className="fx-bar">
        <button className="btn-sm btn-ghost" onClick={onClose} aria-label="关闭"><Icon name="x" /></button>
        <span className="num muted">{i + 1} / {pages.length}</span>
        <button className="btn-sm" onClick={() => setBig(b => !b)}>{big ? '适应宽度' : '放大'}</button>
      </div>
      <div className={`fx-stage ${big ? 'big' : ''}`}>
        <img src={`./formulas/${pages[i]}`} alt={`公式汇总第 ${i + 1} 页`} />
      </div>
      <div className="fx-nav">
        <button disabled={i === 0} onClick={() => setI(i - 1)} aria-label="上一页"><Icon name="left" /></button>
        <button disabled={i === pages.length - 1} onClick={() => setI(i + 1)} aria-label="下一页"><Icon name="right" /></button>
      </div>
    </div>
  )
}

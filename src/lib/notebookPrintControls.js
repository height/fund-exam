// Included verbatim in the standalone export; no app runtime or API required.
(() => {
  document.querySelector('#back')?.addEventListener('click', event => {
    if (!window.__cheatsheetPopup) return
    event.preventDefault()
    window.close()
    // Browsers which refuse closing a tab still have a working return route.
    setTimeout(() => { location.href = event.currentTarget?.href || document.querySelector('#back').href }, 150)
  })
  const paper = document.querySelector('.paper')
  const print = document.querySelector('#print')
  const help = document.querySelector('#print-help')
  const frame = document.querySelector('.paper-frame')
  const preview = document.querySelector('.preview')
  const scale = document.querySelector('#scale')
  const figures = [...document.querySelectorAll('.nb-markdown svg,.nb-markdown img,.nb-diagram svg')]
  // Normalize canvas backgrounds only in this export; preserve colored nodes and source notes.
  for (const svg of figures.filter(figure => figure.tagName.toLowerCase() === 'svg')) {
    svg.style.setProperty('background', '#fff', 'important')
    const box = svg.viewBox.baseVal
    if (!(box.width > 0 && box.height > 0)) continue
    for (const rect of svg.querySelectorAll('rect')) {
      const coversCanvas = Math.abs(rect.x.baseVal.value - box.x) < 0.1
        && Math.abs(rect.y.baseVal.value - box.y) < 0.1
        && Math.abs(rect.width.baseVal.value - box.width) < 0.1
        && Math.abs(rect.height.baseVal.value - box.height) < 0.1
      if (coversCanvas) rect.style.setProperty('fill', '#fff', 'important')
    }
  }
  const fitFigures = () => {
    const sheet = document.querySelector('.sheet-columns')
    const css = getComputedStyle(sheet)
    const count = Number(css.columnCount) || 2
    const columnWidth = (sheet.clientWidth - (count - 1) * (parseFloat(css.columnGap) || 0)) / count
    for (const figure of figures) {
      const box = figure.viewBox?.baseVal
      const width = box?.width || figure.naturalWidth
      const height = box?.height || figure.naturalHeight
      if (!(width > 0 && height > 0)) continue
      // One scale factor for both dimensions: no distortion, cropping or enlarged bitmaps.
      const ratio = Math.min(columnWidth / width, 45 * 96 / 25.4 / height, 1)
      figure.style.width = `${width * ratio}px`
      figure.style.height = `${height * ratio}px`
    }
  }
  const fit = () => {
    fitFigures()
    document.querySelectorAll('.entry').forEach(entry => {
      entry.classList.toggle('allow-split', entry.offsetHeight > 360)
    })
    const available = preview.clientWidth - 24
    const ratio = scale.value === 'fit' ? Math.min(1, available / paper.offsetWidth) : Number(scale.value)
    paper.style.transform = `scale(${ratio})`
    frame.style.width = `${paper.offsetWidth * ratio}px`
    frame.style.height = `${paper.offsetHeight * ratio}px`
  }
  fit(); addEventListener('resize', fit)
  new ResizeObserver(fit).observe(paper)
  scale.addEventListener('change', fit)
  addEventListener('beforeprint', fitFigures)
  addEventListener('afterprint', fit)
  const images = [...document.images]
  images.forEach(img => { img.loading = 'eager'; img.addEventListener('load', fit) })
  print.addEventListener('click', async () => {
    print.disabled = true
    await Promise.race([
      Promise.all(images.map(img => img.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ])
    const missing = images.filter(img => !img.complete || !img.naturalWidth).length
    if (missing) help.textContent = `${missing} 张图片未加载，打印前请检查网络；文字、公式与内嵌 SVG 已保留。再次点击打印可继续。`
    print.disabled = false
    if (!missing || print.dataset.checked === 'true') window.print()
    print.dataset.checked = 'true'
  })
  document.querySelector('#download').addEventListener('click', () => {
    const html = '<!doctype html>\n' + document.documentElement.outerHTML
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = '基金从业-A4复习小抄.html'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  })
  if (images.some(img => /^https?:/.test(img.getAttribute('src') || ''))) help.textContent += ' 远程图片需联网，建议加载完成后另存 PDF。'
})()

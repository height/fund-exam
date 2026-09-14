// Included verbatim in the standalone export; no app runtime or API required.
(() => {
  const paper = document.querySelector('.paper')
  const columns = document.querySelector('#columns')
  const print = document.querySelector('#print')
  const help = document.querySelector('#print-help')
  const fit = () => { paper.style.zoom = Math.min(1, (innerWidth - 24) / (210 * 96 / 25.4)) }
  fit(); addEventListener('resize', fit)
  columns.addEventListener('change', () => {
    document.documentElement.style.setProperty('--columns', columns.value)
    for (const option of columns.options) option.defaultSelected = option.value === columns.value
  })
  const images = [...document.images]
  images.forEach(img => { img.loading = 'eager' })
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

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// sw 的缓存版本号跟 index.html 内容走：重新打包 -> 版本变 -> 下次联网自动换掉旧缓存
function serviceWorker() {
  return {
    name: 'sw',
    // index.html 由 vite 在所有 generateBundle 之后才落盘，所以在 writeBundle 里读它
    writeBundle(opts) {
      const dir = opts.dir
      const html = readFileSync(join(dir, 'index.html'))
      const v = createHash('sha256').update(html).digest('hex').slice(0, 12)
      writeFileSync(join(dir, 'sw.js'), `const V='q-${v}';
const FILES=['./','./index.html','./icon-180.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys()
  .then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true})
    .then(r=>r||fetch(e.request).catch(()=>caches.match('./index.html'))));
});
`)
    },
  }
}

// 页脚要显示的两个时间：构建时刻 + 题库文件最后一次改动
const buildTime = new Date().toISOString()
const bankTime = statSync('src/data/questions.json').mtime.toISOString()

export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BANK_TIME__: JSON.stringify(bankTime),
  },
  plugins: [react(), viteSingleFile(), serviceWorker()],
  build: { assetsInlineLimit: Infinity },
})

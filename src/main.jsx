import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './lib/store'
import './styles.css'

// iOS Safari 从 iOS 10 起就忽略 user-scalable=no，双指缩放只能拦这三个事件。
// 代价：低视力用户没法放大页面（WCAG 1.4.4）。删掉这段即可恢复。
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)

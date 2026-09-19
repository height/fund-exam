import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAnalytics } from './lib/analytics'
import { preventAppZoom } from './lib/preventAppZoom'
import { StoreProvider } from './lib/store'
import './styles.css'
import './appleDesign.css'

preventAppZoom()
initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)

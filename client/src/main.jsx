import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import PresentationPage from './pages/PresentationPage.jsx'
import './index.css' /* 👈 디자인을 불러오는 가장 핵심적인 줄입니다! */
import './App.css'
import './locales/i18n'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {window.location.pathname === '/ppt' ? <PresentationPage /> : <App />}
    </AppErrorBoundary>
  </React.StrictMode>,
)

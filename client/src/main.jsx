import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' /* 👈 디자인을 불러오는 가장 핵심적인 줄입니다! */
import './locales/i18n'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
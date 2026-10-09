import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PrivacyProvider } from './lib/privacy'
import './index.css'
import { loadPreferences } from './lib/desktop'

loadPreferences().then(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivacyProvider>
      <App />
    </PrivacyProvider>
  </React.StrictMode>
)).catch(error => {
  console.error(error)
  const root = document.getElementById('root')!
  root.textContent = 'Could not load your saved privacy settings. Please close and reopen AI Companion.'
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { store } from './store/store'
import { logout } from './store/slices/authSlice'
import { clearAuth } from './services/authService'
import { setUnauthorizedHandler } from './services/api'

setUnauthorizedHandler(() => {
  clearAuth()
  store.dispatch(logout())
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  if (path !== '/login') {
    window.location.href = '/login'
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

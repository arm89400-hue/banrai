import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import LanguageProvider from './i18n/LanguageProvider.jsx'
import './index.css'
import App from './App.jsx'

// App entry point: mounts App into #root, wrapped in the router (for
// navigation) and the auth provider (for shared login state).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)

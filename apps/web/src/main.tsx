import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import i18n from './i18n/config'
import App from './App.tsx'
import { AuthProvider } from './components/auth/AuthProvider'
import { FeedbackProvider } from './components/common/FeedbackProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
          {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </AuthProvider>
      </I18nextProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

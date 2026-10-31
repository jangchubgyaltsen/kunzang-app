import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-serif-tibetan/400.css'
import '@fontsource/noto-serif-tibetan/700.css'
import './index.css'
import App from './App.tsx'
import { requestPersistence } from './db.ts'

requestPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-serif-tibetan/400.css'
import '@fontsource/noto-serif-tibetan/700.css'
import './index.css'
import './redesign.css'
import App from './App.tsx'
import { requestPersistence } from './db.ts'
import { migrate } from './migrate.ts'

requestPersistence()

// 先把旧数据升级好再显示界面；升级出错也照常打开
migrate()
  .catch((e) => console.error('数据升级失败', e))
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )

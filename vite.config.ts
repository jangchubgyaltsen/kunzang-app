import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '仪轨偈颂 藏文学习',
        short_name: '偈颂藏文',
        lang: 'zh-CN',
        start_url: './',
        display: 'standalone',
        background_color: '#faf7f0',
        theme_color: '#8a2c1d',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,m4a,mp3}'],
        // 会话教材和偈颂词的发音太大，不预先缓存：用到才下载，下载过的存起来离线可用
        globIgnores: ['amdo/**', 'verse/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // 安多会话教材的录音和课文图片：用到才下载，下载过的存起来离线可用
            urlPattern: ({ url }) => url.pathname.includes('/amdo/'),
            handler: 'CacheFirst',
            options: { cacheName: 'amdo', expiration: { maxEntries: 5000 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/verse/w/'),
            handler: 'CacheFirst',
            options: { cacheName: 'verse-audio', expiration: { maxEntries: 4000 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // 颂词库有改动时，下次打开就换成新的
            urlPattern: ({ url }) => url.pathname.endsWith('/verse/verses.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'verse-text', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
})

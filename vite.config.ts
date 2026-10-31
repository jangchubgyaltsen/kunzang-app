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
        name: '普贤上师言教 藏文学习',
        short_name: '言教藏文',
        lang: 'zh-CN',
        start_url: './',
        display: 'standalone',
        background_color: '#faf7f0',
        theme_color: '#8a2c1d',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,m4a,mp3}'],
        // 全书原文和音频太大，不预先缓存：打开哪一章、听哪一句才下载，下载过的存起来离线可用
        globIgnores: ['book/**', 'amdo/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // 安多会话教材的录音和课文图片：用到才下载，下载过的存起来离线可用
            urlPattern: ({ url }) => url.pathname.includes('/amdo/'),
            handler: 'CacheFirst',
            options: { cacheName: 'amdo', expiration: { maxEntries: 5000 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/book/audio/'),
            handler: 'CacheFirst',
            options: { cacheName: 'book-audio', expiration: { maxEntries: 12000 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // 章节文本有改动时，下次打开就换成新的
            urlPattern: ({ url }) => /\/book\/ch\d+\.json$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'book-text', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
})

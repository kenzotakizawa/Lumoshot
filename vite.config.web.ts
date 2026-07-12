import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

// Web app build (static SPA → Cloudflare Pages). https://vite.dev/config/
export default defineConfig({
  // Web-only static assets (keeps the extension's manifest/_locales/guide out of dist/web)
  publicDir: resolve(__dirname, 'public-web'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon48.png', 'icons/icon128.png'],
      manifest: {
        name: 'Lumoshot — スクリーンショット注釈エディタ',
        short_name: 'Lumoshot',
        description: 'スクリーンショットに注釈をつけて、きれいに書き出す。すべてブラウザ内で処理。',
        theme_color: '#4f46e5',
        background_color: '#eef1f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon48.png', sizes: '48x48', type: 'image/png' },
          { src: 'icons/icon128.png', sizes: '128x128', type: 'image/png' },
          { src: 'icons/icon128.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache the app shell so editing works offline after first load.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // The /guide page's screenshots (~2.3MB) are documentation assets, not
        // part of the editing experience — don't force them into the initial
        // precache, they'll simply load from the network if /guide is visited.
        globIgnores: ['guide/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@platform': resolve(__dirname, 'src/platform/platform.web.ts'),
    },
  },
  build: {
    outDir: 'dist/web',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        guide: resolve(__dirname, 'guide.html'),
      },
    },
  },
})

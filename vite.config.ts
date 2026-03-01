import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        editor: resolve(__dirname, 'editor.html'),
        guide: resolve(__dirname, 'guide.html'),
        background: resolve(__dirname, 'src/background/background.ts'),
        capture: resolve(__dirname, 'src/content/capture.ts'),
        cropOverlay: resolve(__dirname, 'src/content/cropOverlay.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'capture') {
            return 'capture.js';
          }
          if (chunkInfo.name === 'cropOverlay') {
            return 'cropOverlay.js';
          }
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const previewApiTarget = process.env.VITE_PREVIEW_API_TARGET || 'http://127.0.0.1:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Demo / client delivery: do not emit source maps (no TS sources in DevTools).
    sourcemap: false,
  },
  preview: {
    port: 3000,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: previewApiTarget,
        changeOrigin: true,
      },
    },
  },
})

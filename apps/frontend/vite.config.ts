import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/v1': {
        // Docker 컨테이너 안에서는 BACKEND_URL=http://backend:3001, 로컬은 기본값 사용
        target: process.env.BACKEND_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // ✅ ВАЖНО: слушать на всех интерфейсах
    port: 5173,
    strictPort: true
  }
})
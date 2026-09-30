import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ตั้งค่า Vite: ใช้ปลั๊กอิน React และ Tailwind CSS
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // ส่งต่อคำขอ /api ไปที่ backend (Express) ตอนพัฒนาในเครื่อง
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})

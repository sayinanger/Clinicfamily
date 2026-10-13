import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ตั้งค่า Vite: ใช้ปลั๊กอิน React และ Tailwind CSS
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // O10ก: ngrok ชี้มาที่ Vite (5173) → ยอมให้เปิดผ่านโดเมน ngrok ได้ (Vite บล็อกโดเมนแปลกหน้าโดยค่าเริ่มต้น)
    // จุดนำหน้า = ทุกโดเมนย่อย เช่น xxx.ngrok-free.app (static domain แบบฟรี)
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'],
    // ส่งต่อคำขอไปที่ backend (Express พอร์ต 3000) ตอนพัฒนาในเครื่อง
    proxy: {
      '/api': 'http://localhost:3000',
      // webhook ของ LINE (LINE → ngrok → Vite → Express) — รอบ LINE ชุด O
      '/webhook': 'http://localhost:3000',
    },
  },
})

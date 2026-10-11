// จุดเริ่มต้นของ server (Express)
// รันด้วย npm run dev (ในโฟลเดอร์ server/) → เปิดที่ http://localhost:3000
// ค่าตั้งใน server/.env ถูกอ่านเข้า process.env ด้วย --env-file-if-exists (ดู scripts ใน package.json)
// หน้าเว็บ (Vite พอร์ต 5173) ส่งต่อทุกคำขอ /api มาที่นี่ (ดู client/vite.config.js)

import express from 'express'
import healthRouter from './routes/health.js'

const app = express()

// พอร์ตที่ server เปิด — อ่านจาก PORT ใน .env ถ้าไม่มีใช้ 3000
// (ค่าจาก .env เป็นข้อความเสมอ จึงแปลงเป็นตัวเลขด้วย Number · || = ถ้าทางซ้ายไม่มีค่าให้ใช้ทางขวา)
// ต้องตรงกับ Vite proxy ใน client/vite.config.js
const PORT = Number(process.env.PORT) || 3000

// ให้อ่าน body ที่ส่งมาเป็น JSON ได้ผ่าน req.body (เช่น username/password ตอน login)
app.use(express.json())

// ---------- เส้นทาง API ----------
// ทุกเส้นทางในไฟล์ routes/health.js จะขึ้นต้นด้วย /api
app.use('/api', healthRouter)
// (ขั้น G–J จะเพิ่ม routes/admin.js สำหรับ S1–S11 ตรงนี้)

// ---------- ไม่เจอ API ที่ขอ ----------
// มาถึงตรงนี้แปลว่าไม่มีเส้นทางไหนตรงเลย → ตอบ 404 ตามรูปแบบ error ใน docs/api-contract.md
app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'ไม่พบข้อมูล' })
})

// ---------- จัดการ error กลาง ----------
// ถ้าโค้ดใน route พัง (เช่น ต่อฐานข้อมูลไม่ได้) Express 5 จะส่ง error มาที่นี่เอง
// ฟังก์ชันจัดการ error ต้องมี 4 ตัวแปร (err, req, res, next) Express ถึงจะรู้ว่าเป็นตัวจัดการ error
app.use((err, req, res, next) => {
  console.error(err) // แสดงรายละเอียดใน Terminal ให้เราดู (ไม่ส่งให้ผู้ใช้เห็น)
  res.status(500).json({ code: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' })
})

// ---------- เริ่มรับคำขอ ----------
app.listen(PORT, () => {
  console.log(`Server พร้อมแล้ว → http://localhost:${PORT}/api/health`)
})

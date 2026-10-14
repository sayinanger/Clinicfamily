// จุดเริ่มต้นของ server (Express)
// รันด้วย npm run dev (ในโฟลเดอร์ server/) → เปิดที่ http://localhost:3000
// ค่าตั้งใน server/.env ถูกอ่านเข้า process.env ด้วย --env-file-if-exists (ดู scripts ใน package.json)
// ตอนพัฒนาบน Mac: หน้าเว็บ (Vite พอร์ต 5173) ส่งต่อทุกคำขอ /api มาที่นี่ (ดู client/vite.config.js)
// บน Render: server ตัวนี้เสิร์ฟหน้าเว็บที่ build แล้ว (client/dist) เองด้วย → โปรแกรมเดียว โดเมนเดียว (ดูหัวข้อ "หน้าเว็บ" ด้านล่าง)

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieSession from 'cookie-session'
import { now, toThaiIso } from './lib/clock.js'
import { SESSION_MAX_AGE_MS } from './lib/auth.js'
import { ensureSlots } from './services/slots.js'
import healthRouter from './routes/health.js'
import adminRouter from './routes/admin.js'
import userRouter from './routes/user.js'
import webhookRouter from './routes/webhook.js'
import demoRouter from './routes/demo.js'
import { warnLineAuthSettings } from './lib/lineAuth.js'
import { warnClinicSettings } from './lib/rules.js'
import { warnLineMessagingSettings } from './lib/lineMessages.js'
import { startScheduler } from './lib/reminders.js'

// ---------- เช็กคีย์ลับของ cookie ----------
// ไม่มีคีย์ = เซ็น cookie ไม่ได้ → หยุดตั้งแต่ตอนเปิด server (ไม่ใช้ค่าสำรองในโค้ด เพราะ repo เป็น Public ใครก็อ่านได้)
if (!process.env.SESSION_SECRET) {
  throw new Error(
    'ยังไม่ได้ตั้ง SESSION_SECRET → สร้างด้วยคำสั่ง node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" แล้วใส่ใน server/.env'
  )
}

// เตือนค่าตั้งของการยืนยันตัวตนผู้ป่วย (บัตรทดสอบเปิดอยู่ / ยังไม่ใส่ Channel ID ของ LINE)
warnLineAuthSettings()
// เตือนถ้ายังไม่ได้ตั้งเบอร์โทรคลินิก (CLINIC_PHONE) — server ยังเปิดได้ (M7ก)
warnClinicSettings()
// เตือนค่าตั้งของ LINE Messaging API (token, secret, LIFF ID, สวิตช์ส่งจริง) — รอบ LINE ชุด O
warnLineMessagingSettings()

const app = express()

// พอร์ตที่ server เปิด — อ่านจาก PORT ใน .env ถ้าไม่มีใช้ 3000
// (ค่าจาก .env เป็นข้อความเสมอ จึงแปลงเป็นตัวเลขด้วย Number · || = ถ้าทางซ้ายไม่มีค่าให้ใช้ทางขวา)
// ต้องตรงกับ Vite proxy ใน client/vite.config.js
const PORT = Number(process.env.PORT) || 3000

// webhook ของ LINE (POST /webhook) — ต้องมาก่อน express.json เพราะต้องอ่าน body แบบดิบไปตรวจลายเซ็น (ดู routes/webhook.js)
app.use(webhookRouter)

// ให้อ่าน body ที่ส่งมาเป็น JSON ได้ผ่าน req.body (เช่น username/password ตอน login)
app.use(express.json())

// cookie ของ staff (S1 ตั้ง / S2 ลบ / S3–S11 ตรวจ)
app.use(
  cookieSession({
    name: 'clinic_session',
    keys: [process.env.SESSION_SECRET], // คีย์ประทับตรา cookie — ใครแก้ cookie เองตราจะไม่ตรง
    maxAge: SESSION_MAX_AGE_MS, // 8 ชม. นับจาก login
    httpOnly: true, // โค้ดในหน้าเว็บอ่าน cookie ไม่ได้ (กันขโมยผ่านสคริปต์)
    sameSite: 'lax', // เว็บอื่นแอบส่งคำขอพร้อม cookie นี้ไม่ได้
    secure: false, // ยังไม่บังคับ https (localhost / Postman ใช้ได้) — ngrok เป็น https อยู่แล้ว
  })
)

// ติดเวลาของ server ไว้ที่ "หน้าซอง" (header) ของทุกคำตอบ
// หน้าเว็บใช้คำนวณ getNowMs() ให้ตัวนับถอยหลังตรงกับ server แม้ตั้ง DEMO_NOW (ดู docs/api-contract.md หัวข้อ 0)
// ใน Postman ดูได้ที่แท็บ Headers ของคำตอบ
app.use((req, res, next) => {
  res.set('X-Server-Now', toThaiIso(now()))
  next()
})

// ---------- เส้นทาง API ----------
// ทุกเส้นทางในไฟล์ routes/health.js จะขึ้นต้นด้วย /api
app.use('/api', healthRouter)
// API ฝั่ง staff S1–S3 (ขั้น H–J เพิ่ม S4–S11 ในไฟล์เดียวกัน)
app.use('/api', adminRouter)
// API ฝั่งผู้ป่วย U1–U11 — ยืนยันตัวตนด้วย LINE ID token
app.use('/api', userRouter)
// API โหมดเดโม D1 (ส่งเตือนทันที) — ปิดโหมดเดโมแล้วตอบ 404 (ชุด P)
app.use('/api', demoRouter)

// ---------- หน้าเว็บ (Render) ----------
// ถ้ามีโฟลเดอร์ client/dist (สร้างด้วย npm run build ที่โฟลเดอร์บนสุด) → server เสิร์ฟหน้าเว็บให้เอง
// - ไฟล์จริง (js, css, รูป) ส่งตามชื่อไฟล์
// - เส้นทางหน้าเว็บ เช่น /liff/booking, /admin/slots → ส่ง index.html แล้ว React Router เลือกหน้าเอง
// - /api และ /webhook ไม่ส่งหน้าเว็บ (ไม่เจอ → ตอบ 404 แบบ JSON ด้านล่างเหมือนเดิม)
// บน Mac ตอน npm run dev ปกติไม่มี client/dist → ข้ามส่วนนี้ ใช้หน้าเว็บจาก Vite เหมือนเดิม
const CLIENT_DIST = fileURLToPath(new URL('../client/dist', import.meta.url))
const CLIENT_INDEX = `${CLIENT_DIST}/index.html`
const HAS_CLIENT_BUILD = existsSync(CLIENT_INDEX)
if (HAS_CLIENT_BUILD) {
  app.use(express.static(CLIENT_DIST))
  app.use((req, res, next) => {
    const isPage = req.method === 'GET' || req.method === 'HEAD'
    const isServerPath = /^\/(api|webhook)(\/|$)/.test(req.path)
    if (!isPage || isServerPath) return next()
    res.sendFile(CLIENT_INDEX)
  })
}

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

// ---------- สร้างคิวล่วงหน้า 14 วัน ตอนเปิด server ----------
// (ระหว่างที่เปิดค้างไว้ จะสร้างเพิ่มเองตอนมีคนขอดูคิวในวันใหม่ — ขั้น I / สัปดาห์ 4)
// ถ้าต่อฐานข้อมูลไม่ได้ ยังเปิด server ต่อ (ดูสาเหตุได้จาก /api/health)
try {
  const created = await ensureSlots()
  console.log(`📅 เช็กคิวล่วงหน้า 14 วันแล้ว (สร้างใหม่ ${created} คิว) — เวลาระบบ ${toThaiIso(now()).slice(0, 16).replace('T', ' ')} น.`)
} catch (err) {
  console.error('สร้างคิวล่วงหน้าไม่สำเร็จ (จะลองใหม่ตอนมีคนขอดูคิว):', err.message)
}

// ---------- เริ่มรับคำขอ ----------
app.listen(PORT, () => {
  console.log(`Server พร้อมแล้ว → http://localhost:${PORT}/api/health`)
  if (HAS_CLIENT_BUILD) console.log('🌐 เสิร์ฟหน้าเว็บจาก client/dist ด้วย (/admin, /liff)')
  // เริ่มตัวตั้งเวลา ทุก 1 นาที: ส่งการ์ดเตือนก่อนนัด + ล้างคิวที่ถือค้าง (ชุด P — lib/reminders.js)
  startScheduler()
})

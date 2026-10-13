// เส้นทางเช็กว่า server + ฐานข้อมูลทำงานอยู่ (ไม่อยู่ใน API contract — ใช้ทดสอบ / เช็กก่อนเดโม)

import { Router } from 'express'
import { query } from '../db.js'
import { now, toThaiIso, isDemoTime } from '../lib/clock.js'
import { ALLOW_TEST_TOKEN } from '../lib/lineAuth.js'

const router = Router()

// GET /api/health → { ok, db, now, demo, testToken }
//   db   = เวลาจาก Supabase (UTC ลงท้าย Z) — ได้คำตอบแปลว่าต่อฐานข้อมูลติด
//   now  = เวลาที่ระบบใช้ตัดสินกฎ (จาก clock.js, เวลาไทย) — ตั้ง DEMO_NOW แล้วจะเห็นเวลาเดโมตรงนี้
//   demo = true เมื่อกำลังใช้เวลาเดโม
//   testToken = true เมื่อรับบัตรทดสอบ "test:..." อยู่ (ALLOW_TEST_TOKEN) — เช้าวันเดโมต้องเป็น false
// req = คำขอที่เข้ามา, res = คำตอบที่จะส่งกลับ · async + await = รอฐานข้อมูลตอบก่อนค่อยทำบรรทัดถัดไป
router.get('/health', async (req, res) => {
  // (ถ้าต่อไม่ติด Express 5 จะส่ง error ไปที่ตัวจัดการกลางใน index.js → ตอบ 500 SERVER_ERROR + แสดงสาเหตุใน Terminal)
  // SELECT now() ของฐานข้อมูลใช้ได้ตรงนี้ เพราะเป็นแค่การเช็กการเชื่อมต่อ ไม่ใช่กฎเวลา
  const result = await query('SELECT now() AS db_time')

  res.json({ ok: true, db: result.rows[0].db_time, now: toThaiIso(now()), demo: isDemoTime(), testToken: ALLOW_TEST_TOKEN })
})

export default router

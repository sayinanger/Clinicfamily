// เส้นทางเช็กว่า server + ฐานข้อมูลทำงานอยู่ (ไม่อยู่ใน API contract — ใช้ทดสอบ / เช็กก่อนเดโม)

import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/health → ตอบ { "ok": true, "db": "เวลาปัจจุบันจาก Supabase" }
// req = คำขอที่เข้ามา, res = คำตอบที่จะส่งกลับ
// async + await = รอฐานข้อมูลตอบก่อนค่อยทำบรรทัดถัดไป
router.get('/health', async (req, res) => {
  // ถามเวลาจากฐานข้อมูล — ถ้าได้คำตอบแปลว่าต่อ Supabase ติด
  // (ถ้าต่อไม่ติด Express 5 จะส่ง error ไปที่ตัวจัดการกลางใน index.js → ตอบ 500 SERVER_ERROR + แสดงสาเหตุใน Terminal)
  const result = await query('SELECT now() AS db_time')

  // db_time เป็นเวลาแบบสากล (UTC ลงท้าย Z) เช่น "2026-10-11T18:40:00.000Z" = 01:40 น. เวลาไทย
  res.json({ ok: true, db: result.rows[0].db_time })
})

export default router

// เส้นทางเช็กว่า server ทำงานอยู่ (ไม่อยู่ใน API contract — ใช้ทดสอบอย่างเดียว)

import { Router } from 'express'

const router = Router()

// GET /api/health → ตอบ { "ok": true }
// req = คำขอที่เข้ามา, res = คำตอบที่จะส่งกลับ
router.get('/health', (req, res) => {
  res.json({ ok: true})
  // (ขั้น C จะเพิ่ม: ถามเวลาจากฐานข้อมูล Supabase แล้วส่งกลับมาด้วย)
})

export default router

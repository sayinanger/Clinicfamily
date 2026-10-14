// API โหมดเดโม (docs/api-contract.md หัวข้อ 4) — ใช้ได้เฉพาะ DEMO_MODE=true
// ปิดโหมดเดโม → ตอบ 404 เหมือนไม่มีเส้นทางนี้
// เรียกจากหน้ารายการนัดของ staff → ต้อง login staff ด้วย (กันคนนอกกดส่งข้อความ)

import { Router } from 'express'
import { DEMO_MODE } from '../lib/clock.js'
import { requireStaff } from '../lib/auth.js'
import { sendReminderNow } from '../lib/reminders.js'
import { AppointmentError } from '../services/appointments.js'

const router = Router()

// ไม่ได้เปิดโหมดเดโม → 404 (เช็กก่อน login เพื่อให้ตอบเหมือนไม่มีเส้นทาง)
function requireDemoMode(req, res, next) {
  if (!DEMO_MODE) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'ไม่พบข้อมูล' })
  }
  next()
}

// D1. POST /api/demo/send-reminders — ส่ง { appointmentId, type } → { sent, status, sentAt }
router.post('/demo/send-reminders', requireDemoMode, requireStaff, async (req, res) => {
  try {
    res.json(await sendReminderNow(req.body))
  } catch (error) {
    if (!(error instanceof AppointmentError)) throw error
    res.status(error.status).json({ code: error.code, message: error.message, ...error.extra })
  }
})

export default router

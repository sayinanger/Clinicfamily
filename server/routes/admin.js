// API ฝั่ง staff (S1–S11) — ขั้น G: S1 login / S2 logout / S3 me · ขั้น H: S4–S6 รายการนัด
// ขั้น I: S7–S9 จัดการเวลา · (ขั้น J จะเพิ่ม S10–S11 ในไฟล์นี้)
// รูปแบบคำขอ/คำตอบตาม docs/api-contract.md หัวข้อ 2

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { requireStaff } from '../lib/auth.js'
import { nextOpenDay, isValidDateString } from '../lib/clock.js'
import { AppointmentError, listStaffAppointments, markNoShow, undoNoShow } from '../services/appointments.js'
import { SlotError, listAdminSlots, closeSlot, openSlot } from '../services/slots.js'

const router = Router()

// แถวจากตาราง staff (snake_case) → รูปแบบที่ส่งให้หน้าเว็บ (camelCase) — ไม่ส่งรหัสผ่านออกไปเด็ดขาด
function toStaff(row) {
  return { staffId: row.staff_id, name: row.name }
}

// S1. POST /api/admin/login — ส่ง { username, password }
router.post('/admin/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!username || !password) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' })
  }

  const result = await query('SELECT staff_id, password, name FROM staff WHERE username = $1', [username])
  const staff = result.rows[0]

  // bcrypt.compare = บดรหัสที่พิมพ์มาแล้วเทียบกับ hash ในตาราง (ไม่มีการถอดรหัสกลับ)
  // ชื่อผิด หรือรหัสผิด → ข้อความเดียวกัน (ไม่บอกว่าผิดช่องไหน คนเดาจะได้ไม่รู้ว่ามีชื่อนี้)
  const passwordOk = staff ? await bcrypt.compare(password, staff.password) : false
  if (!passwordOk) {
    return res.status(401).json({ code: 'INVALID_LOGIN', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
  }

  // ตั้ง cookie: เก็บแค่ staffId + เวลาที่ login (ชื่อไปอ่านจากตารางตอน S3)
  req.session = { staffId: staff.staff_id, loggedInAt: Date.now() }
  res.json({ staff: toStaff(staff) })
})

// S2. POST /api/admin/logout — ลบ cookie (กดซ้ำ / ยังไม่ login ก็ตอบ ok)
router.post('/admin/logout', (req, res) => {
  req.session = null
  res.json({ ok: true })
})

// S3. GET /api/admin/me — staff ที่ login อยู่ (หน้า admin เรียกทุกครั้งที่เปิด)
router.get('/admin/me', requireStaff, async (req, res) => {
  const result = await query('SELECT staff_id, name FROM staff WHERE staff_id = $1', [req.staffId])
  const staff = result.rows[0]
  if (!staff) {
    // cookie เก่าที่ไม่มี staff ในตารางแล้ว (เช่น หลัง db:reset ที่ยังไม่ seed) → ให้ login ใหม่
    req.session = null
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' })
  }
  res.json({ staff: toStaff(staff) })
})

// S4. GET /api/admin/appointments?date=YYYY-MM-DD — รายการนัดของวันที่เลือก
// ไม่ส่ง date → วันเปิดทำการถัดไป · วันไหนก็ได้ที่ไม่มีนัด (วันธรรมดา/ไกล) → [] · รูปแบบผิด → 400 (H1ก)
router.get('/admin/appointments', requireStaff, async (req, res) => {
  const date = readDateQuery(req, res)
  if (!date) return // ตอบ 400 ไปแล้ว
  res.json({ date, appointments: await listStaffAppointments(date) })
})

// อ่าน ?date= ของ S4 / S7 — ไม่ส่ง → วันเปิดทำการถัดไป · รูปแบบผิด → ตอบ 400 แล้วคืน null (H1ก, I1ก)
function readDateQuery(req, res) {
  const dateText = req.query.date
  if (dateText !== undefined && dateText !== '' && !isValidDateString(dateText)) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'รูปแบบวันที่ไม่ถูกต้อง',
      fields: { date: 'ต้องเป็นวันที่แบบ YYYY-MM-DD เช่น 2026-10-17' },
    })
    return null
  }
  return dateText || nextOpenDay()
}

// ส่ง error ที่ตั้งใจไว้ (เช่น NOT_YET_TIME, SLOT_PAST) เป็น { code, message } · error อื่นโยนต่อให้ตัวจัดการกลาง (500)
function sendKnownError(res, error) {
  if (!(error instanceof AppointmentError) && !(error instanceof SlotError)) throw error
  res.status(error.status).json({ code: error.code, message: error.message })
}

// S5. POST /api/admin/appointments/:id/no-show — กด [ไม่มา]
router.post('/admin/appointments/:id/no-show', requireStaff, async (req, res) => {
  try {
    res.json(await markNoShow(req.params.id))
  } catch (error) {
    sendKnownError(res, error)
  }
})

// S6. DELETE /api/admin/appointments/:id/no-show — กด [แก้คืน]
router.delete('/admin/appointments/:id/no-show', requireStaff, async (req, res) => {
  try {
    res.json(await undoNoShow(req.params.id))
  } catch (error) {
    sendKnownError(res, error)
  }
})

// S7. GET /api/admin/slots?date=YYYY-MM-DD — เวลาทั้งหมดของวัน (กฎวันที่เหมือน S4 — I1ก)
router.get('/admin/slots', requireStaff, async (req, res) => {
  const date = readDateQuery(req, res)
  if (!date) return // ตอบ 400 ไปแล้ว
  res.json({ date, slots: await listAdminSlots(date) })
})

// S8. POST /api/admin/slots/:id/close — กด [ปิด]
router.post('/admin/slots/:id/close', requireStaff, async (req, res) => {
  try {
    res.json(await closeSlot(req.params.id))
  } catch (error) {
    sendKnownError(res, error)
  }
})

// S9. POST /api/admin/slots/:id/open — กด [เปิด]
router.post('/admin/slots/:id/open', requireStaff, async (req, res) => {
  try {
    res.json(await openSlot(req.params.id))
  } catch (error) {
    sendKnownError(res, error)
  }
})

export default router

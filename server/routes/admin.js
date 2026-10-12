// API ฝั่ง staff (S1–S11) — ขั้น G: S1 login / S2 logout / S3 me
// (ขั้น H–J จะเพิ่ม S4–S11 ในไฟล์นี้)
// รูปแบบคำขอ/คำตอบตาม docs/api-contract.md หัวข้อ 2

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { requireStaff } from '../lib/auth.js'

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

export default router

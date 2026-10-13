// API ฝั่งผู้ป่วย (หน้า LIFF) — ขั้น L: U1–U3 · (ขั้น M: U4–U8 · ขั้น N: U9–U11 จะเพิ่มในไฟล์นี้)
// รูปแบบคำขอ/คำตอบตาม docs/api-contract.md หัวข้อ 3
//
// ลำดับการเช็กทุกครั้ง (contract หัวข้อ 0):
//   1) ตัวตน LINE (requirePatient)  → ไม่ผ่าน 401 UNAUTHORIZED
//   2) ยินยอม PDPA (requirePdpa)     → ยัง 403 PDPA_REQUIRED  (ยกเว้น U1, U2)
//   3) กรอกประวัติ (requireProfile)  → ยัง 403 PROFILE_REQUIRED (เฉพาะถือคิว/จอง/ยกเลิก/เลื่อน — ขั้น M, N)

import { Router } from 'express'
import { requirePatient } from '../lib/lineAuth.js'
import { findUserByLineId, getMe, acceptPdpa, validateProfile, saveProfile, toProfile } from '../services/users.js'

const router = Router()

// ด่านตรวจ PDPA: ต้องมีแถวใน users และกดยินยอมแล้ว → req.user = แถวของผู้ป่วย
export async function requirePdpa(req, res, next) {
  const user = await findUserByLineId(req.lineUserId)
  if (!user?.pdpa_accepted_at) {
    return res.status(403).json({ code: 'PDPA_REQUIRED', message: 'กรุณายินยอมการใช้ข้อมูลส่วนบุคคลก่อนใช้งาน' })
  }
  req.user = user
  next()
}

// ด่านตรวจประวัติ (ใช้หลัง requirePdpa) — ยังกรอกไม่ครบ → 403 PROFILE_REQUIRED (หน้าเว็บพาไปหน้าประวัติ)
export function requireProfile(req, res, next) {
  if (!toProfile(req.user)) {
    return res.status(403).json({ code: 'PROFILE_REQUIRED', message: 'กรุณากรอกประวัติส่วนตัวก่อนจองคิว' })
  }
  next()
}

// U1. GET /api/me — ข้อมูลของฉัน (ไม่เช็ก PDPA: ผู้ใช้ใหม่ต้องรู้ว่ายังไม่ยินยอม)
router.get('/me', requirePatient, async (req, res) => {
  res.json(await getMe(req.lineUserId))
})

// U2. POST /api/me/pdpa — กดยินยอม PDPA (ไม่เช็ก PDPA: ไม่งั้นคนใหม่กดยินยอมไม่ได้)
router.post('/me/pdpa', requirePatient, async (req, res) => {
  res.json(await acceptPdpa(req.lineUserId))
})

// U3. PUT /api/me/profile — บันทึกประวัติ ส่ง { firstName, lastName, gender, birthDate, phone }
router.put('/me/profile', requirePatient, requirePdpa, async (req, res) => {
  const fields = validateProfile(req.body)
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'กรุณากรอกข้อมูลให้ครบถ้วน', fields })
  }
  res.json(await saveProfile(req.user.user_id, req.body))
})

export default router

// งานเกี่ยวกับข้อมูลผู้ป่วย (ตาราง users) — ขั้น L: U1 ข้อมูลของฉัน / U2 ยินยอม PDPA / U3 บันทึกประวัติ
//
// กฎที่ใช้ (project-snapshot หมวด 5 + claude/u-decisions.md):
// - 1 บัญชี LINE = ผู้ป่วย 1 คน (users.line_user_id ไม่ซ้ำ)
// - สร้างแถว users ตอนกดยินยอม PDPA (U2) — เปิดแอปเฉย ๆ (U1) ไม่เขียนอะไรลงฐานข้อมูล (L6ข)
// - กดยินยอมซ้ำ → คงเวลาที่ยินยอมครั้งแรก (L7ก)
// - กรอก/แก้ประวัติได้หลังยินยอมแล้วเท่านั้น · ตรวจข้อมูลแบบเดียวกับ mock validateProfile + 2 กรณีเพิ่ม (L8ก)
// - ทุกเวลาปัจจุบันมาจาก clock.js (created_at, updated_at, pdpa_accepted_at, วันนี้ที่ใช้คิดอายุ)

import { query } from '../db.js'
import { now, toThaiIso, bangkokDateOf, isValidDateString } from '../lib/clock.js'

// ความยาวสูงสุดของชื่อ/นามสกุล (ตรงกับ VARCHAR(100) ใน schema.sql)
const MAX_NAME_LENGTH = 100

const GENDERS = ['male', 'female', 'unspecified']

const SELECT_USER = `
  SELECT user_id, line_user_id, first_name, last_name, gender, birth_date, phone, pdpa_accepted_at
  FROM users`

// หาผู้ป่วยจากรหัส LINE — ไม่เจอ (ยังไม่เคยยินยอม) → null
export async function findUserByLineId(lineUserId) {
  const result = await query(`${SELECT_USER} WHERE line_user_id = $1`, [lineUserId])
  return result.rows[0] || null
}

// อายุเต็มปี ณ วันนี้ (เวลาไทยจาก clock.js) เช่น เกิด 1966-05-20 · วันนี้ 2026-10-13 → 60
// เทียบข้อความ 'MM-DD' ได้เลย: ยังไม่ถึงวันเกิดของปีนี้ → ลบ 1
function calculateAge(birthDate, today) {
  let age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
  if (today.slice(5) < birthDate.slice(5)) age -= 1
  return age
}

// กรอกประวัติครบทุกช่องหรือยัง (แถวที่ถูกล้างข้อมูล PDPA จะเป็น null ทุกช่อง = ยังไม่ครบ)
function isProfileCompleted(row) {
  return Boolean(row && row.first_name && row.last_name && row.gender && row.birth_date && row.phone)
}

// แถวจากตาราง → ประวัติในรูปแบบ API (U1 / U3) · ยังกรอกไม่ครบ → null
export function toProfile(row) {
  if (!isProfileCompleted(row)) return null
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    birthDate: row.birth_date,
    age: calculateAge(row.birth_date, bangkokDateOf(now())),
    phone: row.phone,
  }
}

// U1 — ข้อมูลของฉัน (ไม่เช็ก PDPA) · ผู้ใช้ใหม่ → ยังไม่ยินยอม ไม่มีประวัติ
export async function getMe(lineUserId) {
  const user = await findUserByLineId(lineUserId)
  return {
    pdpaAccepted: Boolean(user?.pdpa_accepted_at),
    profileCompleted: isProfileCompleted(user),
    profile: toProfile(user),
  }
}

// U2 — กดยินยอม PDPA → { pdpaAcceptedAt }
// ยังไม่มีแถว → สร้างใหม่ · มีแถวแล้วแต่ยังไม่ยินยอม → ใส่เวลา · ยินยอมแล้ว → คงเวลาเดิม (L7ก)
// ใช้คำสั่งเดียว (INSERT ... ON CONFLICT) กดพร้อมกัน 2 ครั้งก็ได้แถวเดียว
export async function acceptPdpa(lineUserId) {
  const currentTime = now()
  const result = await query(
    `INSERT INTO users (line_user_id, pdpa_accepted_at, created_at, updated_at)
     VALUES ($1, $2, $2, $2)
     ON CONFLICT (line_user_id) DO UPDATE
       SET pdpa_accepted_at = COALESCE(users.pdpa_accepted_at, EXCLUDED.pdpa_accepted_at),
           updated_at = CASE WHEN users.pdpa_accepted_at IS NULL THEN EXCLUDED.updated_at ELSE users.updated_at END
     RETURNING pdpa_accepted_at`,
    [lineUserId, currentTime]
  )
  return { pdpaAcceptedAt: toThaiIso(result.rows[0].pdpa_accepted_at) }
}

// อ่านข้อความจาก body: ไม่ใช่ข้อความ (ไม่ส่ง / null / ตัวเลข) → '' (= ไม่ได้กรอก)
function readText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// ตรวจประวัติ (U3) — คืน { ชื่อช่อง: 'ข้อความผิด' } · ถูกหมด → {}
// ข้อความเหมือน mock validateProfile ใน client/src/lib/mock.js ทุกข้อ + 2 กรณีเพิ่ม (L8ก)
export function validateProfile(body) {
  const fields = {}
  const firstName = readText(body?.firstName)
  const lastName = readText(body?.lastName)
  const birthDate = readText(body?.birthDate)
  // เบอร์โทร: ไม่ส่ง / ว่าง = ไม่ได้กรอก · ส่งมาแต่ไม่ใช่ข้อความ (เช่น ตัวเลข 812345678) = รูปแบบผิด
  const phone = body?.phone ?? ''

  if (!firstName) fields.firstName = 'กรุณากรอกชื่อ'
  else if (firstName.length > MAX_NAME_LENGTH) fields.firstName = 'ชื่อยาวเกิน 100 ตัวอักษร'

  if (!lastName) fields.lastName = 'กรุณากรอกนามสกุล'
  else if (lastName.length > MAX_NAME_LENGTH) fields.lastName = 'นามสกุลยาวเกิน 100 ตัวอักษร'

  if (!GENDERS.includes(body?.gender)) fields.gender = 'กรุณาเลือกเพศ'

  if (!birthDate) {
    fields.birthDate = 'กรุณาเลือกวันเกิด'
  } else if (!isValidDateString(birthDate)) {
    // เพิ่มจาก mock: '20-05-1966', '2000-02-30' (มาจาก Postman — หน้าเว็บใช้ปฏิทิน)
    fields.birthDate = 'รูปแบบวันที่ไม่ถูกต้อง'
  } else if (birthDate > bangkokDateOf(now())) {
    // เทียบข้อความ 'YYYY-MM-DD' ได้เลย · "วันนี้" = วันที่ไทยจาก clock.js (ตาม DEMO_NOW)
    fields.birthDate = 'วันเกิดต้องไม่เป็นวันในอนาคต'
  }

  if (!phone) {
    fields.phone = 'กรุณากรอกเบอร์โทรศัพท์'
  } else if (typeof phone !== 'string' || !/^0\d{9}$/.test(phone)) {
    // ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0
    fields.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก'
  }
  return fields
}

// U3 — บันทึกประวัติ (ใช้ทั้งกรอกครั้งแรกและแก้ไข) · ต้องตรวจด้วย validateProfile ก่อนเรียก
// userId = ผู้ป่วยที่ผ่านด่าน PDPA แล้ว (routes/user.js)
export async function saveProfile(userId, body) {
  const result = await query(
    `UPDATE users
     SET first_name = $2, last_name = $3, gender = $4, birth_date = $5, phone = $6, updated_at = $7
     WHERE user_id = $1
     RETURNING user_id, first_name, last_name, gender, birth_date, phone, pdpa_accepted_at`,
    [userId, readText(body.firstName), readText(body.lastName), body.gender, readText(body.birthDate), body.phone, now()]
  )
  return { profile: toProfile(result.rows[0]) }
}

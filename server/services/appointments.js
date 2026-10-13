// งานเกี่ยวกับนัดหมาย (ตาราง appointments) — ขั้น H: ฝั่ง staff S4–S6 · ขั้น M: ฝั่งผู้ป่วย U8
// (ขั้น N: U9–U11 จะเพิ่มในไฟล์นี้)
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น H):
// - ปุ่ม [ไม่มา] กดได้เมื่อ "ถึงเวลานัด" (เวลาตอนนี้ ≥ เวลานัด) ย้อนหลังกี่วันก็ได้ (H3ก, H4ก)
// - ปุ่ม [แก้คืน] กดได้เมื่อ "ยังไม่ครบ 5 นาที" หลังกด [ไม่มา] (เวลาตอนนี้ < no_show_at + 5 นาที) (H4ก)
// - กด [ไม่มา] / [แก้คืน] ไม่เปลี่ยนสถานะคิว (time_slots คง booked)
// - ทุกครั้งที่แก้นัด ตั้ง updated_at = เวลาจาก clock.js

import { query } from '../db.js'
import { now, toThaiIso, bangkokTime } from '../lib/clock.js'
import { CHANGE_CUTOFF_MS, CLINIC_PHONE } from '../lib/rules.js'

// แก้คืนได้ภายใน 5 นาทีหลังกด [ไม่มา]
export const UNDO_NO_SHOW_MS = 5 * 60 * 1000

// เลข id ที่ใหญ่สุดของคอลัมน์ INTEGER (เกินนี้ถ้าส่งให้ฐานข้อมูลจะพังเป็น 500)
const MAX_INTEGER = 2147483647

// error ที่ตั้งใจตอบกลับ (route จะแปลงเป็น HTTP status + { code, message })
export class AppointmentError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

// คำสั่งอ่านนัดพร้อมเวลา (time_slots) และชื่อ/เบอร์ผู้ป่วย (users) — ใช้ร่วมกันทั้ง S4–S6
const SELECT_STAFF_APPOINTMENT = `
  SELECT a.appointment_id, a.status, a.no_show_at,
         u.first_name, u.last_name, u.phone,
         t.slot_date, t.start_time
  FROM appointments a
  JOIN time_slots t ON t.slot_id = a.slot_id
  JOIN users u ON u.user_id = a.user_id`

// แถวจากฐานข้อมูล → รูปแบบที่ส่งให้หน้าเว็บ (S4 ใน docs/api-contract.md)
// currentTime = เวลาจาก clock.js (ส่งเข้ามา เพื่อให้ทุกแถวในคำตอบเดียวกันใช้เวลาเดียวกัน)
export function toStaffAppointment(row, currentTime) {
  const appointmentTime = bangkokTime(row.slot_date, row.start_time)
  const undoUntil = row.no_show_at ? new Date(row.no_show_at.getTime() + UNDO_NO_SHOW_MS) : null

  const canMarkNoShow = row.status === 'booked' && currentTime >= appointmentTime
  const canUndoNoShow = row.status === 'no_show' && undoUntil !== null && currentTime < undoUntil

  return {
    appointmentId: row.appointment_id,
    // ผู้ป่วยที่ถูกล้างข้อมูล (anonymize) → null ตามจริง หน้าเว็บแสดง "—" เอง (H2ก)
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    date: row.slot_date,
    startTime: row.start_time.slice(0, 5), // '07:00:00' → '07:00'
    status: row.status,
    canMarkNoShow,
    canUndoNoShow,
    // ส่งเวลาหมดสิทธิ์แก้คืนเฉพาะตอนที่ยังแก้คืนได้ (เหมือน mock)
    undoNoShowUntil: canUndoNoShow ? toThaiIso(undoUntil) : null,
  }
}

// S4 — นัดทั้งหมดของวันที่เลือก (รวมนัดที่ยกเลิก)
// เรียง: เวลานัด → เวลาเดียวกันให้นัดที่ยังใช้งาน (ยืนยันแล้ว/ไม่มา) ขึ้นก่อนนัดที่ยกเลิก → ลำดับที่จอง (H6ก)
export async function listStaffAppointments(date) {
  const result = await query(
    `${SELECT_STAFF_APPOINTMENT}
     WHERE t.slot_date = $1
     ORDER BY t.start_time,
              CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END,
              a.appointment_id`,
    [date]
  )
  const currentTime = now()
  return result.rows.map((row) => toStaffAppointment(row, currentTime))
}

// แปลง id จาก URL เป็นตัวเลข — ไม่ใช่ตัวเลข / ใหญ่เกิน → 404 (H5ก)
function parseAppointmentId(idText) {
  const id = /^\d+$/.test(idText) ? Number(idText) : NaN
  if (!Number.isInteger(id) || id < 1 || id > MAX_INTEGER) {
    throw new AppointmentError(404, 'NOT_FOUND', 'ไม่พบนัดหมายนี้')
  }
  return id
}

// อ่านนัดตัวเดียว (ไม่เจอ → null)
async function findStaffAppointment(id) {
  const result = await query(`${SELECT_STAFF_APPOINTMENT} WHERE a.appointment_id = $1`, [id])
  return result.rows[0] ?? null
}

// S5 — กด [ไม่มา]: booked → no_show
// ใช้ UPDATE แบบมีเงื่อนไข (เช็กสถานะ + เวลา แล้วแก้ในคำสั่งเดียว) → กดพร้อมกัน 2 ที่ สำเร็จได้ครั้งเดียว
export async function markNoShow(idText) {
  const id = parseAppointmentId(idText)
  const currentTime = now()

  // $2 = เวลาจาก clock.js (ไม่ใช้ now() ของ SQL เพราะจะไม่ตาม DEMO_NOW)
  // (slot_date + start_time) AT TIME ZONE 'Asia/Bangkok' = เวลานัดแบบเวลาไทย
  const updated = await query(
    `UPDATE appointments a
     SET status = 'no_show', no_show_at = $2, updated_at = $2
     FROM time_slots t
     WHERE a.appointment_id = $1
       AND a.status = 'booked'
       AND t.slot_id = a.slot_id
       AND (t.slot_date + t.start_time) AT TIME ZONE 'Asia/Bangkok' <= $2::timestamptz`,
    [id, currentTime]
  )

  const row = await findStaffAppointment(id)
  if (updated.rowCount === 1) return toStaffAppointment(row, currentTime)

  // แก้ไม่สำเร็จ → หาเหตุผล (ลำดับตาม H5ก: ไม่มีนัด → สถานะไม่ใช่ → ยังไม่ถึงเวลา)
  if (!row) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่พบนัดหมายนี้')
  if (row.status !== 'booked') throw new AppointmentError(409, 'INVALID_STATUS', 'นัดนี้ไม่อยู่ในสถานะยืนยันแล้ว')
  throw new AppointmentError(409, 'NOT_YET_TIME', 'ยังไม่ถึงเวลานัด')
}

// S6 — กด [แก้คืน]: no_show → booked (ภายใน 5 นาทีหลังกด [ไม่มา])
export async function undoNoShow(idText) {
  const id = parseAppointmentId(idText)
  const currentTime = now()

  // ยังไม่ครบ 5 นาที: เวลาตอนนี้ < no_show_at + 5 นาที  ⇔  no_show_at > เวลาตอนนี้ − 5 นาที ($3)
  const undoFrom = new Date(currentTime.getTime() - UNDO_NO_SHOW_MS)
  const updated = await query(
    `UPDATE appointments
     SET status = 'booked', no_show_at = NULL, updated_at = $2
     WHERE appointment_id = $1
       AND status = 'no_show'
       AND no_show_at > $3`,
    [id, currentTime, undoFrom]
  )

  const row = await findStaffAppointment(id)
  if (updated.rowCount === 1) return toStaffAppointment(row, currentTime)

  if (!row) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่พบนัดหมายนี้')
  if (row.status !== 'no_show') throw new AppointmentError(409, 'INVALID_STATUS', 'นัดนี้ไม่อยู่ในสถานะไม่มา')
  throw new AppointmentError(409, 'UNDO_EXPIRED', 'เกิน 5 นาทีแล้ว แก้คืนไม่ได้')
}

// ---------- ขั้น M: U8 นัดของผู้ป่วย ----------
//
// นัด active (M1ก) = สถานะ booked และ "ยังไม่ถึงเวลาเริ่มนัด" (เส้นเดียวกับปุ่ม [ไม่มา] / "มา" ในสถิติ)
//   ถึงเวลานัดแล้ว = นัดนั้นจบ (มา หรือ staff กดไม่มา) → ผู้ป่วยจองนัดใหม่ได้
// ใช้ร่วมกับ U6 (กฎ "มีนัดอยู่แล้ว" / เลื่อนนัด) และ U9–U11 ในขั้น N

// เวลาเริ่มนัดแบบเวลาไทยใน SQL (แบบเดียวกับ S5)
const APPOINTMENT_START_SQL = `(t.slot_date + t.start_time) AT TIME ZONE 'Asia/Bangkok'`

// หานัด active ของผู้ป่วย (ไม่มี → null)
// db = ตัวส่งคำสั่ง (ปกติ query · ใน transaction ส่ง client.query มาแทน)
export async function findActiveAppointment(userId, currentTime, db = query) {
  const result = await db(
    `SELECT a.appointment_id, a.status, t.slot_date, t.start_time, t.end_time
     FROM appointments a
     JOIN time_slots t ON t.slot_id = a.slot_id
     WHERE a.user_id = $1
       AND a.status = 'booked'
       AND ${APPOINTMENT_START_SQL} > $2::timestamptz
     ORDER BY t.slot_date, t.start_time
     LIMIT 1`,
    [userId, currentTime]
  )
  return result.rows[0] ?? null
}

// เส้นตายยกเลิก/เลื่อน (Date) = เวลานัด − 15 นาที
export function changeDeadlineOf(date, startTime) {
  return new Date(bangkokTime(date, startTime).getTime() - CHANGE_CUTOFF_MS)
}

// แถวนัด → รูปแบบ U8 ใน docs/api-contract.md
// canChange = ตอนนี้ยังไม่ถึงเส้นตาย (นัด 07:30 → ทำได้ถึง 07:14:59, ตั้งแต่ 07:15 ไม่ได้)
export function toPatientAppointment(row, currentTime) {
  const deadline = changeDeadlineOf(row.slot_date, row.start_time)
  return {
    appointmentId: row.appointment_id,
    date: row.slot_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    status: row.status,
    canChange: currentTime < deadline,
    changeDeadline: toThaiIso(deadline),
  }
}

// U8 — นัดที่ยังใช้งานอยู่ของฉัน + เบอร์คลินิก (ไม่มีนัด → appointment: null)
export async function getMyAppointment(userId) {
  const currentTime = now()
  const row = await findActiveAppointment(userId, currentTime)
  return {
    appointment: row ? toPatientAppointment(row, currentTime) : null,
    clinicPhone: CLINIC_PHONE,
  }
}

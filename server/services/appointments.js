// งานเกี่ยวกับนัดหมาย (ตาราง appointments) — ขั้น H: ฝั่ง staff S4–S6 · ขั้น M: ฝั่งผู้ป่วย U8
// ขั้น N: ผู้ป่วยยืนยันการจอง U9, ยกเลิกนัด U10, เลื่อนนัด U11
//
// โครงฐานข้อมูลแบบใหม่ (4 พ.ย. 2569 — claude/snapshot-update-nov4.md):
// - appointments เก็บวัน (appointment_date) + เวลา (slot_time) ของนัดเอง ไม่มีตารางช่วงเวลา
// - สถานะ: held (กำลังถือคิว ≤ 5 นาที) → booked (ยืนยันแล้ว) → completed (ถึงเวลานัดแล้ว)
//          · no_show (staff กด [ไม่มา]) · cancelled (ผู้ป่วยยกเลิก)
// - completed = ถึงเวลานัดแล้ว และ staff ไม่ได้กด [ไม่มา] (นับเป็น "มาตามนัด")
//   cron เปลี่ยน booked → completed ทุก 1 นาที (lib/reminders.js) และโค้ดถือว่า
//   "booked ที่เลยเวลาแล้ว = completed" ทุกที่ ไม่ต้องรอ cron (319ก)
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น H):
// - ปุ่ม [ไม่มา] กดได้เมื่อ "ถึงเวลานัด" (เวลาตอนนี้ ≥ เวลานัด) ย้อนหลังกี่วันก็ได้ (H3ก, H4ก)
// - ปุ่ม [แก้คืน] กดได้เมื่อ "ยังไม่ครบ 5 นาที" หลังกด [ไม่มา] (เวลาตอนนี้ < no_show_at + 5 นาที) (H4ก)
// - ทุกครั้งที่แก้นัด ตั้ง updated_at = เวลาจาก clock.js

import { query, pool } from '../db.js'
import { now, toThaiIso, bangkokTime, slotEndTime } from '../lib/clock.js'
import { CHANGE_CUTOFF_MS, CLINIC_PHONE } from '../lib/rules.js'
import { toProfile } from './users.js'
import {
  notifyPatient,
  bookingConfirmedMessage,
  appointmentCancelledMessage,
  appointmentRescheduledMessage,
} from '../lib/lineMessages.js'

// แก้คืนได้ภายใน 5 นาทีหลังกด [ไม่มา]
export const UNDO_NO_SHOW_MS = 5 * 60 * 1000

// เลข id ที่ใหญ่สุดของคอลัมน์ INTEGER (เกินนี้ถ้าส่งให้ฐานข้อมูลจะพังเป็น 500)
const MAX_INTEGER = 2147483647

// เวลาเริ่มนัดแบบเวลาไทยใน SQL — (วันนัด + เวลานัด) AT TIME ZONE = เวลาไทย
export const APPOINTMENT_START_SQL = `(appointment_date + slot_time) AT TIME ZONE 'Asia/Bangkok'`

// error ที่ตั้งใจตอบกลับ (route จะแปลงเป็น HTTP status + { code, message })
// extra = ข้อมูลแนบในคำตอบ (ขั้น N: HAS_ACTIVE_APPOINTMENT แนบ appointment แบบเดียวกับ U6)
export class AppointmentError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

// ---------- ตัวช่วยที่ใช้ร่วมกับ services/slots.js ----------

// รหัสช่วงเวลา (slotId) ที่ส่งให้หน้าเว็บ = ข้อความวัน-เวลา เช่น '2026-11-08T07:30' (320ก)
export function slotKeyOf(date, time) {
  return `${date}T${time.slice(0, 5)}`
}

// ล็อกตามข้อความ (เช่น วัน-เวลา หรือผู้ป่วย) จนจบ transaction — คำขอที่ล็อกข้อความเดียวกันต้องรอคิว ("ปากกาด้ามเดียว")
// ใช้กันการปิดช่วงเวลากับการถือคิวชนกัน (อยู่คนละตาราง Constraint ข้ามตารางไม่ได้)
export function lockKey(db, text) {
  return db('SELECT pg_advisory_xact_lock(hashtext($1))', [text])
}

// ทำงานใน transaction: work(db) ได้ตัวส่งคำสั่ง db(text, params) ที่อยู่ใน transaction เดียวกัน
// สำเร็จ → COMMIT · error ใด ๆ (รวม error ที่ตั้งใจ throw) → ROLLBACK แล้วส่ง error ต่อ
export async function inTransaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work((text, params) => client.query(text, params))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

// error จากฐานข้อมูลเพราะชน UNIQUE (เช่น 2 คนถือช่วงเดียวกันพร้อมกัน)
export function isUniqueViolation(error) {
  return error?.code === '23505'
}

// ---------- S4–S6 ฝั่ง staff ----------

// คำสั่งอ่านนัดพร้อมชื่อ/เบอร์ผู้ป่วย (users) — ใช้ร่วมกันทั้ง S4–S6
const SELECT_STAFF_APPOINTMENT = `
  SELECT a.appointment_id, a.status, a.no_show_at, a.appointment_date, a.slot_time,
         u.first_name, u.last_name, u.phone
  FROM appointments a
  JOIN users u ON u.user_id = a.user_id`

// แถวจากฐานข้อมูล → รูปแบบที่ส่งให้หน้าเว็บ (S4 ใน docs/api-contract.md)
// currentTime = เวลาจาก clock.js (ส่งเข้ามา เพื่อให้ทุกแถวในคำตอบเดียวกันใช้เวลาเดียวกัน)
// completed ส่งออกเป็น 'booked' → หน้าเว็บแสดง "ยืนยันแล้ว" + ปุ่ม [ไม่มา] เหมือนเดิม (หน้าจอไม่เปลี่ยน)
export function toStaffAppointment(row, currentTime) {
  const appointmentTime = bangkokTime(row.appointment_date, row.slot_time)
  const undoUntil = row.no_show_at ? new Date(row.no_show_at.getTime() + UNDO_NO_SHOW_MS) : null
  const status = row.status === 'completed' ? 'booked' : row.status

  const canMarkNoShow = status === 'booked' && currentTime >= appointmentTime
  const canUndoNoShow = status === 'no_show' && undoUntil !== null && currentTime < undoUntil

  return {
    appointmentId: row.appointment_id,
    // ผู้ป่วยที่ถูกล้างข้อมูล (anonymize) → null ตามจริง หน้าเว็บแสดง "—" เอง (H2ก)
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    date: row.appointment_date,
    startTime: row.slot_time.slice(0, 5), // '07:00:00' → '07:00'
    status,
    canMarkNoShow,
    canUndoNoShow,
    // ส่งเวลาหมดสิทธิ์แก้คืนเฉพาะตอนที่ยังแก้คืนได้ (เหมือน mock)
    undoNoShowUntil: canUndoNoShow ? toThaiIso(undoUntil) : null,
  }
}

// S4 — นัดทั้งหมดของวันที่เลือก (รวมนัดที่ยกเลิก · ไม่รวม held เพราะยังไม่ใช่นัด)
// เรียง: เวลานัด → เวลาเดียวกันให้นัดที่ยังใช้งาน (ยืนยันแล้ว/ไม่มา) ขึ้นก่อนนัดที่ยกเลิก → ลำดับที่จอง (H6ก)
export async function listStaffAppointments(date) {
  const result = await query(
    `${SELECT_STAFF_APPOINTMENT}
     WHERE a.appointment_date = $1 AND a.status <> 'held'
     ORDER BY a.slot_time,
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

// อ่านนัดตัวเดียว (ไม่เจอ / เป็นแค่การถือคิว → null)
async function findStaffAppointment(id) {
  const result = await query(`${SELECT_STAFF_APPOINTMENT} WHERE a.appointment_id = $1 AND a.status <> 'held'`, [id])
  return result.rows[0] ?? null
}

// S5 — กด [ไม่มา]: booked ที่ถึงเวลาแล้ว หรือ completed → no_show
// ใช้ UPDATE แบบมีเงื่อนไข (เช็กสถานะ + เวลา แล้วแก้ในคำสั่งเดียว) → กดพร้อมกัน 2 ที่ สำเร็จได้ครั้งเดียว
export async function markNoShow(idText) {
  const id = parseAppointmentId(idText)
  const currentTime = now()

  // $2 = เวลาจาก clock.js (ไม่ใช้ now() ของ SQL เพราะจะไม่ตาม DEMO_NOW)
  const updated = await query(
    `UPDATE appointments
     SET status = 'no_show', no_show_at = $2, updated_at = $2
     WHERE appointment_id = $1
       AND status IN ('booked', 'completed')
       AND ${APPOINTMENT_START_SQL} <= $2::timestamptz`,
    [id, currentTime]
  )

  const row = await findStaffAppointment(id)
  if (updated.rowCount === 1) return toStaffAppointment(row, currentTime)

  // แก้ไม่สำเร็จ → หาเหตุผล (ลำดับตาม H5ก: ไม่มีนัด → สถานะไม่ใช่ → ยังไม่ถึงเวลา)
  if (!row) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่พบนัดหมายนี้')
  if (row.status !== 'booked' && row.status !== 'completed') {
    throw new AppointmentError(409, 'INVALID_STATUS', 'นัดนี้ไม่อยู่ในสถานะยืนยันแล้ว')
  }
  throw new AppointmentError(409, 'NOT_YET_TIME', 'ยังไม่ถึงเวลานัด')
}

// S6 — กด [แก้คืน]: no_show → completed (ภายใน 5 นาทีหลังกด [ไม่มา] · กด [ไม่มา] ได้หลังถึงเวลานัดเท่านั้น)
export async function undoNoShow(idText) {
  const id = parseAppointmentId(idText)
  const currentTime = now()

  // ยังไม่ครบ 5 นาที: เวลาตอนนี้ < no_show_at + 5 นาที  ⇔  no_show_at > เวลาตอนนี้ − 5 นาที ($3)
  const undoFrom = new Date(currentTime.getTime() - UNDO_NO_SHOW_MS)
  const updated = await query(
    `UPDATE appointments
     SET status = 'completed', no_show_at = NULL, updated_at = $2
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

// หานัด active ของผู้ป่วย (ไม่มี → null)
// db = ตัวส่งคำสั่ง (ปกติ query · ใน transaction ส่งตัวของ transaction มาแทน)
export async function findActiveAppointment(userId, currentTime, db = query) {
  const result = await db(
    `SELECT appointment_id, status, appointment_date, slot_time
     FROM appointments
     WHERE user_id = $1
       AND status = 'booked'
       AND ${APPOINTMENT_START_SQL} > $2::timestamptz
     ORDER BY appointment_date, slot_time
     LIMIT 1`,
    [userId, currentTime]
  )
  return result.rows[0] ?? null
}

// นัด booked ของผู้ป่วยที่ถึงเวลาแล้วแต่ cron ยังไม่ทันเปลี่ยน → completed ทันที (319ก "เช็กก่อนทำ")
// ต้องทำก่อนเปลี่ยนนัดใหม่เป็น booked ไม่อย่างนั้นชนกฎ "1 คน booked ได้ 1" (one_booked_per_user)
async function completePastBookings(userId, currentTime, db) {
  await db(
    `UPDATE appointments
     SET status = 'completed', updated_at = $2
     WHERE user_id = $1
       AND status = 'booked'
       AND ${APPOINTMENT_START_SQL} <= $2::timestamptz`,
    [userId, currentTime]
  )
}

// เส้นตายยกเลิก/เลื่อน (Date) = เวลานัด − 15 นาที
export function changeDeadlineOf(date, time) {
  return new Date(bangkokTime(date, time).getTime() - CHANGE_CUTOFF_MS)
}

// แถวนัด → รูปแบบ U8 ใน docs/api-contract.md
// canChange = ตอนนี้ยังไม่ถึงเส้นตาย (นัด 07:30 → ทำได้ถึง 07:14:59, ตั้งแต่ 07:15 ไม่ได้)
export function toPatientAppointment(row, currentTime) {
  const deadline = changeDeadlineOf(row.appointment_date, row.slot_time)
  return {
    appointmentId: row.appointment_id,
    date: row.appointment_date,
    startTime: row.slot_time.slice(0, 5),
    endTime: slotEndTime(row.slot_time),
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

// ---------- ขั้น N: U9 ยืนยันการจอง · U10 ยกเลิกนัด · U11 เลื่อนนัด ----------
//
// - ยืนยัน (U9/U11) ไม่ตรวจกฎเวลาซ้ำ ตรวจแค่ "ช่วงที่ส่งมาเป็นช่วงที่ตัวเองถืออยู่ และยังไม่หมดเวลาถือ"
//   (เวลาหมดถือ hold_expires_at การันตีกฎ 10 นาทีก่อนนัด / เส้นตายนัดเดิมไว้แล้วตอน U6)
//   slotId ไม่ตรงช่วงที่ถือ / ไม่ส่ง / รูปแบบผิด → 410 HOLD_EXPIRED (N3ก)
// - ทุกงานทำใน transaction เดียว และล็อกตามผู้ป่วย (กดจาก 2 หน้าพร้อมกัน → ทำทีละคำขอ)
// - ส่งข้อความ LINE หลัง COMMIT เท่านั้น — ส่งไม่ได้ก็ไม่กระทบการจอง (N1ก, N2ก ใน lib/lineMessages.js)
// - UPDATE ตั้ง updated_at จากเวลา clock.js (ใช้คำนวณ "นัดกระชั้น" — การ์ดเตือนใช้ค่าที่ใหม่กว่าระหว่าง created_at กับ updated_at)

const HOLD_EXPIRED_BOOK = 'หมดเวลายืนยันการจอง คิวถูกปล่อยให้ผู้อื่นจองได้แล้ว'
const HOLD_EXPIRED_RESCHEDULE = 'หมดเวลายืนยันการเลื่อนนัด คิวถูกปล่อยให้ผู้อื่นจองได้แล้ว'

// slotId จาก body ('YYYY-MM-DDTHH:MM') → { date, time } · รูปแบบผิด → 410 HOLD_EXPIRED (ถือว่าไม่ใช่ช่วงที่ถืออยู่ — N3ก)
function parseHeldSlotKey(value, expiredMessage) {
  const match = typeof value === 'string' ? value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/) : null
  if (!match) throw new AppointmentError(410, 'HOLD_EXPIRED', expiredMessage)
  return { date: match[1], time: match[2] }
}

// แถว held ของฉันที่ช่วงนี้ และยังไม่หมดเวลาถือ (ไม่มี → null)
async function findMyHold(db, userId, slot, currentTime) {
  const result = await db(
    `SELECT appointment_id
     FROM appointments
     WHERE user_id = $1 AND status = 'held'
       AND appointment_date = $2 AND slot_time = $3
       AND hold_expires_at > $4`,
    [userId, slot.date, slot.time, currentTime]
  )
  return result.rows[0] ?? null
}

// error เลยเส้นตายยกเลิก/เลื่อน (ข้อความเดียวกับ mock และ U6)
function tooLateToChangeError(deadline) {
  const deadlineText = toThaiIso(deadline).slice(11, 16)
  return new AppointmentError(409, 'TOO_LATE_TO_CHANGE', `ยกเลิกหรือเลื่อนนัดได้ก่อน ${deadlineText} น. เท่านั้น หากมาไม่ได้ กรุณาโทรแจ้งคลินิก`)
}

// U9 — ยืนยันการจอง ส่ง { slotId } (ต้องเป็นช่วงที่ถือไว้ด้วย U6) → { appointment } แบบ U8
// ลำดับ (ตาม mock): ช่วงที่ถือ (410 HOLD_EXPIRED) → มีนัดอยู่แล้ว (409 HAS_ACTIVE_APPOINTMENT)
// แถว held เดิม → booked (ล้าง hold_expires_at) · created_at คงเป็นเวลากดเลือก · updated_at = เวลายืนยัน
export async function createAppointment(user, body) {
  const currentTime = now()
  const slot = parseHeldSlotKey(body?.slotId, HOLD_EXPIRED_BOOK)

  const row = await inTransaction(async (db) => {
    await lockKey(db, `user ${user.user_id}`)

    const hold = await findMyHold(db, user.user_id, slot, currentTime)
    if (!hold) throw new AppointmentError(410, 'HOLD_EXPIRED', HOLD_EXPIRED_BOOK)

    // เช็กซ้ำใน transaction (เช่น เปิด 2 หน้าแล้วกดจองทั้งคู่) → ROLLBACK แถว held ยังอยู่เหมือนเดิม
    const active = await findActiveAppointment(user.user_id, currentTime, db)
    if (active) {
      throw new AppointmentError(409, 'HAS_ACTIVE_APPOINTMENT', 'คุณมีนัดอยู่แล้ว', {
        appointment: toPatientAppointment(active, currentTime),
      })
    }

    // นัดเก่าที่ถึงเวลาแล้วแต่ยังเป็น booked → completed ก่อน (กฎ 1 คน booked ได้ 1)
    await completePastBookings(user.user_id, currentTime, db)

    const updated = await db(
      `UPDATE appointments
       SET status = 'booked', hold_expires_at = NULL, updated_at = $2
       WHERE appointment_id = $1 AND status = 'held'
       RETURNING appointment_id, status, appointment_date, slot_time`,
      [hold.appointment_id, currentTime]
    )
    return updated.rows[0]
  })

  const appointment = toPatientAppointment(row, currentTime)
  await notifyPatient(user.line_user_id, bookingConfirmedMessage(toProfile(user), appointment))
  return { appointment }
}

// U10 — ยกเลิกนัดของฉัน → { appointment: { ...status: 'cancelled', canChange: false } }
// ไม่มีนัด → 404 · ถึงเส้นตาย (นัด − 15 นาที) แล้ว → 409 TOO_LATE_TO_CHANGE
// นัด → cancelled (ไม่ลบแถว) · ลบแถว held ของฉันด้วย (เช่น ถือเวลาไว้จะเลื่อน แล้วเปลี่ยนใจยกเลิก — แบบ mock)
export async function cancelMyAppointment(user) {
  const currentTime = now()

  const active = await inTransaction(async (db) => {
    await lockKey(db, `user ${user.user_id}`)

    const found = await findActiveAppointment(user.user_id, currentTime, db)
    if (!found) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะยกเลิก')
    const deadline = changeDeadlineOf(found.appointment_date, found.slot_time)
    if (currentTime >= deadline) throw tooLateToChangeError(deadline)

    const updated = await db(
      `UPDATE appointments
       SET status = 'cancelled', updated_at = $2
       WHERE appointment_id = $1 AND status = 'booked'
       RETURNING appointment_id`,
      [found.appointment_id, currentTime]
    )
    // มีคนแก้นัดนี้ไปก่อนเสี้ยววินาที → ไม่มีนัดให้ยกเลิกแล้ว
    if (updated.rowCount !== 1) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะยกเลิก')

    await db(`DELETE FROM appointments WHERE user_id = $1 AND status = 'held'`, [user.user_id])
    return found
  })

  const appointment = { ...toPatientAppointment(active, currentTime), status: 'cancelled', canChange: false }
  await notifyPatient(user.line_user_id, appointmentCancelledMessage(appointment))
  return { appointment }
}

// U11 — ยืนยันการเลื่อนนัด ส่ง { slotId } (ต้องถือช่วงใหม่ไว้ด้วย U6 purpose: reschedule)
// → { appointment: เวลาใหม่, previous: { date, startTime } }
// ลำดับ (ตาม mock): ไม่มีนัด (404) → ช่วงที่ถือ (410 HOLD_EXPIRED) → เลยเส้นตายนัดเดิม (409 — กันไว้เฉย ๆ
//   ปกติไม่เกิด เพราะ U6 ตั้งเวลาหมดถือไม่เกินเส้นตายนัดเดิมแล้ว)
// ลบแถว held → แก้วัน/เวลาในแถวนัดเดิม (id เดิม) → ลบข้อความเตือนของนัดนี้ (cron จะส่งใหม่ตามเวลาใหม่)
export async function rescheduleMyAppointment(user, body) {
  const currentTime = now()

  const { row, previous } = await inTransaction(async (db) => {
    await lockKey(db, `user ${user.user_id}`)

    const active = await findActiveAppointment(user.user_id, currentTime, db)
    if (!active) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะเลื่อน')

    const slot = parseHeldSlotKey(body?.slotId, HOLD_EXPIRED_RESCHEDULE)
    // ล็อกช่วงใหม่ด้วย (ระหว่างลบ held แล้วย้ายนัดมา ห้ามคนอื่นแทรก)
    await lockKey(db, `slot ${slotKeyOf(slot.date, slot.time)}`)
    const hold = await findMyHold(db, user.user_id, slot, currentTime)
    if (!hold) throw new AppointmentError(410, 'HOLD_EXPIRED', HOLD_EXPIRED_RESCHEDULE)

    const deadline = changeDeadlineOf(active.appointment_date, active.slot_time)
    if (currentTime >= deadline) throw tooLateToChangeError(deadline)

    // ต้องลบ held ก่อน ไม่อย่างนั้นวัน-เวลาเดียวกันมี held + booked = ชนกฎ 1 (one_active_per_slot)
    await db(`DELETE FROM appointments WHERE appointment_id = $1 AND status = 'held'`, [hold.appointment_id])

    const updated = await db(
      `UPDATE appointments
       SET appointment_date = $2, slot_time = $3, updated_at = $4
       WHERE appointment_id = $1 AND status = 'booked'
       RETURNING appointment_id, status, appointment_date, slot_time`,
      [active.appointment_id, slot.date, slot.time, currentTime]
    )
    if (updated.rowCount !== 1) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะเลื่อน')

    await db(`DELETE FROM notifications WHERE appointment_id = $1`, [active.appointment_id])

    return {
      row: updated.rows[0],
      previous: { date: active.appointment_date, startTime: active.slot_time.slice(0, 5) },
    }
  })

  const appointment = toPatientAppointment(row, currentTime)
  await notifyPatient(user.line_user_id, appointmentRescheduledMessage(appointment, previous))
  return { appointment, previous }
}

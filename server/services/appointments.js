// งานเกี่ยวกับนัดหมาย (ตาราง appointments) — ขั้น H: ฝั่ง staff S4–S6 · ขั้น M: ฝั่งผู้ป่วย U8
// ขั้น N: ผู้ป่วยยืนยันการจอง U9, ยกเลิกนัด U10, เลื่อนนัด U11
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น H):
// - ปุ่ม [ไม่มา] กดได้เมื่อ "ถึงเวลานัด" (เวลาตอนนี้ ≥ เวลานัด) ย้อนหลังกี่วันก็ได้ (H3ก, H4ก)
// - ปุ่ม [แก้คืน] กดได้เมื่อ "ยังไม่ครบ 5 นาที" หลังกด [ไม่มา] (เวลาตอนนี้ < no_show_at + 5 นาที) (H4ก)
// - กด [ไม่มา] / [แก้คืน] ไม่เปลี่ยนสถานะคิว (time_slots คง booked)
// - ทุกครั้งที่แก้นัด ตั้ง updated_at = เวลาจาก clock.js

import { query, pool } from '../db.js'
import { now, toThaiIso, bangkokTime } from '../lib/clock.js'
import { CHANGE_CUTOFF_MS, CLINIC_PHONE } from '../lib/rules.js'
import { toProfile } from './users.js'
import { notifyPatient, bookingConfirmedText, appointmentCancelledText, appointmentRescheduledText } from '../lib/lineMessages.js'

// แก้คืนได้ภายใน 5 นาทีหลังกด [ไม่มา]
export const UNDO_NO_SHOW_MS = 5 * 60 * 1000

// เลข id ที่ใหญ่สุดของคอลัมน์ INTEGER (เกินนี้ถ้าส่งให้ฐานข้อมูลจะพังเป็น 500)
const MAX_INTEGER = 2147483647

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
    `SELECT a.appointment_id, a.slot_id, a.status, t.slot_date, t.start_time, t.end_time
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

// ---------- ขั้น N: U9 ยืนยันการจอง · U10 ยกเลิกนัด · U11 เลื่อนนัด ----------
//
// - ยืนยัน (U9/U11) ไม่ตรวจกฎเวลาซ้ำ ตรวจแค่ "คิวที่ส่งมาเป็นคิวที่ตัวเองถืออยู่ และยังไม่หมดเวลาถือ"
//   (เวลาหมดถือ holdExpiresAt การันตีกฎ 10 นาทีก่อนนัด / เส้นตายนัดเดิมไว้แล้วตอน U6)
//   slotId ไม่ตรงคิวที่ถือ / ไม่ส่ง / ไม่ใช่ตัวเลข → 410 HOLD_EXPIRED (N3ก)
// - ทุกงานที่แก้หลายตารางทำใน transaction เดียว (พังกลางทาง = ย้อนกลับทั้งหมด)
// - ส่งข้อความ LINE หลัง COMMIT เท่านั้น — ส่งไม่ได้ก็ไม่กระทบการจอง (N1ก, N2ก ใน lib/lineMessages.js)
// - INSERT ใส่ created_at + updated_at และ UPDATE ตั้ง updated_at จากเวลา clock.js (ใช้คำนวณ "นัดกระชั้น")

const HOLD_EXPIRED_BOOK = 'หมดเวลายืนยันการจอง คิวถูกปล่อยให้ผู้อื่นจองได้แล้ว'
const HOLD_EXPIRED_RESCHEDULE = 'หมดเวลายืนยันการเลื่อนนัด คิวถูกปล่อยให้ผู้อื่นจองได้แล้ว'

// slotId จาก body → ตัวเลข · ใช้ไม่ได้ → 410 HOLD_EXPIRED (ถือว่าไม่ใช่คิวที่ถืออยู่ — N3ก)
function parseHeldSlotId(value, expiredMessage) {
  const isNumberText = typeof value === 'string' && /^\d+$/.test(value)
  const id = typeof value === 'number' || isNumberText ? Number(value) : NaN
  if (!Number.isInteger(id) || id < 1 || id > MAX_INTEGER) {
    throw new AppointmentError(410, 'HOLD_EXPIRED', expiredMessage)
  }
  return id
}

// error เลยเส้นตายยกเลิก/เลื่อน (ข้อความเดียวกับ mock และ U6)
function tooLateToChangeError(deadline) {
  const deadlineText = toThaiIso(deadline).slice(11, 16)
  return new AppointmentError(409, 'TOO_LATE_TO_CHANGE', `ยกเลิกหรือเลื่อนนัดได้ก่อน ${deadlineText} น. เท่านั้น หากมาไม่ได้ กรุณาโทรแจ้งคลินิก`)
}

// ทำงานใน transaction: work(db) ได้ตัวส่งคำสั่ง db(text, params) ที่อยู่ใน transaction เดียวกัน
// สำเร็จ → COMMIT · error ใด ๆ (รวม AppointmentError ที่ตั้งใจ throw) → ROLLBACK แล้วส่ง error ต่อ
async function inTransaction(work) {
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

// เปลี่ยนคิวที่ "ฉันถืออยู่และยังไม่หมดเวลา" เป็น booked (ล้างผู้ถือ/เวลาหมดถือ) ในคำสั่งเดียว
// ไม่ตรงเงื่อนไข (ไม่ได้ถือ / หมดเวลาแล้ว / คนอื่นถือ) → ได้ 0 แถว
// $3 = เวลาจาก clock.js (ไม่ใช้ now() ของ SQL เพราะจะไม่ตาม DEMO_NOW)
const BOOK_HELD_SLOT = `
  UPDATE time_slots
  SET slot_status = 'booked', held_by_user_id = NULL, hold_expires_at = NULL
  WHERE slot_id = $1
    AND slot_status = 'held'
    AND held_by_user_id = $2
    AND hold_expires_at > $3
  RETURNING slot_id, slot_date, start_time, end_time`

// U9 — ยืนยันการจอง ส่ง { slotId } (ต้องเป็นคิวที่ถือไว้ด้วย U6) → { appointment } แบบ U8
// ลำดับ (ตาม mock): คิวที่ถือ (410 HOLD_EXPIRED) → มีนัดอยู่แล้ว (409 HAS_ACTIVE_APPOINTMENT)
export async function createAppointment(user, body) {
  const currentTime = now()
  const slotId = parseHeldSlotId(body?.slotId, HOLD_EXPIRED_BOOK)

  const row = await inTransaction(async (db) => {
    const booked = await db(BOOK_HELD_SLOT, [slotId, user.user_id, currentTime])
    if (booked.rowCount !== 1) {
      throw new AppointmentError(410, 'HOLD_EXPIRED', HOLD_EXPIRED_BOOK)
    }
    // เช็กซ้ำใน transaction (เช่น เปิด 2 หน้าแล้วกดจองทั้งคู่) → ROLLBACK คิวกลับเป็น held เหมือนเดิม
    const active = await findActiveAppointment(user.user_id, currentTime, db)
    if (active) {
      throw new AppointmentError(409, 'HAS_ACTIVE_APPOINTMENT', 'คุณมีนัดอยู่แล้ว', {
        appointment: toPatientAppointment(active, currentTime),
      })
    }
    // UNIQUE INDEX (slot_id) WHERE status = 'booked' กันคิวเดียวมี 2 นัดอีกชั้น
    const inserted = await db(
      `INSERT INTO appointments (user_id, slot_id, status, created_at, updated_at)
       VALUES ($1, $2, 'booked', $3, $3)
       RETURNING appointment_id, status`,
      [user.user_id, slotId, currentTime]
    )
    return { ...booked.rows[0], ...inserted.rows[0] }
  })

  const appointment = toPatientAppointment(row, currentTime)
  await notifyPatient(user.line_user_id, bookingConfirmedText(toProfile(user), appointment))
  return { appointment }
}

// U10 — ยกเลิกนัดของฉัน → { appointment: { ...status: 'cancelled', canChange: false } }
// ไม่มีนัด → 404 · ถึงเส้นตาย (นัด − 15 นาที) แล้ว → 409 TOO_LATE_TO_CHANGE
// นัด → cancelled (ไม่ลบแถว) · คิว → available · ปล่อยคิวที่ถืออยู่ด้วย (เช่น ถือคิวไว้จะเลื่อน แล้วเปลี่ยนใจยกเลิก — แบบ mock)
export async function cancelMyAppointment(user) {
  const currentTime = now()

  const active = await inTransaction(async (db) => {
    const found = await findActiveAppointment(user.user_id, currentTime, db)
    if (!found) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะยกเลิก')
    const deadline = changeDeadlineOf(found.slot_date, found.start_time)
    if (currentTime >= deadline) throw tooLateToChangeError(deadline)

    const updated = await db(
      `UPDATE appointments
       SET status = 'cancelled', updated_at = $2
       WHERE appointment_id = $1 AND status = 'booked'
       RETURNING appointment_id`,
      [found.appointment_id, currentTime]
    )
    // มีคนแก้นัดนี้ไปก่อนเสี้ยววินาที (เช่น กดยกเลิกจาก 2 หน้า) → ไม่มีนัดให้ยกเลิกแล้ว
    if (updated.rowCount !== 1) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะยกเลิก')

    await db(
      `UPDATE time_slots
       SET slot_status = 'available'
       WHERE slot_id = $1 AND slot_status = 'booked'
       RETURNING slot_id`,
      [found.slot_id]
    )
    await db(
      `UPDATE time_slots
       SET slot_status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
       WHERE held_by_user_id = $1 AND slot_status = 'held'
       RETURNING slot_id`,
      [user.user_id]
    )
    return found
  })

  const appointment = { ...toPatientAppointment(active, currentTime), status: 'cancelled', canChange: false }
  await notifyPatient(user.line_user_id, appointmentCancelledText(appointment))
  return { appointment }
}

// U11 — ยืนยันการเลื่อนนัด ส่ง { slotId } (ต้องถือคิวใหม่ไว้ด้วย U6 purpose: reschedule)
// → { appointment: เวลาใหม่, previous: { date, startTime } }
// ลำดับ (ตาม mock): ไม่มีนัด (404) → คิวที่ถือ (410 HOLD_EXPIRED) → เลยเส้นตายนัดเดิม (409 — กันไว้เฉย ๆ
//   ปกติไม่เกิด เพราะ U6 ตั้งเวลาหมดถือไม่เกินเส้นตายนัดเดิมแล้ว)
// แก้แถวนัดเดิม (id เดิม เปลี่ยน slot_id) · คิวเดิม → available · ลบข้อความเตือนของนัดนี้ (cron จะสร้างใหม่ตามเวลาใหม่)
export async function rescheduleMyAppointment(user, body) {
  const currentTime = now()

  const { row, previous } = await inTransaction(async (db) => {
    const active = await findActiveAppointment(user.user_id, currentTime, db)
    if (!active) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะเลื่อน')

    const slotId = parseHeldSlotId(body?.slotId, HOLD_EXPIRED_RESCHEDULE)
    const booked = await db(BOOK_HELD_SLOT, [slotId, user.user_id, currentTime])
    if (booked.rowCount !== 1) {
      throw new AppointmentError(410, 'HOLD_EXPIRED', HOLD_EXPIRED_RESCHEDULE)
    }

    const deadline = changeDeadlineOf(active.slot_date, active.start_time)
    if (currentTime >= deadline) throw tooLateToChangeError(deadline)

    const updated = await db(
      `UPDATE appointments
       SET slot_id = $2, updated_at = $3
       WHERE appointment_id = $1 AND status = 'booked'
       RETURNING appointment_id, status`,
      [active.appointment_id, slotId, currentTime]
    )
    if (updated.rowCount !== 1) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่มีนัดที่จะเลื่อน')

    await db(
      `UPDATE time_slots
       SET slot_status = 'available'
       WHERE slot_id = $1 AND slot_status = 'booked'
       RETURNING slot_id`,
      [active.slot_id]
    )
    await db(`DELETE FROM notifications WHERE appointment_id = $1 RETURNING notification_id`, [active.appointment_id])

    return {
      row: { ...booked.rows[0], ...updated.rows[0] },
      previous: { date: active.slot_date, startTime: active.start_time.slice(0, 5) },
    }
  })

  const appointment = toPatientAppointment(row, currentTime)
  await notifyPatient(user.line_user_id, appointmentRescheduledText(appointment, previous))
  return { appointment, previous }
}

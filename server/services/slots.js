// งานเกี่ยวกับช่วงเวลา (time_slots)
// - ขั้น F: สร้างคิวล่วงหน้าอัตโนมัติ (ensureSlots)
// - ขั้น I: หน้า "จัดการเวลา" ของ staff — S7 ดูเวลาของวัน, S8 ปิด, S9 เปิด
// - ขั้น M: หน้าจองคิวของผู้ป่วย — U4 วันที่จองได้, U5 ตารางเวลา, U6 ถือคิว, U7 ปล่อยคิว
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น I):
// - ปิดได้เฉพาะคิวที่ว่าง · เปิดได้เฉพาะคิวที่ถูกปิด
// - คิว held ที่หมดเวลาถือแล้ว (hold_expires_at ≤ ตอนนี้) = ว่าง (ER #15, I2ก)
// - คิวที่ถึงเวลาเริ่มแล้ว (ตอนนี้ ≥ เวลาเริ่มคิว) ปิด/เปิดไม่ได้ (I3ก) → หน้าเว็บรู้จาก isPast (I4ก)

import { query, pool } from '../db.js'
import { now, toThaiIso, bangkokDateOf, addDays, isOpenDay, bangkokTime, isValidDateString } from '../lib/clock.js'
import { HOLD_MS, HOLD_MIN_MS, BOOKING_CUTOFF_MS, SHORT_NOTICE_MS, BOOKING_DAYS_AHEAD } from '../lib/rules.js'
import { findActiveAppointment, toPatientAppointment, changeDeadlineOf } from './appointments.js'

// เวลาเริ่มของ 12 คิวต่อวัน (07:00–09:45 ทุก 15 นาที)
export const SLOT_START_TIMES = ['07:00', '07:15', '07:30', '07:45', '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45']

// สร้างคิวล่วงหน้าถึง "วันนี้ + 14 วัน" (กฎ: จองล่วงหน้าได้ไม่เกิน 14 วัน)
export const DAYS_AHEAD = 14

// จำว่าสร้างของ "วันที่เท่าไร" ไปแล้ว — วันที่ยังไม่เปลี่ยน = ไม่ต้องถามฐานข้อมูลซ้ำ
// (เก็บในหน่วยความจำ: รีสตาร์ท server แล้วจะเช็กใหม่ 1 ครั้ง ซึ่งไม่เป็นไรเพราะไม่สร้างซ้ำ)
let lastCheckedDate = null

// เวลาจบคิว = เวลาเริ่ม + 15 นาที ('07:45' → '08:00')
function endTimeOf(time) {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + 15
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ให้มีคิวครบทุกวันเสาร์–อาทิตย์ ตั้งแต่วันนี้ถึงวันนี้ + 14 วัน
// เรียกตอนเปิด server และก่อนอ่านคิวทุกครั้ง (S7, U4, U5) — ทำงานจริงเฉพาะเมื่อวันที่เปลี่ยน
// คิวที่มีอยู่แล้ว (รวมคิวที่ staff ปิดไว้) ไม่ถูกแตะ: UNIQUE (slot_date, start_time) + ON CONFLICT DO NOTHING
// คืนค่า = จำนวนคิวที่สร้างใหม่
export async function ensureSlots() {
  const current = now()
  const today = bangkokDateOf(current)
  if (today === lastCheckedDate) return 0

  // เตรียมแถวทั้งหมดก่อน แล้วส่งคำสั่งเดียว ($1, $2 … = ช่องใส่ค่า)
  const values = []
  const params = [current] // $1 = created_at (เวลาจาก clock.js — รองรับ DEMO_NOW)
  for (let date = today; date <= addDays(today, DAYS_AHEAD); date = addDays(date, 1)) {
    if (!isOpenDay(date)) continue
    for (const time of SLOT_START_TIMES) {
      const n = params.length
      params.push(date, time, endTimeOf(time))
      values.push(`($${n + 1}::date, $${n + 2}::time, $${n + 3}::time, 'available', $1)`)
    }
  }

  const result = await query(
    `INSERT INTO time_slots (slot_date, start_time, end_time, slot_status, created_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (slot_date, start_time) DO NOTHING`,
    params
  )

  lastCheckedDate = today // จำไว้หลังสำเร็จเท่านั้น (ถ้าพัง ครั้งหน้าจะลองใหม่)
  return result.rowCount
}

// ---------- ขั้น I: S7–S9 ----------

// เลข id ที่ใหญ่สุดของคอลัมน์ INTEGER (เกินนี้ถ้าส่งให้ฐานข้อมูลจะพังเป็น 500)
const MAX_INTEGER = 2147483647

// error ที่ตั้งใจตอบกลับ (route จะแปลงเป็น HTTP status + { code, message })
// extra = ข้อมูลแนบเพิ่มในคำตอบ (เช่น U6 HAS_ACTIVE_APPOINTMENT แนบ { appointment })
export class SlotError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

// คำสั่งอ่านคิว — สถานะที่ส่งออกไป: held ที่หมดเวลาถือแล้ว ถือเป็น available (I2ก)
// $2 = เวลาจาก clock.js (ไม่ใช้ now() ของ SQL เพราะจะไม่ตาม DEMO_NOW)
const SELECT_ADMIN_SLOT = `
  SELECT slot_id, slot_date, start_time, end_time,
         CASE WHEN slot_status = 'held' AND hold_expires_at <= $2 THEN 'available'
              ELSE slot_status END AS status
  FROM time_slots`

// แถวจากฐานข้อมูล → รูปแบบที่ส่งให้หน้าเว็บ (S7 ใน docs/api-contract.md)
// currentTime = เวลาจาก clock.js (ส่งเข้ามา เพื่อให้ทุกแถวในคำตอบเดียวกันใช้เวลาเดียวกัน)
function toAdminSlot(row, currentTime) {
  return {
    slotId: row.slot_id,
    startTime: row.start_time.slice(0, 5), // '07:00:00' → '07:00'
    endTime: row.end_time.slice(0, 5),
    status: row.status,
    // ถึงเวลาเริ่มคิวแล้ว → หน้าเว็บแสดงปุ่ม [เลยเวลา] สีเทา (I3ก, I4ก, I7 แบบ 1)
    isPast: currentTime >= bangkokTime(row.slot_date, row.start_time),
  }
}

// S7 — เวลาทั้งหมดของวันที่เลือก เรียงตามเวลา
// วันธรรมดา / ไกลเกิน 14 วัน ไม่มีแถวในตาราง → [] เอง
export async function listAdminSlots(date) {
  await ensureSlots() // สร้างคิวที่ยังขาด (ทำงานจริงเฉพาะเมื่อวันที่เปลี่ยน)
  const currentTime = now()
  const result = await query(`${SELECT_ADMIN_SLOT} WHERE slot_date = $1 ORDER BY start_time`, [date, currentTime])
  return result.rows.map((row) => toAdminSlot(row, currentTime))
}

// แปลง id จาก URL เป็นตัวเลข — ไม่ใช่ตัวเลข / ใหญ่เกิน → 404 (แบบเดียวกับ H5ก)
function parseSlotId(idText) {
  const id = /^\d+$/.test(idText) ? Number(idText) : NaN
  if (!Number.isInteger(id) || id < 1 || id > MAX_INTEGER) {
    throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  }
  return id
}

// อ่านคิวตัวเดียว (ไม่เจอ → null)
async function findAdminSlot(id, currentTime) {
  const result = await query(`${SELECT_ADMIN_SLOT} WHERE slot_id = $1`, [id, currentTime])
  return result.rows[0] ?? null
}

// เงื่อนไข "คิวยังไม่ถึงเวลาเริ่ม" ใน SQL — (slot_date + start_time) AT TIME ZONE = เวลาเริ่มคิวแบบเวลาไทย
const NOT_STARTED_YET = `(slot_date + start_time) AT TIME ZONE 'Asia/Bangkok' > $2::timestamptz`

// S8 — กด [ปิด]: available (หรือ held ที่หมดเวลาแล้ว) → closed
// UPDATE แบบมีเงื่อนไข: ผู้ป่วยกดเลือกคิวนี้พร้อมกัน → สำเร็จได้ฝ่ายเดียว
// ล้าง held_by_user_id / hold_expires_at ด้วย (กรณี held ที่หมดเวลาค้างอยู่)
export async function closeSlot(idText) {
  const id = parseSlotId(idText)
  const currentTime = now()

  const updated = await query(
    `UPDATE time_slots
     SET slot_status = 'closed', held_by_user_id = NULL, hold_expires_at = NULL
     WHERE slot_id = $1
       AND (slot_status = 'available' OR (slot_status = 'held' AND hold_expires_at <= $2))
       AND ${NOT_STARTED_YET}`,
    [id, currentTime]
  )

  const row = await findAdminSlot(id, currentTime)
  if (updated.rowCount === 1) return toAdminSlot(row, currentTime)

  // แก้ไม่สำเร็จ → หาเหตุผล (ลำดับตาม I5ก: ไม่มีคิว → สถานะไม่ใช่ → เลยเวลา)
  if (!row) throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  if (row.status !== 'available') throw new SlotError(409, 'SLOT_NOT_AVAILABLE', 'ปิดได้เฉพาะเวลาที่ยังว่าง')
  throw new SlotError(409, 'SLOT_PAST', 'เวลานี้ผ่านไปแล้ว ปิดหรือเปิดไม่ได้')
}

// S9 — กด [เปิด]: closed → available
export async function openSlot(idText) {
  const id = parseSlotId(idText)
  const currentTime = now()

  const updated = await query(
    `UPDATE time_slots
     SET slot_status = 'available'
     WHERE slot_id = $1
       AND slot_status = 'closed'
       AND ${NOT_STARTED_YET}`,
    [id, currentTime]
  )

  const row = await findAdminSlot(id, currentTime)
  if (updated.rowCount === 1) return toAdminSlot(row, currentTime)

  if (!row) throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  if (row.status !== 'closed') throw new SlotError(409, 'SLOT_NOT_CLOSED', 'เวลานี้ไม่ได้ถูกปิดอยู่')
  throw new SlotError(409, 'SLOT_PAST', 'เวลานี้ผ่านไปแล้ว ปิดหรือเปิดไม่ได้')
}

// ---------- ขั้น M: U4–U7 หน้าจองคิวของผู้ป่วย ----------
//
// กฎที่ใช้ (project-snapshot หมวด 5 + claude/time-rules-v2.md + claude/u-decisions.md):
// - วันที่จองได้ = เสาร์–อาทิตย์ ตั้งแต่วันนี้ถึงวันนี้ + 14 วัน (วันนี้แสดงเสมอแม้ไม่มีคิวว่าง — M2ก)
// - กดเลือกคิวได้เมื่อเหลือเวลาก่อนนัด ≥ 11 นาที (ยืนยันก่อนนัด 10 นาที + เวลายืนยันขั้นต่ำ 1 นาที)
// - คิว held ที่หมดเวลาถือแล้ว = ว่าง ทุก query (ER #15) — ไม่ต้องรอ cron (cron ใน lib/reminders.js ล้างเป็น available ทุก 1 นาที — M6ก, ชุด P)
// - ถือได้ครั้งละ 1 คิว: ถือคิวใหม่ → ปล่อยคิวเดิมให้อัตโนมัติ
// - กดคิวที่ตัวเองถืออยู่ซ้ำ → ได้ hold เดิม นับเวลาต่อ ไม่ต่ออายุ (M4ข)
// - U6 ตรวจเวลา (TOO_LATE) ก่อนคิวไม่ว่าง (SLOT_TAKEN) (M5ก)

// คำสั่งอ่านคิวสำหรับผู้ป่วย (สถานะจริง + ใครถือ + หมดเวลาถือเมื่อไร → คิดสถานะที่ผู้ป่วยเห็นใน JS)
const SELECT_PATIENT_SLOT = `
  SELECT slot_id, slot_date, start_time, end_time, slot_status, held_by_user_id, hold_expires_at
  FROM time_slots`

// คิวนี้ "ว่าง" ไหม: available หรือ held ที่หมดเวลาถือแล้ว
function isFree(row, currentTime) {
  return row.slot_status === 'available' || (row.slot_status === 'held' && row.hold_expires_at <= currentTime)
}

// ผู้ป่วยคนนี้กำลังถือคิวนี้อยู่ (ยังไม่หมดเวลา) ไหม
function isHeldBy(row, userId, currentTime) {
  return row.slot_status === 'held' && row.held_by_user_id === userId && row.hold_expires_at > currentTime
}

// เหลือเวลาไม่พอให้กดเลือก (เหลือ < 10 นาที + 1 นาที = 11 นาที) → "หมดเวลาจอง"
function isTooLate(slotStart, currentTime) {
  return slotStart.getTime() - currentTime.getTime() < BOOKING_CUTOFF_MS + HOLD_MIN_MS
}

// นัดกระชั้น = เหลือเวลาก่อนนัดไม่ถึง 3 ชม. (ไม่มีข้อความเตือนก่อนนัด)
function isShortNotice(slotStart, currentTime) {
  return slotStart.getTime() - currentTime.getTime() < SHORT_NOTICE_MS
}

// สถานะที่ผู้ป่วยเห็น (U5) — ลำดับเดียวกับ mock: ของฉัน → หมดเวลาจอง → ว่าง → ไม่ว่าง
// unavailable = มีคนจอง / คนอื่นกำลังถือ / ปิด (ผู้ป่วยไม่ต้องรู้ว่าแบบไหน)
function patientStatusOf(row, userId, currentTime) {
  if (isHeldBy(row, userId, currentTime)) return 'held_by_me'
  if (isTooLate(bangkokTime(row.slot_date, row.start_time), currentTime)) return 'too_late'
  if (isFree(row, currentTime)) return 'available'
  return 'unavailable'
}

// วันที่จองได้ทั้งหมด (วันเปิด ตั้งแต่วันนี้ถึงวันนี้ + 14 วัน ตามเวลาไทยจาก clock.js)
function bookingDatesFrom(today) {
  const dates = []
  for (let date = today; date <= addDays(today, BOOKING_DAYS_AHEAD); date = addDays(date, 1)) {
    if (isOpenDay(date)) dates.push(date)
  }
  return dates
}

// U4 — วันที่เลือกได้ + จำนวนคิวที่ยังกดได้ (availableCount นับเฉพาะ "ว่าง" ไม่นับคิวที่ตัวเองถืออยู่ — เหมือน mock)
export async function listBookingDays(userId) {
  await ensureSlots()
  const currentTime = now()
  const dates = bookingDatesFrom(bangkokDateOf(currentTime))
  const result = await query(
    `${SELECT_PATIENT_SLOT} WHERE slot_date BETWEEN $1 AND $2`,
    [dates[0], dates[dates.length - 1]]
  )
  const countByDate = Object.fromEntries(dates.map((date) => [date, 0]))
  for (const row of result.rows) {
    if (row.slot_date in countByDate && patientStatusOf(row, userId, currentTime) === 'available') {
      countByDate[row.slot_date] += 1
    }
  }
  return { days: dates.map((date) => ({ date, availableCount: countByDate[date] })) }
}

// U5 — ตารางเวลาของวัน · date ผิดทุกแบบ (รูปแบบผิด / ไม่ใช่วันเปิด / ย้อนหลัง / เกิน 14 วัน) → 400 INVALID_DATE (M3ก)
export async function listPatientSlots(userId, dateText) {
  await ensureSlots()
  const currentTime = now()
  if (!isValidDateString(dateText) || !bookingDatesFrom(bangkokDateOf(currentTime)).includes(dateText)) {
    throw new SlotError(400, 'INVALID_DATE', 'วันที่นี้ไม่เปิดให้จอง')
  }
  const result = await query(`${SELECT_PATIENT_SLOT} WHERE slot_date = $1 ORDER BY start_time`, [dateText])
  return {
    date: dateText,
    slots: result.rows.map((row) => ({
      slotId: row.slot_id,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      status: patientStatusOf(row, userId, currentTime),
      shortNotice: isShortNotice(bangkokTime(row.slot_date, row.start_time), currentTime),
    })),
  }
}

// แปลง slotId จาก body → ตัวเลข (รับตัวเลข หรือข้อความที่เป็นตัวเลข) · ผิด → 404 แบบเดียวกับ mock
function parseBodySlotId(value) {
  const id = typeof value === 'number' ? value : /^\d+$/.test(String(value ?? '')) ? Number(value) : NaN
  if (!Number.isInteger(id) || id < 1 || id > MAX_INTEGER) {
    throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  }
  return id
}

// รูปแบบ hold ที่ส่งให้หน้าเว็บ (U6 ใน docs/api-contract.md)
function toHold(row, holdExpiresAt, currentTime) {
  const slotStart = bangkokTime(row.slot_date, row.start_time)
  return {
    hold: {
      slotId: row.slot_id,
      date: row.slot_date,
      startTime: row.start_time.slice(0, 5),
      holdExpiresAt: toThaiIso(holdExpiresAt),
      changeDeadline: toThaiIso(changeDeadlineOf(row.slot_date, row.start_time)), // นัดใหม่ − 15 นาที
      shortNotice: isShortNotice(slotStart, currentTime),
    },
  }
}

// U6 — ถือคิวไว้ (กดเลือกเวลา) · body = { slotId, purpose: 'book' | 'reschedule' }
// user = แถวผู้ป่วยจาก requirePdpa (ผ่าน requireProfile แล้ว)
export async function holdSlot(user, body) {
  const userId = user.user_id
  const purpose = body?.purpose ?? 'book'
  if (purpose !== 'book' && purpose !== 'reschedule') {
    throw new SlotError(400, 'VALIDATION_ERROR', 'purpose ต้องเป็น book หรือ reschedule', {
      fields: { purpose: 'ต้องเป็น book หรือ reschedule' },
    })
  }
  const currentTime = now()

  // 1) กฎนัด: จองใหม่ห้ามมีนัด active · เลื่อนนัดต้องมีนัด active
  const active = await findActiveAppointment(userId, currentTime)
  if (purpose === 'book' && active) {
    throw new SlotError(409, 'HAS_ACTIVE_APPOINTMENT', 'คุณมีนัดอยู่แล้ว', {
      appointment: toPatientAppointment(active, currentTime),
    })
  }
  if (purpose === 'reschedule' && !active) {
    throw new SlotError(409, 'NO_APPOINTMENT_TO_RESCHEDULE', 'ไม่มีนัดที่จะเลื่อน')
  }

  // 2) หาคิว
  const slotId = parseBodySlotId(body?.slotId)
  const found = await query(`${SELECT_PATIENT_SLOT} WHERE slot_id = $1`, [slotId])
  const row = found.rows[0]
  if (!row) throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  const slotStart = bangkokTime(row.slot_date, row.start_time)

  // 3) ไกลเกิน 14 วัน
  if (row.slot_date > addDays(bangkokDateOf(currentTime), BOOKING_DAYS_AHEAD)) {
    throw new SlotError(400, 'TOO_FAR_TO_BOOK', 'จองล่วงหน้าได้ไม่เกิน 14 วัน')
  }

  // 4) กดคิวที่ตัวเองถืออยู่ซ้ำ → คืน hold เดิม นับต่อ (M4ข)
  if (isHeldBy(row, userId, currentTime)) {
    return toHold(row, row.hold_expires_at, currentTime)
  }

  // 5) เวลา ก่อน คิวว่าง (M5ก)
  if (isTooLate(slotStart, currentTime)) {
    throw new SlotError(400, 'TOO_LATE_TO_BOOK', 'ต้องจองก่อนเวลานัดอย่างน้อย 10 นาที')
  }
  if (!isFree(row, currentTime)) {
    throw new SlotError(409, 'SLOT_TAKEN', 'คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น')
  }

  // 6) หมดเวลาถือ = ค่าที่มาก่อนระหว่าง (ตอนนี้ + 5 นาที) กับ (นัดใหม่ − 10 นาที) [กับ (นัดเดิม − 15 นาที) ถ้าเลื่อน]
  let expiresMs = Math.min(currentTime.getTime() + HOLD_MS, slotStart.getTime() - BOOKING_CUTOFF_MS)
  let limitedByOldAppointment = false
  if (purpose === 'reschedule') {
    const oldDeadline = changeDeadlineOf(active.slot_date, active.start_time)
    if (oldDeadline.getTime() < expiresMs) {
      expiresMs = oldDeadline.getTime()
      limitedByOldAppointment = true
    }
  }
  // เหลือเวลายืนยันไม่ถึง 1 นาที → ไม่ให้ถือ
  if (expiresMs - currentTime.getTime() < HOLD_MIN_MS) {
    if (limitedByOldAppointment) {
      const deadlineText = toThaiIso(new Date(expiresMs)).slice(11, 16)
      throw new SlotError(409, 'TOO_LATE_TO_CHANGE', `ยกเลิกหรือเลื่อนนัดได้ก่อน ${deadlineText} น. เท่านั้น หากมาไม่ได้ กรุณาโทรแจ้งคลินิก`)
    }
    throw new SlotError(400, 'TOO_LATE_TO_BOOK', 'ต้องจองก่อนเวลานัดอย่างน้อย 10 นาที')
  }
  const holdExpiresAt = new Date(expiresMs)

  // 7) ปล่อยคิวเดิม + ถือคิวใหม่ ใน transaction เดียว (ถือคิวใหม่ไม่สำเร็จ → คิวเดิมยังถืออยู่เหมือนเดิม)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE time_slots
       SET slot_status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
       WHERE held_by_user_id = $1 AND slot_status = 'held' AND slot_id <> $2
       RETURNING slot_id`,
      [userId, slotId]
    )
    // UPDATE แบบมีเงื่อนไข: คนอื่นกดคิวเดียวกันพร้อมกัน → สำเร็จได้คนเดียว
    const taken = await client.query(
      `UPDATE time_slots
       SET slot_status = 'held', held_by_user_id = $2, hold_expires_at = $3
       WHERE slot_id = $1
         AND (slot_status = 'available' OR (slot_status = 'held' AND hold_expires_at <= $4))
       RETURNING slot_id`,
      [slotId, userId, holdExpiresAt, currentTime]
    )
    if (taken.rowCount !== 1) {
      await client.query('ROLLBACK')
      throw new SlotError(409, 'SLOT_TAKEN', 'คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น')
    }
    await client.query('COMMIT')
  } catch (error) {
    if (!(error instanceof SlotError)) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  return toHold(row, holdExpiresAt, currentTime)
}

// U7 — ปล่อยคิวที่ถืออยู่ (ไม่มีคิวที่ถืออยู่ก็ตอบ ok)
export async function releaseHold(userId) {
  await query(
    `UPDATE time_slots
     SET slot_status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
     WHERE held_by_user_id = $1 AND slot_status = 'held'
     RETURNING slot_id`,
    [userId]
  )
  return { ok: true }
}

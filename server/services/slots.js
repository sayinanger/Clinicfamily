// งานเกี่ยวกับช่วงเวลา
// - ขั้น I: หน้า "จัดการเวลา" ของ staff — S7 ดูเวลาของวัน, S8 ปิด, S9 เปิด
// - ขั้น M: หน้าจองคิวของผู้ป่วย — U4 วันที่จองได้, U5 ตารางเวลา, U6 ถือคิว, U7 ปล่อยคิว
//
// โครงฐานข้อมูลแบบใหม่ (4 พ.ย. 2569 — claude/snapshot-update-nov4.md):
// - ไม่มีตารางช่วงเวลา · 12 ช่วงต่อวันเปิด (ส–อา 07:00–09:45 ทีละ 15 นาที) คำนวณในโค้ด
// - สถานะของช่วงดูจาก 2 ตาราง ด้วยวัน + เวลาที่ตรงกัน (ไม่มี FK ถึงกัน):
//     appointments  held (ยังไม่หมดเวลา) = กำลังถูกจอง · booked / completed / no_show = มีผู้จองแล้ว
//     closed_slots  มีแถว = ปิดรับการจอง
//     ไม่เจอในทั้ง 2 ตาราง = เปิดรับการจอง
// - ถือคิว = เพิ่มแถว held ใน appointments · ปล่อย / หมดเวลา = ลบแถว (cron ลบทุก 1 นาที)
// - ปิด = เพิ่มแถว closed_slots · เปิด = ลบแถว
// - slotId ที่ส่งให้หน้าเว็บ = ข้อความวัน-เวลา 'YYYY-MM-DDTHH:MM' (320ก) หน้าเว็บส่งกลับมาเหมือนเดิม
// - ถือคิวกับปิดช่วงเวลาอยู่คนละตาราง → ล็อกตามวัน-เวลา (lockKey) ให้ทำทีละรายการ
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น I):
// - ปิดได้เฉพาะช่วงที่ว่าง · เปิดได้เฉพาะช่วงที่ถูกปิด
// - held ที่หมดเวลาถือแล้ว (hold_expires_at ≤ ตอนนี้) = ว่าง (ER #15, I2ก) แม้ cron ยังไม่ทันลบ
// - ช่วงที่ถึงเวลาเริ่มแล้ว (ตอนนี้ ≥ เวลาเริ่ม) ปิด/เปิดไม่ได้ (I3ก) → หน้าเว็บรู้จาก isPast (I4ก)

import { query } from '../db.js'
import { now, toThaiIso, bangkokDateOf, addDays, isOpenDay, bangkokTime, isValidDateString, slotEndTime } from '../lib/clock.js'
import { HOLD_MS, HOLD_MIN_MS, BOOKING_CUTOFF_MS, SHORT_NOTICE_MS, BOOKING_DAYS_AHEAD } from '../lib/rules.js'
import {
  findActiveAppointment,
  toPatientAppointment,
  changeDeadlineOf,
  slotKeyOf,
  lockKey,
  inTransaction,
  isUniqueViolation,
} from './appointments.js'

// เวลาเริ่มของ 12 ช่วงต่อวัน (07:00–09:45 ทุก 15 นาที)
export const SLOT_START_TIMES = ['07:00', '07:15', '07:30', '07:45', '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45']

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

// ---------- ตัวช่วยร่วม ----------

// วันนี้ (ไทย) ถึงวันสุดท้ายที่จองได้ (วันนี้ + 14 วัน)
function lastBookableDate(currentTime) {
  return addDays(bangkokDateOf(currentTime), BOOKING_DAYS_AHEAD)
}

// slotId ('YYYY-MM-DDTHH:MM') → { date, time } · รูปแบบผิด / ไม่ใช่วันเปิด / ไม่ใช่ 1 ใน 12 ช่วง → null
function parseSlotKey(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/) : null
  if (!match) return null
  const [, date, time] = match
  if (!isValidDateString(date) || !isOpenDay(date) || !SLOT_START_TIMES.includes(time)) return null
  return { date, time }
}

// สิ่งที่ใช้ช่วงเวลาอยู่ ระหว่างวัน fromDate–toDate → Map('YYYY-MM-DDTHH:MM' → { status, userId?, holdExpiresAt? })
//   status: 'booked' (booked / completed / no_show) · 'held' (ยังไม่หมดเวลา) · 'closed'
//   ช่วงที่ไม่อยู่ใน Map = ว่าง (ไม่นับนัดที่ยกเลิก และ held ที่หมดเวลาแล้ว)
// db = ตัวส่งคำสั่ง (ปกติ query · ใน transaction ส่งตัวของ transaction มาแทน)
async function loadSlotUsage(fromDate, toDate, currentTime, db = query) {
  const taken = await db(
    `SELECT user_id, appointment_date, slot_time, status, hold_expires_at
     FROM appointments
     WHERE appointment_date BETWEEN $1 AND $2
       AND (status IN ('booked', 'completed', 'no_show') OR (status = 'held' AND hold_expires_at > $3))`,
    [fromDate, toDate, currentTime]
  )
  const closed = await db(
    `SELECT slot_date, slot_time FROM closed_slots WHERE slot_date BETWEEN $1 AND $2`,
    [fromDate, toDate]
  )

  const usage = new Map()
  for (const row of closed.rows) usage.set(slotKeyOf(row.slot_date, row.slot_time), { status: 'closed' })
  for (const row of taken.rows) {
    const key = slotKeyOf(row.appointment_date, row.slot_time)
    if (row.status === 'held') {
      usage.set(key, { status: 'held', userId: row.user_id, holdExpiresAt: row.hold_expires_at })
    } else {
      usage.set(key, { status: 'booked' }) // มีนัดจริง ขึ้นก่อน held / closed เสมอ
    }
  }
  return usage
}

// ---------- ขั้น I: S7–S9 ----------

// ช่วงเวลา → รูปแบบที่ส่งให้หน้าเว็บ (S7 ใน docs/api-contract.md)
// currentTime = เวลาจาก clock.js (ส่งเข้ามา เพื่อให้ทุกช่วงในคำตอบเดียวกันใช้เวลาเดียวกัน)
function toAdminSlot(date, time, usage, currentTime) {
  return {
    slotId: slotKeyOf(date, time),
    startTime: time,
    endTime: slotEndTime(time),
    status: usage.get(slotKeyOf(date, time))?.status ?? 'available',
    // ถึงเวลาเริ่มแล้ว → หน้าเว็บแสดงปุ่ม [เลยเวลา] สีเทา (I3ก, I4ก, I7 แบบ 1)
    isPast: currentTime >= bangkokTime(date, time),
  }
}

// S7 — เวลาทั้งหมดของวันที่เลือก เรียงตามเวลา
// วันธรรมดา / ไกลเกิน 14 วัน → [] (เหมือนเดิมที่ไม่มีแถวในตาราง)
export async function listAdminSlots(date) {
  const currentTime = now()
  if (!isOpenDay(date) || date > lastBookableDate(currentTime)) return []
  const usage = await loadSlotUsage(date, date, currentTime)
  return SLOT_START_TIMES.map((time) => toAdminSlot(date, time, usage, currentTime))
}

// slotId จาก URL → { date, time } · ใช้ไม่ได้ / ไกลเกิน 14 วัน → 404 (แบบเดียวกับ H5ก)
function parseAdminSlotKey(idText, currentTime) {
  const slot = parseSlotKey(idText)
  if (!slot || slot.date > lastBookableDate(currentTime)) {
    throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  }
  return slot
}

// S8 — กด [ปิด]: ช่วงที่ว่าง → เพิ่มแถวใน closed_slots
// staffId = เจ้าหน้าที่ที่ login อยู่ (closed_slots.staff_id)
// ลำดับ error (I5ก): ไม่พบ → ไม่ว่าง → เลยเวลา
export async function closeSlot(idText, staffId) {
  const currentTime = now()
  const slot = parseAdminSlotKey(idText, currentTime)

  const usage = await inTransaction(async (db) => {
    // ล็อกวัน-เวลานี้: ผู้ป่วยกดถือช่วงนี้พร้อมกัน → ทำทีละรายการ สำเร็จได้ฝ่ายเดียว
    await lockKey(db, `slot ${slotKeyOf(slot.date, slot.time)}`)
    const before = await loadSlotUsage(slot.date, slot.date, currentTime, db)
    if (before.has(slotKeyOf(slot.date, slot.time))) {
      throw new SlotError(409, 'SLOT_NOT_AVAILABLE', 'ปิดได้เฉพาะเวลาที่ยังว่าง')
    }
    if (currentTime >= bangkokTime(slot.date, slot.time)) {
      throw new SlotError(409, 'SLOT_PAST', 'เวลานี้ผ่านไปแล้ว ปิดหรือเปิดไม่ได้')
    }
    // เก็บกวาด held ที่หมดเวลาค้างอยู่ของช่วงนี้ (ไม่ต้องรอ cron)
    await db(
      `DELETE FROM appointments
       WHERE status = 'held' AND hold_expires_at <= $3 AND appointment_date = $1 AND slot_time = $2`,
      [slot.date, slot.time, currentTime]
    )
    await db(`INSERT INTO closed_slots (slot_date, slot_time, staff_id) VALUES ($1, $2, $3)`, [slot.date, slot.time, staffId])
    return loadSlotUsage(slot.date, slot.date, currentTime, db)
  })
  return toAdminSlot(slot.date, slot.time, usage, currentTime)
}

// S9 — กด [เปิด]: ลบแถวใน closed_slots
// ลำดับ error: ไม่พบ → ไม่ได้ปิดอยู่ → เลยเวลา
export async function openSlot(idText) {
  const currentTime = now()
  const slot = parseAdminSlotKey(idText, currentTime)

  const usage = await inTransaction(async (db) => {
    await lockKey(db, `slot ${slotKeyOf(slot.date, slot.time)}`)
    const before = await loadSlotUsage(slot.date, slot.date, currentTime, db)
    if (before.get(slotKeyOf(slot.date, slot.time))?.status !== 'closed') {
      throw new SlotError(409, 'SLOT_NOT_CLOSED', 'เวลานี้ไม่ได้ถูกปิดอยู่')
    }
    if (currentTime >= bangkokTime(slot.date, slot.time)) {
      throw new SlotError(409, 'SLOT_PAST', 'เวลานี้ผ่านไปแล้ว ปิดหรือเปิดไม่ได้')
    }
    await db(`DELETE FROM closed_slots WHERE slot_date = $1 AND slot_time = $2`, [slot.date, slot.time])
    return loadSlotUsage(slot.date, slot.date, currentTime, db)
  })
  return toAdminSlot(slot.date, slot.time, usage, currentTime)
}

// ---------- ขั้น M: U4–U7 หน้าจองคิวของผู้ป่วย ----------
//
// กฎที่ใช้ (project-snapshot หมวด 5 + claude/time-rules-v2.md + claude/u-decisions.md):
// - วันที่จองได้ = เสาร์–อาทิตย์ ตั้งแต่วันนี้ถึงวันนี้ + 14 วัน (วันนี้แสดงเสมอแม้ไม่มีช่วงว่าง — M2ก)
// - กดเลือกได้เมื่อเหลือเวลาก่อนนัด ≥ 11 นาที (ยืนยันก่อนนัด 10 นาที + เวลายืนยันขั้นต่ำ 1 นาที)
// - held ที่หมดเวลาถือแล้ว = ว่าง ทุก query (ER #15) — ไม่ต้องรอ cron (cron ใน lib/reminders.js ลบทุก 1 นาที — M6ก)
// - ถือได้ครั้งละ 1 ช่วง: ถือช่วงใหม่ → ลบแถว held เดิมให้อัตโนมัติ
// - กดช่วงที่ตัวเองถืออยู่ซ้ำ → ได้ hold เดิม นับเวลาต่อ ไม่ต่ออายุ (M4ข)
// - U6 ตรวจเวลา (TOO_LATE) ก่อนช่วงไม่ว่าง (SLOT_TAKEN) (M5ก)
// - มีนัด booked อยู่แล้ว ถือได้เฉพาะตอนเลื่อนนัด (purpose: reschedule) — กฎนี้อยู่ในโค้ด (329ข)

// เหลือเวลาไม่พอให้กดเลือก (เหลือ < 10 นาที + 1 นาที = 11 นาที) → "หมดเวลาจอง"
function isTooLate(slotStart, currentTime) {
  return slotStart.getTime() - currentTime.getTime() < BOOKING_CUTOFF_MS + HOLD_MIN_MS
}

// นัดกระชั้น = เหลือเวลาก่อนนัดไม่ถึง 3 ชม. (ไม่มีข้อความเตือนก่อนนัด)
function isShortNotice(slotStart, currentTime) {
  return slotStart.getTime() - currentTime.getTime() < SHORT_NOTICE_MS
}

// ผู้ป่วยคนนี้กำลังถือช่วงนี้อยู่ (ยังไม่หมดเวลา) ไหม → แถว usage หรือ null
function myHoldOf(usageEntry, userId) {
  return usageEntry?.status === 'held' && usageEntry.userId === userId ? usageEntry : null
}

// สถานะที่ผู้ป่วยเห็น (U5) — ลำดับเดียวกับ mock: ของฉัน → หมดเวลาจอง → ว่าง → ไม่ว่าง
// unavailable = มีคนจอง / คนอื่นกำลังถือ / ปิด (ผู้ป่วยไม่ต้องรู้ว่าแบบไหน)
function patientStatusOf(date, time, usage, userId, currentTime) {
  const entry = usage.get(slotKeyOf(date, time))
  if (myHoldOf(entry, userId)) return 'held_by_me'
  if (isTooLate(bangkokTime(date, time), currentTime)) return 'too_late'
  if (!entry) return 'available'
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

// U4 — วันที่เลือกได้ + จำนวนช่วงที่ยังกดได้ (availableCount นับเฉพาะ "ว่าง" ไม่นับช่วงที่ตัวเองถืออยู่ — เหมือน mock)
export async function listBookingDays(userId) {
  const currentTime = now()
  const dates = bookingDatesFrom(bangkokDateOf(currentTime))
  const usage = await loadSlotUsage(dates[0], dates[dates.length - 1], currentTime)
  return {
    days: dates.map((date) => ({
      date,
      availableCount: SLOT_START_TIMES.filter(
        (time) => patientStatusOf(date, time, usage, userId, currentTime) === 'available'
      ).length,
    })),
  }
}

// U5 — ตารางเวลาของวัน · date ผิดทุกแบบ (รูปแบบผิด / ไม่ใช่วันเปิด / ย้อนหลัง / เกิน 14 วัน) → 400 INVALID_DATE (M3ก)
export async function listPatientSlots(userId, dateText) {
  const currentTime = now()
  if (!isValidDateString(dateText) || !bookingDatesFrom(bangkokDateOf(currentTime)).includes(dateText)) {
    throw new SlotError(400, 'INVALID_DATE', 'วันที่นี้ไม่เปิดให้จอง')
  }
  const usage = await loadSlotUsage(dateText, dateText, currentTime)
  return {
    date: dateText,
    slots: SLOT_START_TIMES.map((time) => ({
      slotId: slotKeyOf(dateText, time),
      startTime: time,
      endTime: slotEndTime(time),
      status: patientStatusOf(dateText, time, usage, userId, currentTime),
      shortNotice: isShortNotice(bangkokTime(dateText, time), currentTime),
    })),
  }
}

// รูปแบบ hold ที่ส่งให้หน้าเว็บ (U6 ใน docs/api-contract.md)
function toHold(slot, holdExpiresAt, currentTime) {
  const slotStart = bangkokTime(slot.date, slot.time)
  return {
    hold: {
      slotId: slotKeyOf(slot.date, slot.time),
      date: slot.date,
      startTime: slot.time,
      holdExpiresAt: toThaiIso(holdExpiresAt),
      changeDeadline: toThaiIso(changeDeadlineOf(slot.date, slot.time)), // นัดใหม่ − 15 นาที
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

  // 2) หาช่วงเวลา
  const slot = parseSlotKey(body?.slotId)
  if (!slot) throw new SlotError(404, 'NOT_FOUND', 'ไม่พบช่วงเวลานี้')
  const key = slotKeyOf(slot.date, slot.time)
  const slotStart = bangkokTime(slot.date, slot.time)

  // 3) ไกลเกิน 14 วัน
  if (slot.date > lastBookableDate(currentTime)) {
    throw new SlotError(400, 'TOO_FAR_TO_BOOK', 'จองล่วงหน้าได้ไม่เกิน 14 วัน')
  }

  // 4) กดช่วงที่ตัวเองถืออยู่ซ้ำ → คืน hold เดิม นับต่อ (M4ข)
  const usage = await loadSlotUsage(slot.date, slot.date, currentTime)
  const myHold = myHoldOf(usage.get(key), userId)
  if (myHold) return toHold(slot, myHold.holdExpiresAt, currentTime)

  // 5) เวลา ก่อน ช่วงว่าง (M5ก)
  if (isTooLate(slotStart, currentTime)) {
    throw new SlotError(400, 'TOO_LATE_TO_BOOK', 'ต้องจองก่อนเวลานัดอย่างน้อย 10 นาที')
  }
  if (usage.has(key)) {
    throw new SlotError(409, 'SLOT_TAKEN', 'คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น')
  }

  // 6) หมดเวลาถือ = ค่าที่มาก่อนระหว่าง (ตอนนี้ + 5 นาที) กับ (นัดใหม่ − 10 นาที) [กับ (นัดเดิม − 15 นาที) ถ้าเลื่อน]
  let expiresMs = Math.min(currentTime.getTime() + HOLD_MS, slotStart.getTime() - BOOKING_CUTOFF_MS)
  let limitedByOldAppointment = false
  if (purpose === 'reschedule') {
    const oldDeadline = changeDeadlineOf(active.appointment_date, active.slot_time)
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

  // 7) ลบ held เดิม + เพิ่ม held ใหม่ ใน transaction เดียว (ถือช่วงใหม่ไม่สำเร็จ → ROLLBACK held เดิมยังอยู่)
  //    ล็อกผู้ป่วย (กด 2 ช่วงพร้อมกัน) แล้วล็อกวัน-เวลา (คนอื่นถือ / staff ปิดพร้อมกัน) → ทำทีละรายการ
  try {
    await inTransaction(async (db) => {
      await lockKey(db, `user ${userId}`)
      await lockKey(db, `slot ${key}`)
      // ลบ held ทุกแถวของฉัน + held ที่หมดเวลาแล้วของช่วงนี้ (ของใครก็ได้ — ไม่ต้องรอ cron)
      await db(
        `DELETE FROM appointments
         WHERE status = 'held'
           AND (user_id = $1
                OR (appointment_date = $2 AND slot_time = $3 AND hold_expires_at <= $4))`,
        [userId, slot.date, slot.time, currentTime]
      )
      // ตรวจซ้ำหลังได้ล็อก (ช่วงนี้อาจถูกจอง/ถือ/ปิดไปแล้วระหว่างนั้น)
      const latest = await loadSlotUsage(slot.date, slot.date, currentTime, db)
      if (latest.has(key)) throw new SlotError(409, 'SLOT_TAKEN', 'คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น')
      // UNIQUE INDEX one_active_per_slot / one_held_per_user กันซ้ำอีกชั้นในฐานข้อมูล
      await db(
        `INSERT INTO appointments (user_id, appointment_date, slot_time, status, hold_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'held', $4, $5, $5)`,
        [userId, slot.date, slot.time, holdExpiresAt, currentTime]
      )
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new SlotError(409, 'SLOT_TAKEN', 'คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น')
    throw error
  }

  return toHold(slot, holdExpiresAt, currentTime)
}

// U7 — ปล่อยคิวที่ถืออยู่ = ลบแถว held ของฉัน (ไม่มีก็ตอบ ok)
export async function releaseHold(userId) {
  await query(`DELETE FROM appointments WHERE user_id = $1 AND status = 'held'`, [userId])
  return { ok: true }
}

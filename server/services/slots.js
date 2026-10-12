// งานเกี่ยวกับช่วงเวลา (time_slots)
// - ขั้น F: สร้างคิวล่วงหน้าอัตโนมัติ (ensureSlots)
// - ขั้น I: หน้า "จัดการเวลา" ของ staff — S7 ดูเวลาของวัน, S8 ปิด, S9 เปิด
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น I):
// - ปิดได้เฉพาะคิวที่ว่าง · เปิดได้เฉพาะคิวที่ถูกปิด
// - คิว held ที่หมดเวลาถือแล้ว (hold_expires_at ≤ ตอนนี้) = ว่าง (ER #15, I2ก)
// - คิวที่ถึงเวลาเริ่มแล้ว (ตอนนี้ ≥ เวลาเริ่มคิว) ปิด/เปิดไม่ได้ (I3ก) → หน้าเว็บรู้จาก isPast (I4ก)

import { query } from '../db.js'
import { now, bangkokDateOf, addDays, isOpenDay, bangkokTime } from '../lib/clock.js'

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
export class SlotError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
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

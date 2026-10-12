// งานเกี่ยวกับช่วงเวลา (time_slots) — ขั้น F: สร้างคิวล่วงหน้าอัตโนมัติ
// (ขั้น I จะเพิ่มงานของ S7–S9 ในไฟล์นี้)

import { query } from '../db.js'
import { now, bangkokDateOf, addDays, isOpenDay } from '../lib/clock.js'

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

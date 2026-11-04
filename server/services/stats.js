// สถิติการนัดหมาย — ขั้น J: S10 (สถิติรายเดือน) / S11 (อัตราไม่มาย้อนหลัง)
//
// กฎที่ใช้ (project-snapshot หมวด 5 + ตัดสินขั้น J):
// - นับตาม "เดือนของวันนัด" (appointment_date) · ไม่นับแถว held (ยังไม่ใช่นัด)
// - มาตามนัด (attended) = completed (ถึงเวลานัดแล้ว และ staff ไม่ได้กด [ไม่มา])
//   + booked ที่ถึงเวลาแล้วแต่ cron ยังไม่ทันเปลี่ยน — เส้นเดียวกับปุ่ม [ไม่มา] (J2ก, 319ก)
//   นัด booked ที่ยังไม่ถึงเวลา นับใน total อย่างเดียว
// - อัตราไม่มา = ไม่มา ÷ (มา + ไม่มา) × 100 ทศนิยม 1 ตำแหน่ง (ไม่นับยกเลิก) · ตัวหารเป็น 0 → null
// - diffPoints = อัตราเดือนนี้ − อัตราเดือนก่อน โดยใช้ตัวเลขที่ปัดแล้ว (ตรงกับที่จอแสดง) (J5ก)
// - วันทำการ / จำนวนคิว นับจากปฏิทินเสมอ = เสาร์–อาทิตย์ในเดือน × 12 คิว
//   (ไม่หักคิวที่ปิด J3ก · เดือนที่ไม่มีนัดก็นับ J4ก · ไม่มีตารางช่วงเวลา — ช่วงเวลาคำนวณจากกฎ)
// - เวลาปัจจุบันมาจาก clock.js เท่านั้น (DEMO_NOW ใช้ได้)

import { query } from '../db.js'
import { now, bangkokDateOf, bangkokTime, addDays, isOpenDay } from '../lib/clock.js'

// ค่าอ้างอิงอัตราไม่มาจากงานวิจัย (%) — ค่าคงที่ ไม่ใส่ .env เพราะไม่เปลี่ยนตามเครื่อง (J7ก)
export const REFERENCE_RATE = 22.0

// จำนวนคิวต่อวัน (07:00–10:00 คิวละ 15 นาที)
const SLOTS_PER_DAY = 12

// ---------- ตัวช่วยเรื่องเดือน 'YYYY-MM' ----------

// ข้อความเป็นเดือนแบบ 'YYYY-MM' ที่ถูกต้องไหม (เช่น '2026-10' ✅ · '2026-13', '2026-1', 'abc' ❌)
export function isValidMonthString(text) {
  return typeof text === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(text)
}

// เดือนปัจจุบันตามเวลาไทย เช่น '2026-10'
export function currentMonth() {
  return bangkokDateOf(now()).slice(0, 7)
}

// เลื่อนเดือน เช่น ('2026-01', -1) → '2025-12'
export function addMonths(month, count) {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + count // นับเป็น "เดือนที่เท่าไรนับจากปี 0"
  const newYear = Math.floor(index / 12)
  const newMonth = (index % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

// จำนวนวันเปิดทำการ (เสาร์–อาทิตย์) ในเดือนนั้น จากปฏิทิน
function countOpenDays(month) {
  let count = 0
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) {
    if (isOpenDay(day)) count++
  }
  return count
}

// อัตราไม่มา (%) ทศนิยม 1 ตำแหน่ง ปัดครึ่งขึ้น (6.25 → 6.3) · ตัวหารเป็น 0 → null
// คูณ 1000 ก่อนหาร แล้วปัดเป็นจำนวนเต็ม → ไม่เจอปัญหาทศนิยมเพี้ยนของ JavaScript
function calculateNoShowRate(counts) {
  const divider = counts.attended + counts.noShow
  if (divider === 0) return null
  return Math.round((counts.noShow * 1000) / divider) / 10
}

// ---------- นับนัดจากฐานข้อมูล ----------

// นับนัดของทุกเดือนตั้งแต่ fromMonth ถึง toMonth (รวมทั้งสองเดือน) ด้วยคำสั่งเดียว
// คืน { 'YYYY-MM': { total, attended, noShow, cancelled } } (เดือนที่ไม่มีนัด → ทุกค่าเป็น 0)
async function countAppointmentsByMonth(fromMonth, toMonth, currentTime) {
  const result = await query(
    `SELECT status, appointment_date, slot_time
     FROM appointments
     WHERE appointment_date >= $1 AND appointment_date < $2
       AND status <> 'held'`,
    [`${fromMonth}-01`, `${addMonths(toMonth, 1)}-01`], // ตั้งแต่วันที่ 1 ของเดือนแรก ถึงก่อนวันที่ 1 ของเดือนถัดจากเดือนสุดท้าย
  )

  const countsByMonth = {}
  for (let month = fromMonth; month <= toMonth; month = addMonths(month, 1)) {
    countsByMonth[month] = { total: 0, attended: 0, noShow: 0, cancelled: 0 }
  }

  for (const row of result.rows) {
    const counts = countsByMonth[row.appointment_date.slice(0, 7)]
    counts.total++
    if (row.status === 'no_show') counts.noShow++
    else if (row.status === 'cancelled') counts.cancelled++
    else if (row.status === 'completed') counts.attended++
    // booked: ถึงเวลานัดแล้ว (cron ยังไม่ทันเปลี่ยน) = มาตามนัด · ยังไม่ถึง = นับใน total อย่างเดียว
    else if (currentTime >= bangkokTime(row.appointment_date, row.slot_time)) counts.attended++
  }
  return countsByMonth
}

// ---------- S10 / S11 ----------

// S10 — สถิติของเดือนที่เลือก + เทียบกับเดือนก่อน
export async function getMonthlyStats(month) {
  const prevMonth = addMonths(month, -1)
  const countsByMonth = await countAppointmentsByMonth(prevMonth, month, now())
  const counts = countsByMonth[month]
  const workingDays = countOpenDays(month)

  const noShowRate = calculateNoShowRate(counts)
  const prevNoShowRate = calculateNoShowRate(countsByMonth[prevMonth])
  const diffPoints =
    noShowRate === null || prevNoShowRate === null
      ? null
      : Math.round((noShowRate - prevNoShowRate) * 10) / 10 // ลบตัวเลขที่ปัดแล้ว แล้วปัดอีกครั้งกันทศนิยมเพี้ยน (6.3 − 7.2 = −0.9)

  return {
    month,
    workingDays,
    totalSlots: workingDays * SLOTS_PER_DAY,
    total: counts.total,
    attended: counts.attended,
    noShow: counts.noShow,
    cancelled: counts.cancelled,
    noShowRate,
    prevMonth,
    prevNoShowRate,
    diffPoints,
    referenceRate: REFERENCE_RATE,
  }
}

// S11 — อัตราไม่มาย้อนหลัง monthCount เดือน เรียงจากเก่าไปใหม่ เดือนสุดท้าย = เดือนปัจจุบัน
export async function getNoShowTrend(monthCount) {
  const lastMonth = currentMonth()
  const firstMonth = addMonths(lastMonth, -(monthCount - 1))
  const countsByMonth = await countAppointmentsByMonth(firstMonth, lastMonth, now())

  const months = Object.keys(countsByMonth).map((month) => ({
    month,
    noShowRate: calculateNoShowRate(countsByMonth[month]),
  }))
  return { referenceRate: REFERENCE_RATE, months }
}

// นาฬิกากลางของ server — ทุกกฎที่ใช้ "เวลาปัจจุบัน" ต้องเรียก now() จากไฟล์นี้เท่านั้น
// (ห้ามใช้ new Date() / Date.now() / SQL now() ในกฎเวลา เพราะจะไม่ตาม DEMO_NOW)
//
// โหมดเดโม: ตั้งใน server/.env
//   DEMO_MODE=true
//   DEMO_NOW=2026-10-17 07:12      ← เวลาไทย รูปแบบ YYYY-MM-DD HH:MM
// แล้ว server จะเชื่อว่าตอนเปิด server คือเวลานั้น และเดินต่อไปตามเวลาจริง
// (เปิด server ตอน 13:00:00 จริง → 13:00:30 จริง server บอก 07:12:30)
// ⚠️ เซฟไฟล์แล้ว node --watch รีสตาร์ท server → เวลากลับไปเริ่มที่ DEMO_NOW ใหม่
// ไม่ได้ตั้ง DEMO_NOW หรือ DEMO_MODE ไม่ใช่ true → ใช้เวลาจริง

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000 // ไทยเร็วกว่าเวลาสากล (UTC) 7 ชั่วโมง
const DAY_MS = 24 * 60 * 60 * 1000

// ค่าจาก .env เป็นข้อความเสมอ → เทียบกับ 'true'
export const DEMO_MODE = process.env.DEMO_MODE === 'true'

// ส่วนต่างระหว่างเวลาเดโมกับเวลาจริง (0 = ใช้เวลาจริง)
let offsetMs = 0

const demoNowText = (process.env.DEMO_NOW || '').trim()
if (demoNowText) {
  if (!DEMO_MODE) {
    // กันเผลอใช้เวลาปลอมตอนใช้งานจริง: ต้องเปิด DEMO_MODE คู่กันเท่านั้น
    console.warn('⚠️  ตั้ง DEMO_NOW ไว้ แต่ DEMO_MODE ไม่ใช่ true → ไม่ใช้เวลาเดโม (ใช้เวลาจริง)')
  } else {
    const demoStart = parseThaiDateTime(demoNowText)
    offsetMs = demoStart.getTime() - Date.now()
    console.log(`🕒 โหมดเดโม: เวลา server เริ่มที่ ${demoNowText} (เวลาไทย) แล้วเดินต่อ — ปิดได้ด้วย DEMO_MODE=false`)
  }
}

// แปลง 'YYYY-MM-DD HH:MM' (เวลาไทย) → Date · ผิดรูปแบบ / วันที่ไม่มีจริง → หยุด server พร้อมบอกวิธีแก้
function parseThaiDateTime(text) {
  const match = text.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/)
  const date = match ? new Date(`${match[1]}T${match[2]}:00+07:00`) : null
  // เช็กว่าแปลงกลับแล้วได้ข้อความเดิม (กันวันที่ไม่มีจริง เช่น 2026-02-30 หรือ 25:00)
  if (!date || Number.isNaN(date.getTime()) || toThaiIso(date).slice(0, 16) !== `${match[1]}T${match[2]}`) {
    throw new Error(`DEMO_NOW ไม่ถูกต้อง ("${text}") → ต้องเป็นเวลาไทยแบบ YYYY-MM-DD HH:MM เช่น DEMO_NOW=2026-10-17 07:12`)
  }
  return date
}

// เวลาปัจจุบันของระบบ (Date) — เวลาจริง หรือเวลาเดโมที่เดินต่อ
export function now() {
  return new Date(Date.now() + offsetMs)
}

// ตอนนี้ใช้เวลาเดโมอยู่ไหม
export function isDemoTime() {
  return offsetMs !== 0
}

// ---------- ตัวช่วยวันที่/เวลาไทย (ใช้ร่วมกันทุกไฟล์) ----------

// Date → ข้อความเวลาไทยแบบ ISO ตาม API contract เช่น '2026-10-17T07:12:30.123+07:00'
export function toThaiIso(date) {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().replace('Z', '+07:00')
}

// Date → วันที่ไทย 'YYYY-MM-DD' (เช่น 01:00 น. วันที่ 17 ไทย = 18:00 วันที่ 16 UTC → ได้ '2026-10-17')
export function bangkokDateOf(date) {
  return toThaiIso(date).slice(0, 10)
}

// 'YYYY-MM-DD' + จำนวนวัน → 'YYYY-MM-DD'
export function addDays(dateString, days) {
  return new Date(Date.parse(`${dateString}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

// วันเปิดทำการ = เสาร์ (6) และอาทิตย์ (0)
export function isOpenDay(dateString) {
  const dayOfWeek = new Date(`${dateString}T00:00:00Z`).getUTCDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

// วันเปิดทำการถัดไป 'YYYY-MM-DD' = เสาร์/อาทิตย์ที่ใกล้ที่สุด นับวันนี้ด้วยถ้าวันนี้เปิด
// (S4 / S7 ใช้ตอนหน้าเว็บไม่ได้ส่ง date มา)
export function nextOpenDay() {
  let day = bangkokDateOf(now())
  while (!isOpenDay(day)) day = addDays(day, 1)
  return day
}

// ข้อความเป็นวันที่ 'YYYY-MM-DD' ที่มีอยู่จริงไหม (กัน '17-10-2026', '2026-02-30')
export function isValidDateString(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

// วันที่ + เวลา (เวลาไทย) → Date เช่น ('2026-10-17', '07:15') → 07:15 น. ไทย
// (ข้อ #18 ใน er-review: slot_date + start_time ต้องรวมกันเป็นเวลาไทยเสมอ)
export function bangkokTime(dateString, time) {
  return new Date(`${dateString}T${time.slice(0, 5)}:00+07:00`)
}

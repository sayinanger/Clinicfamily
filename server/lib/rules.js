// ตัวเลขกฎเวลาของคลินิก (claude/time-rules-v2.md) — อ่านจาก server/.env ที่เดียว ไฟล์อื่น import จากที่นี่
// ค่าจาก .env เป็นข้อความเสมอ → แปลงด้วย Number() · ไม่ได้ตั้ง / ตั้งผิด (ไม่ใช่ตัวเลขบวก) → ใช้ค่าสำรองในโค้ด

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name])
  return value > 0 ? value : fallback
}

// ถือคิวได้นานกี่วินาที (ปกติ 300 = 5 นาที · เดโมตั้ง 30)
export const HOLD_SECONDS = readPositiveNumber('HOLD_SECONDS', 300)
// เวลายืนยันขั้นต่ำ: เหลือเวลายืนยันไม่ถึงเท่านี้ (วินาที) → ไม่ให้ถือคิว
export const HOLD_MIN_SECONDS = readPositiveNumber('HOLD_MIN_SECONDS', 60)
// ต้องยืนยันการจองก่อนเวลานัดอย่างน้อยกี่นาที
export const BOOKING_CUTOFF_MINUTES = readPositiveNumber('BOOKING_CUTOFF_MINUTES', 10)
// ยกเลิก/เลื่อนนัดได้ถึงก่อนเวลานัดกี่นาที
export const CHANGE_CUTOFF_MINUTES = readPositiveNumber('CHANGE_CUTOFF_MINUTES', 15)
// เหลือเวลาก่อนนัดน้อยกว่ากี่ชั่วโมง = นัดกระชั้น (ไม่มีข้อความเตือน)
export const SHORT_NOTICE_HOURS = readPositiveNumber('SHORT_NOTICE_HOURS', 3)
// จองล่วงหน้าได้ไม่เกินกี่วัน (ไม่อยู่ใน .env — ตายตัวตามขอบเขตโปรเจกต์)
export const BOOKING_DAYS_AHEAD = 14

// เบอร์โทรคลินิก (U8 ส่งให้หน้า "นัดของฉัน" แสดงตอนยกเลิก/เลื่อนไม่ได้แล้ว) — ไม่ตั้ง → "" (M7ก)
export const CLINIC_PHONE = (process.env.CLINIC_PHONE || '').trim()

// แปลงเป็นมิลลิวินาที (ใช้คำนวณกับ Date)
export const MINUTE_MS = 60 * 1000
export const HOLD_MS = HOLD_SECONDS * 1000
export const HOLD_MIN_MS = HOLD_MIN_SECONDS * 1000
export const BOOKING_CUTOFF_MS = BOOKING_CUTOFF_MINUTES * MINUTE_MS
export const CHANGE_CUTOFF_MS = CHANGE_CUTOFF_MINUTES * MINUTE_MS
export const SHORT_NOTICE_MS = SHORT_NOTICE_HOURS * 60 * MINUTE_MS

// เตือนตอนเปิด server ถ้ายังไม่ได้ตั้งเบอร์คลินิก (M7ก)
export function warnClinicSettings() {
  if (!CLINIC_PHONE) {
    console.warn('⚠️  ยังไม่ได้ตั้ง CLINIC_PHONE ใน server/.env → หน้า "นัดของฉัน" จะไม่มีเบอร์โทรคลินิก')
  }
}

// ข้อความ LINE ถึงผู้ป่วย (ขั้น N) — ยืนยันการจอง (U9), ยกเลิกนัด (U10), เลื่อนนัด (U11)
//
// N1ก: ตอนนี้ "ส่ง" = พิมพ์ลง Terminal ของ server เท่านั้น (ยังไม่ต่อ LINE Messaging API)
//      วันที่ 19 (รอบ LINE) จะเปลี่ยนข้างใน sendLineMessage() ให้ส่งจริง — ไฟล์อื่นไม่ต้องแก้
// N2ก: ส่งไม่สำเร็จ → การจอง/ยกเลิก/เลื่อนยังสำเร็จตามปกติ แค่พิมพ์ error ไว้ (notifyPatient จัดการ)
// ข้อความเป็นร่าง ปรับถ้อยคำได้ตอนทำรอบ LINE

import { now, toThaiIso } from './clock.js'

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const GENDER_TEXT = { male: 'ชาย', female: 'หญิง', unspecified: 'ไม่ระบุ' }

// '2026-10-17' → 'วันเสาร์ที่ 17 ต.ค. 2569'
export function thaiDateText(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `วัน${THAI_DAYS[weekday]}ที่ ${day} ${THAI_MONTHS[month - 1]} ${year + 543}`
}

// นัด (แบบ U8: date, startTime, endTime) → 2 บรรทัด วันที่ + เวลา
function appointmentLines(appointment) {
  return [`วันที่: ${thaiDateText(appointment.date)}`, `เวลา: ${appointment.startTime}–${appointment.endTime} น.`]
}

// บรรทัดเส้นตายยกเลิก/เลื่อน (ตาม contract U9)
function changeRuleLines(appointment) {
  const deadlineText = appointment.changeDeadline.slice(11, 16) // '2026-10-17T07:15:00+07:00' → '07:15'
  return [
    appointment.canChange
      ? `ยกเลิกหรือเลื่อนได้ก่อน ${deadlineText} น.`
      : 'นัดนี้ยกเลิกหรือเลื่อนผ่านระบบไม่ได้ หากมาไม่ได้ กรุณาโทรแจ้งคลินิก',
    'หากมาช้าเกิน 5 นาที อาจถือว่าไม่มาตามนัด',
  ]
}

// U9 — ยืนยันการจอง (ชื่อ เพศ อายุ วันที่ เวลา สถานะ ตามภาพ 3.14 ในรายงาน)
// profile = แบบ U1 (firstName, lastName, gender, age) · appointment = แบบ U8
export function bookingConfirmedText(profile, appointment) {
  return [
    'จองคิวสำเร็จ',
    `ชื่อ: ${profile.firstName} ${profile.lastName}`,
    `เพศ: ${GENDER_TEXT[profile.gender] || '-'} อายุ: ${profile.age} ปี`,
    ...appointmentLines(appointment),
    'สถานะ: ยืนยันแล้ว',
    '',
    ...changeRuleLines(appointment),
  ].join('\n')
}

// U10 — ยืนยันการยกเลิก
export function appointmentCancelledText(appointment) {
  return ['ยกเลิกนัดเรียบร้อยแล้ว', ...appointmentLines(appointment), 'สถานะ: ยกเลิก'].join('\n')
}

// U11 — ยืนยันการเลื่อน · previous = { date, startTime } ของนัดเดิม
export function appointmentRescheduledText(appointment, previous) {
  return [
    'เลื่อนนัดสำเร็จ',
    `นัดเดิม: ${thaiDateText(previous.date)} เวลา ${previous.startTime} น.`,
    'นัดใหม่',
    ...appointmentLines(appointment),
    'สถานะ: ยืนยันแล้ว',
    '',
    ...changeRuleLines(appointment),
  ].join('\n')
}

// "ส่ง" ข้อความหา 1 คน (lineUserId = รหัส LINE ของผู้ป่วย เช่น U1234... / seed-01)
// N1ก: ตอนนี้พิมพ์ลง Terminal · วันที่ 19 เปลี่ยนเป็นเรียก LINE push message (throw เมื่อส่งไม่สำเร็จ)
export async function sendLineMessage(lineUserId, text) {
  console.log(`\n📨 [LINE → ${lineUserId}] ${toThaiIso(now())}\n${text}\n`)
}

// ส่งข้อความโดยไม่ให้ความผิดพลาดกระทบงานหลัก (N2ก) — ใช้หลังบันทึกฐานข้อมูลเสร็จแล้ว (หลัง COMMIT)
export async function notifyPatient(lineUserId, text) {
  try {
    await sendLineMessage(lineUserId, text)
  } catch (error) {
    console.error(`ส่งข้อความ LINE ไม่สำเร็จ (ผู้ป่วย ${lineUserId}) — การทำรายการยังสำเร็จ:`, error)
  }
}

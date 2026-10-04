// ตัวช่วยแปลงวันที่เป็นภาษาไทย (ปี พ.ศ.) สำหรับแสดงบนหน้าจอ
// API ส่งวันที่มาเป็น 'YYYY-MM-DD' ปี ค.ศ. เช่น '2026-10-03'

// แปลงข้อความ 'YYYY-MM-DD' เป็น Date (ตามเวลาเครื่อง ไม่เพี้ยนข้ามวัน)
function toDateObject(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// '2026-10-03' → '3 ตุลาคม 2569' (ใช้ในกล่องเลือกวันที่)
export function formatThaiDateLong(dateString) {
  return toDateObject(dateString).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// '2026-10-03' → '3 ต.ค. 2569' (ใช้ในตาราง)
export function formatThaiDateShort(dateString) {
  return toDateObject(dateString).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

}

//---------------หน้าสถิติ---------------

// แปลงข้อความเดือน 'YYYY-MM' เป็น Date (วันที่ 1 ของเดือนนั้น)
function monthToDateObject(monthString) {
  const [year, month] = monthString.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

// '2026-05' → 'พฤษภาคม 2569' (ใช้ในช่องเลือกเดือน หน้าสถิติ)
export function formatThaiMonthLong(monthString) {
  return monthToDateObject(monthString).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  })
}

// '2026-05' → 'พ.ค. 69' (ใช้ใต้แท่งกราฟ หน้าสถิติ)
export function formatThaiMonthShort(monthString) {
  return monthToDateObject(monthString).toLocaleDateString('th-TH', {
    month: 'short',
    year: '2-digit',
  })
}


//---------------หน้าผู้ป่วย (LIFF)---------------

// '0845969924' → '084-596-9924' (เบอร์ 10 หลัก) — ถ้าไม่ใช่ 10 หลัก คืนค่าเดิม
export function formatPhone(phone) {
  if (!/^\d{10}$/.test(phone)) return phone
  return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
}

// ชื่อเดือนภาษาไทย (ลำดับที่ 0 = มกราคม) — ใช้ในช่องเลือกวันเกิด
export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

// ชื่อวัน/เดือนแบบย่อ (เขียนเองแทน toLocaleDateString เพื่อให้ทุกเบราว์เซอร์แสดงเหมือนกัน)
const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] // 0 = อาทิตย์
const THAI_WEEKDAYS_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// '2026-10-03' → 'ส. 3 ต.ค.' (ปุ่มเลือกวัน หน้าจองคิว)
export function formatThaiDayChip(dateString) {
  const date = toDateObject(dateString)
  return `${THAI_WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]}`
}

// '2026-10-10' → 'เสาร์ 10 ต.ค. 2569' (หน้าจองคิว / ยกเลิก / เลื่อนนัด — แบบ Figma 279:446 / 279:240 ใช้ทุกหน้า ผู้ใช้เลือก 2026-10-04)
export function formatThaiDateWeekdayShort(dateString) {
  const date = toDateObject(dateString)
  const buddhistYear = date.getFullYear() + 543 // ปี ค.ศ. → พ.ศ.
  return `${THAI_WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]} ${buddhistYear}`
}

// เวลา ISO เช่น '2026-10-03T07:15:00+07:00' → '07:15' (ตัดเอาชั่วโมง:นาที เวลาไทย)
// ย้ายมาจาก LiffBooking.jsx ในขั้น 7.5 เพื่อใช้ร่วมกับหน้ายกเลิก/เลื่อนนัด
export function timeFromIso(iso) {
  return iso.slice(11, 16)
}

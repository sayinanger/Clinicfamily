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
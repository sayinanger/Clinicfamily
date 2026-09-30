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
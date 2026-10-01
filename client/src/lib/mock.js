// ข้อมูลปลอม (mock) — ใช้ตอนยังไม่มี server (VITE_USE_MOCK=true)
// - ต้องตอบกลับหน้าตาเดียวกับ docs/api-contract.md ทุกข้อ
// - เก็บในหน่วยความจำ: กดปุ่มแล้วข้อมูลเปลี่ยนได้ แต่รีเฟรชหน้าแล้วกลับเป็นค่าเริ่มต้น
// - ไม่เช็กกฎจริง กฎทั้งหมดทำที่ server
// - ชื่อ/เบอร์เป็นคนสมมติทั้งหมด

// หน่วงเวลาให้เหมือนเรียก server จริง (มิลลิวินาที)
const MOCK_DELAY_MS = 300

// ===== ข้อมูลเริ่มต้น =====

// บัญชี staff (ระบบมี 1 บัญชี) — ใช้ login ในโหมดข้อมูลปลอม: staff / 1234
const mockStaff = { staffId: 1, name: 'Staff User', username: 'staff', password: '1234' }

// staff ที่ login อยู่ (แทน session cookie ของ server จริง) — null = ยังไม่ login
// จำไว้ใน sessionStorage ของเบราว์เซอร์ → กดรีเฟรชแล้วยัง login อยู่ จนกว่าจะปิดแท็บ
let loggedInStaff = JSON.parse(sessionStorage.getItem('mockLoggedInStaff') || 'null')
function saveLoggedInStaff(staff) {
  loggedInStaff = staff
  sessionStorage.setItem('mockLoggedInStaff', JSON.stringify(staff))
}

// API ของ staff (ยกเว้น login) ต้อง login ก่อน — ไม่ login → 401 เหมือน server จริง
function requireStaffLogin() {
  if (!loggedInStaff) {
    throw mockError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ')
  }
}

// ===== ตัวช่วยเรื่องวันที่ =====

// แปลง Date เป็นข้อความ 'YYYY-MM-DD' (ตามเวลาเครื่อง)
function toDateString(dateObject) {
  const year = dateObject.getFullYear()
  const month = String(dateObject.getMonth() + 1).padStart(2, '0')
  const day = String(dateObject.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// วันนี้เป็นเสาร์/อาทิตย์? (getDay: 0 = อาทิตย์, 6 = เสาร์)
function isOpenDay(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const dayOfWeek = new Date(year, month - 1, day).getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

// วันเปิดทำการถัดไป = เสาร์/อาทิตย์ที่ใกล้ที่สุด (นับวันนี้ด้วยถ้าวันนี้เปิด)
function nextOpenDay() {
  const day = new Date()
  while (!isOpenDay(toDateString(day))) {
    day.setDate(day.getDate() + 1)
  }
  return toDateString(day)
}

// วันสุดท้ายที่มีเวลาให้จอง = วันนี้ + 14 วัน (server จริงสร้างเวลาล่วงหน้าแค่นี้)
// วันที่ไกลกว่านี้ → ยังไม่มีเวลา และยังไม่มีนัด
function isBeyondBookingRange(dateString) {
  const lastDay = new Date()
  lastDay.setDate(lastDay.getDate() + 14)
  return dateString > toDateString(lastDay) // เทียบข้อความ 'YYYY-MM-DD' ได้เลย
}

// เวลาหมดสิทธิ์แก้คืน = ตอนนี้ + 5 นาที ในรูปแบบ ISO เวลาไทย เช่น '2026-10-03T08:10:00+07:00'
function fiveMinutesFromNowIso() {
  const bangkokMs = Date.now() + 5 * 60 * 1000 + 7 * 60 * 60 * 1000
  return new Date(bangkokMs).toISOString().slice(0, 19) + '+07:00'
}

// ===== ข้อมูลนัดหมาย (หน้า "ดูรายการนัดหมาย") =====

// ผู้ป่วยสมมติ (ชื่อ/เบอร์ไม่ใช่คนจริง)
const mockPatients = [
  { firstName: 'สมหญิง', lastName: 'ใจดี', phone: '0891110001' },
  { firstName: 'ประเสริฐ', lastName: 'มั่นคง', phone: '0891110002' },
  { firstName: 'วันเพ็ญ', lastName: 'แสงทอง', phone: '0891110003' },
  { firstName: 'ธนากร', lastName: 'รุ่งเรือง', phone: '0891110004' },
  { firstName: 'มาลี', lastName: 'ศรีสุข', phone: '0891110005' },
  { firstName: 'สุรชัย', lastName: 'บุญมา', phone: '0891110006' },
  { firstName: 'กาญจนา', lastName: 'ทองดี', phone: '0891110007' },
  { firstName: 'วิชัย', lastName: 'พงษ์ไพร', phone: '0891110008' },
  { firstName: 'อรุณี', lastName: 'ชื่นใจ', phone: '0891110009' },
  { firstName: 'สมศักดิ์', lastName: 'เพียรดี', phone: '0891110010' },
  { firstName: 'นิภา', lastName: 'สายสุวรรณ', phone: '0891110011' },
  { firstName: 'ชัยวัฒน์', lastName: 'ดวงแก้ว', phone: '0891110012' },
]

// 12 เวลาของวันเปิด (07:00–09:45 คิวละ 15 นาที)
const allStartTimes = ['07:00', '07:15', '07:30', '07:45', '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45']

// แบบสถานะของแต่ละแถว — ครบทุกแบบที่หน้าจอต้องแสดง
// (สมมติว่าตอนนี้ประมาณ 08:05 ของวันนั้น: นัดถึง 08:00 กด [ไม่มา] ได้, หลังจากนั้นยังไม่ถึงเวลา)
const B_NOW = { status: 'booked', canMarkNoShow: true } // ยืนยันแล้ว-ถึงเวลา → ปุ่ม [ไม่มา] แดง
const B_LATER = { status: 'booked', canMarkNoShow: false } // ยืนยันแล้ว-ยังไม่ถึงเวลา → ปุ่มเทา
const NS_UNDO = { status: 'no_show', canUndoNoShow: true } // ไม่มา-ยังแก้คืนได้ → ปุ่ม [แก้คืน]
const NS_DONE = { status: 'no_show', canUndoNoShow: false } // ไม่มา-เกิน 5 นาทีแล้ว
const CANCEL = { status: 'cancelled' } // ยกเลิก → "—"

// วันเปิดทำการถัดไป: ครบ 12 คิว (ไว้ตรวจว่าจอ MacBook Air เห็นครบ)
const patternFull = [B_NOW, NS_UNDO, CANCEL, NS_DONE, B_NOW, B_LATER, B_LATER, CANCEL, B_LATER, B_LATER, B_LATER, B_LATER]
// วันเปิดอื่น ๆ: 6 คิว แบบเดียวกับตัวอย่างใน Figma
const patternSix = [B_NOW, NS_UNDO, CANCEL, B_LATER, B_LATER, CANCEL]

// เก็บนัดที่สร้างแล้วของแต่ละวัน { 'YYYY-MM-DD': [นัด, ...] } → กดปุ่มแล้วจำค่าไว้
const appointmentsByDate = {}
let nextAppointmentId = 1

// สร้างนัดปลอมของวันที่ขอ (สร้างครั้งแรกครั้งเดียว ครั้งต่อไปใช้ของเดิม)
function getAppointmentsOfDate(date) {
  if (!appointmentsByDate[date]) {
    let pattern = []
    if (date === nextOpenDay()) pattern = patternFull
    else if (isOpenDay(date) && !isBeyondBookingRange(date)) pattern = patternSix
    // วันธรรมดา หรือไกลเกิน 14 วัน → pattern ว่าง = ไม่มีนัด

    appointmentsByDate[date] = pattern.map((rowStatus, index) => ({
      appointmentId: nextAppointmentId++,
      ...mockPatients[index],
      date,
      startTime: allStartTimes[index],
      status: rowStatus.status,
      canMarkNoShow: rowStatus.canMarkNoShow ?? false,
      canUndoNoShow: rowStatus.canUndoNoShow ?? false,
      undoNoShowUntil: rowStatus.canUndoNoShow ? fiveMinutesFromNowIso() : null,
    }))
  }
  return appointmentsByDate[date]
}

// หานัดจาก id (ค้นทุกวันที่สร้างไว้แล้ว)
function findAppointment(appointmentId) {
  for (const list of Object.values(appointmentsByDate)) {
    const found = list.find((item) => item.appointmentId === Number(appointmentId))
    if (found) return found
  }
  throw mockError(404, 'NOT_FOUND', 'ไม่พบนัดหมายนี้')
}

// ===== ข้อมูลเวลา (หน้า "จัดการเวลา") =====
// ให้ตรงกับหน้ารายการนัด: คิวที่มีนัด (ยืนยันแล้ว/ไม่มา) → "มีผู้จองแล้ว"
//                          คิวที่นัดถูกยกเลิก หรือไม่มีนัด → "เปิดรับการจอง"
// วันเปิดอื่น ๆ (ไม่ใช่วันเปิดทำการถัดไป) เพิ่มตัวอย่าง "กำลังถูกจอง" / "ปิดรับการจอง"
// ในคิวที่ไม่มีนัด เพื่อให้เห็นครบทุกสถานะ
const exampleStatusWhenNoAppointment = { '08:30': 'held', '08:45': 'closed', '09:00': 'closed' }

// เก็บเวลาที่สร้างแล้วของแต่ละวัน { 'YYYY-MM-DD': [slot, ...] } → กดปิด/เปิดแล้วจำค่าไว้
const slotsByDate = {}
let nextSlotId = 101

// เวลาจบคิว = เวลาเริ่ม + 15 นาที เช่น '07:45' → '08:00'
function addFifteenMinutes(startTime) {
  const [hour, minute] = startTime.split(':').map(Number)
  const total = hour * 60 + minute + 15
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// สร้างเวลาปลอมของวันที่ขอ (สร้างครั้งแรกครั้งเดียว ครั้งต่อไปใช้ของเดิม)
function getSlotsOfDate(date) {
  if (!slotsByDate[date]) {
    if (!isOpenDay(date) || isBeyondBookingRange(date)) {
      slotsByDate[date] = [] // วันธรรมดา หรือไกลเกิน 14 วัน → ไม่มีเวลา (ตาม contract)
    } else {
      const appointments = getAppointmentsOfDate(date) // นัดของวันเดียวกัน (ใช้ข้อมูลชุดเดียวกับหน้ารายการนัด)
      const isNextOpenDay = date === nextOpenDay()
      slotsByDate[date] = allStartTimes.map((startTime) => {
        // มีนัดที่ยังไม่ยกเลิกในเวลานี้ไหม
        const hasAppointment = appointments.some(
          (item) => item.startTime === startTime && item.status !== 'cancelled',
        )
        let status = 'available'
        if (hasAppointment) status = 'booked'
        else if (!isNextOpenDay && exampleStatusWhenNoAppointment[startTime]) {
          status = exampleStatusWhenNoAppointment[startTime]
        }
        return { slotId: nextSlotId++, startTime, endTime: addFifteenMinutes(startTime), status }
      })
    }
  }
  return slotsByDate[date]
}

// หาเวลาจาก id (ค้นทุกวันที่สร้างไว้แล้ว)
function findSlot(slotId) {
  for (const list of Object.values(slotsByDate)) {
    const found = list.find((item) => item.slotId === Number(slotId))
    if (found) return found
  }
  throw mockError(404, 'NOT_FOUND', 'ไม่พบเวลานี้')
}

// ===== รายการ API ที่มีข้อมูลปลอมแล้ว — เพิ่มทีละหน้า =====
// แต่ละรายการ: { method, path, handle }
//   path ใส่ตัวแปรได้ เช่น '/api/admin/slots/:id/close' → params.id
//   handle({ body, params, query }) คืนข้อมูลตอบกลับ หรือ throw mockError(...)
const handlers = [
  // S1 — staff เข้าสู่ระบบ
  {
    method: 'POST',
    path: '/api/admin/login',
    handle({ body }) {
      if (!body?.username || !body?.password) {
        throw mockError(400, 'VALIDATION_ERROR', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
      }
      if (body.username !== mockStaff.username || body.password !== mockStaff.password) {
        throw mockError(401, 'INVALID_LOGIN', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      }
      saveLoggedInStaff({ staffId: mockStaff.staffId, name: mockStaff.name })
      return { staff: loggedInStaff }
    },
  },

  // S2 — staff ออกจากระบบ
  {
    method: 'POST',
    path: '/api/admin/logout',
    handle() {
      saveLoggedInStaff(null)
      return { ok: true }
    },
  },

  // S3 — staff ที่ login อยู่
  {
    method: 'GET',
    path: '/api/admin/me',
    handle() {
      requireStaffLogin()
      return { staff: loggedInStaff }
    },
  },

  // S4 — รายการนัดของวันที่เลือก (ไม่ส่ง date → วันเปิดทำการถัดไป)
  {
    method: 'GET',
    path: '/api/admin/appointments',
    handle({ query }) {
      requireStaffLogin()
      const date = query.date || nextOpenDay()
      return { date, appointments: getAppointmentsOfDate(date) }
    },
  },

  // S5 — กด [ไม่มา]
  {
    method: 'POST',
    path: '/api/admin/appointments/:id/no-show',
    handle({ params }) {
      requireStaffLogin()
      const appointment = findAppointment(params.id)
      if (appointment.status !== 'booked') {
        throw mockError(409, 'INVALID_STATUS', 'นัดนี้ไม่อยู่ในสถานะยืนยันแล้ว')
      }
      appointment.status = 'no_show'
      appointment.canMarkNoShow = false
      appointment.canUndoNoShow = true
      appointment.undoNoShowUntil = fiveMinutesFromNowIso()
      return appointment
    },
  },

  // S6 — กด [แก้คืน]
  {
    method: 'DELETE',
    path: '/api/admin/appointments/:id/no-show',
    handle({ params }) {
      requireStaffLogin()
      const appointment = findAppointment(params.id)
      if (appointment.status !== 'no_show') {
        throw mockError(409, 'INVALID_STATUS', 'นัดนี้ไม่อยู่ในสถานะไม่มา')
      }
      appointment.status = 'booked'
      appointment.canMarkNoShow = true
      appointment.canUndoNoShow = false
      appointment.undoNoShowUntil = null
      return appointment
    },
  },

  // S7 — เวลาทั้งหมดของวันที่เลือก (ไม่ส่ง date → วันเปิดทำการถัดไป)
  {
    method: 'GET',
    path: '/api/admin/slots',
    handle({ query }) {
      requireStaffLogin()
      const date = query.date || nextOpenDay()
      return { date, slots: getSlotsOfDate(date) }
    },
  },

  // S8 — กด [ปิด] (ปิดได้เฉพาะเวลาที่ยังว่าง)
  {
    method: 'POST',
    path: '/api/admin/slots/:id/close',
    handle({ params }) {
      requireStaffLogin()
      const slot = findSlot(params.id)
      if (slot.status !== 'available') {
        throw mockError(409, 'SLOT_NOT_AVAILABLE', 'ปิดได้เฉพาะเวลาที่ยังว่าง')
      }
      slot.status = 'closed'
      return slot
    },
  },

  // S9 — กด [เปิด] (เปิดได้เฉพาะเวลาที่ถูกปิดอยู่)
  {
    method: 'POST',
    path: '/api/admin/slots/:id/open',
    handle({ params }) {
      requireStaffLogin()
      const slot = findSlot(params.id)
      if (slot.status !== 'closed') {
        throw mockError(409, 'SLOT_NOT_CLOSED', 'เวลานี้ไม่ได้ถูกปิดอยู่')
      }
      slot.status = 'available'
      return slot
    },
  },
]
// ===== ข้อมูลสถิติ (หน้า "สถิติ") — S10, S11 =====
// ตัวเลขคงที่ (ไม่ได้นับจากนัดปลอมของหน้ารายการนัด) ตั้งให้สมจริง:
// - 5 เดือนที่ผ่านมา: เต็มเดือน อัตราไม่มาลดลงเรื่อย ๆ (12.5% → 7.2%) แบบตัวอย่างใน Figma
//   (นัดรวมไม่เกิน 96 = 8 วันทำการ × 12 คิว เพราะบางเดือนมีเสาร์–อาทิตย์แค่ 8 วัน)
// - เดือนปัจจุบัน: เพิ่งเริ่ม → นัดส่วนใหญ่ยังไม่ถึงเวลา (นับใน total อย่างเดียว)
// - เดือนที่เก่ากว่านั้น: ยังไม่มีข้อมูล (ระบบยังไม่เปิดใช้) → ทุกค่าเป็น 0 และอัตราเป็น null ("—")
// key = จำนวนเดือนย้อนหลังจากเดือนปัจจุบัน (0 = เดือนนี้, 1 = เดือนก่อน, ...)
const statsByMonthsAgo = {
  0: { total: 40, attended: 15, noShow: 1, cancelled: 4 }, // อีก 20 นัดยังไม่ถึงเวลา
  1: { total: 90, attended: 77, noShow: 6, cancelled: 7 },
  2: { total: 95, attended: 79, noShow: 7, cancelled: 9 },
  3: { total: 91, attended: 77, noShow: 8, cancelled: 6 },
  4: { total: 90, attended: 74, noShow: 9, cancelled: 7 },
  5: { total: 96, attended: 77, noShow: 11, cancelled: 8 },
}
// ค่าอ้างอิงจากงานวิจัย (%)
const REFERENCE_RATE = 22.0

// เดือนที่ย้อนหลังไป monthsAgo เดือน → 'YYYY-MM' เช่น 0 = '2026-10', 1 = '2026-09'
function monthKey(monthsAgo) {
  const day = new Date()
  day.setDate(1) // ตั้งเป็นวันที่ 1 ก่อน กันเดือนเพี้ยน (เช่น 31 ต.ค. ย้อน 1 เดือน)
  day.setMonth(day.getMonth() - monthsAgo)
  return toDateString(day).slice(0, 7)
}

// 'YYYY-MM' ย้อนหลังจากเดือนปัจจุบันกี่เดือน (เดือนในอนาคตจะติดลบ)
function monthsAgoOf(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const today = new Date()
  return (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - monthNumber)
}

// จำนวนวันเปิดทำการ (เสาร์–อาทิตย์) ในเดือนนั้น
function countOpenDays(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const day = new Date(year, monthNumber - 1, 1)
  let count = 0
  while (day.getMonth() === monthNumber - 1) {
    if (isOpenDay(toDateString(day))) count++
    day.setDate(day.getDate() + 1)
  }
  return count
}

// ปัดทศนิยม 1 ตำแหน่ง เช่น 6.25 → 6.3
function roundOneDecimal(value) {
  return Math.round(value * 10) / 10
}

// อัตราไม่มา = ไม่มา ÷ (มาตามนัด + ไม่มา) × 100 — ตัวหารเป็น 0 → null
function calculateNoShowRate(counts) {
  const divider = counts.attended + counts.noShow
  if (divider === 0) return null
  return roundOneDecimal((counts.noShow / divider) * 100)
}

// สถิติของเดือนเดียว (หน้าตาตาม contract S10)
function buildMonthStats(month) {
  const monthsAgo = monthsAgoOf(month)
  const counts = statsByMonthsAgo[monthsAgo] || { total: 0, attended: 0, noShow: 0, cancelled: 0 }
  // เดือนที่ไม่มีข้อมูล = ระบบยังไม่สร้างเวลา → 0 วันทำการ
  const workingDays = statsByMonthsAgo[monthsAgo] ? countOpenDays(month) : 0

  const prevMonth = monthKey(monthsAgo + 1)
  const prevCounts = statsByMonthsAgo[monthsAgo + 1] || { attended: 0, noShow: 0 }
  const noShowRate = calculateNoShowRate(counts)
  const prevNoShowRate = calculateNoShowRate(prevCounts)

  return {
    month,
    workingDays,
    totalSlots: workingDays * 12,
    ...counts,
    noShowRate,
    prevMonth,
    prevNoShowRate,
    // ต่างจากเดือนก่อนกี่ "จุด" — ค่าใดเป็น null → null
    diffPoints: noShowRate === null || prevNoShowRate === null ? null : roundOneDecimal(noShowRate - prevNoShowRate),
    referenceRate: REFERENCE_RATE,
  }
}

// เพิ่ม API 2 ตัวเข้าไปในรายการ handlers ที่อยู่ข้างบน
handlers.push(
  // S10 — สถิติรายเดือน (ไม่ส่ง month → เดือนปัจจุบัน)
  {
    method: 'GET',
    path: '/api/admin/stats',
    handle({ query }) {
      requireStaffLogin()
      return buildMonthStats(query.month || monthKey(0))
    },
  },

  // S11 — อัตราไม่มาย้อนหลัง (เรียงจากเก่าไปใหม่ เดือนสุดท้าย = เดือนปัจจุบัน)
  {
    method: 'GET',
    path: '/api/admin/stats/trend',
    handle({ query }) {
      requireStaffLogin()
      const count = Number(query.months) || 6
      const months = []
      for (let monthsAgo = count - 1; monthsAgo >= 0; monthsAgo--) {
        const month = monthKey(monthsAgo)
        months.push({ month, noShowRate: buildMonthStats(month).noShowRate })
      }
      return { referenceRate: REFERENCE_RATE, months }
    },
  },
)

// สร้าง error แบบเดียวกับที่ server จริงจะตอบ
export function mockError(status, code, message, extra = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.data = { code, message, ...extra }
  return error
}

// เทียบ path จริงกับแบบ เช่น '/api/admin/slots/5/close' กับ '/api/admin/slots/:id/close'
// ตรงกัน → คืน { id: '5' }, ไม่ตรง → คืน null
function matchPath(pattern, path) {
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')
  if (patternParts.length !== pathParts.length) return null

  const params = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i]
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}

// api.js เรียกฟังก์ชันนี้แทน fetch เมื่อเปิดโหมดข้อมูลปลอม
export async function mockRequest(method, fullPath, body) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))

  // แยก '/api/slots?date=2026-10-03' เป็น path + query { date: '2026-10-03' }
  const [path, queryString = ''] = fullPath.split('?')
  const query = Object.fromEntries(new URLSearchParams(queryString))

  for (const handler of handlers) {
    const params = matchPath(handler.path, path)
    if (handler.method === method && params) {
      const result = await handler.handle({ body, params, query })
      // ส่งสำเนากลับไป กันหน้าเว็บไปแก้ข้อมูลปลอมโดยตรง
      return structuredClone(result)
    }
  }

  throw mockError(404, 'NOT_FOUND', `ยังไม่มีข้อมูลจำลองของ ${method} ${path}`)
}
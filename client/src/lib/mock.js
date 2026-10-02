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


// ======================================================================
// ===== ผู้ป่วยจำลอง (หน้า LIFF) — ขั้น 7 =====
// ======================================================================
// ตอนใช้ข้อมูลปลอม ไม่มี LINE จริง → สมมติว่ามีผู้ป่วย 1 คนเปิดหน้าอยู่
// เลือก "สถานการณ์" ได้ด้วยการเติม ?user=... ท้าย URL เช่น /liff?user=new
// สิ่งที่ทำ (กดยินยอม, บันทึกประวัติ) จำไว้ใน sessionStorage → รีเฟรชแล้วยังอยู่ จนกว่าจะปิดแท็บ

// ประวัติตัวอย่าง (คนสมมติ — ไม่ใช่คนจริง)
const sampleProfile = {
  firstName: 'อรุณี',
  lastName: 'ทดสอบดี',
  gender: 'female',
  birthDate: '1968-04-12',
  phone: '0891110099',
}

// สถานการณ์ที่เลือกได้ (key = ค่าที่ใส่ใน ?user=)
export const MOCK_PATIENT_SCENARIOS = {
  new: { label: 'คนใหม่ (ยังไม่ยินยอม PDPA)', pdpaAccepted: false, profile: null },
  pdpa: { label: 'ยินยอมแล้ว แต่ยังไม่กรอกประวัติ', pdpaAccepted: true, profile: null },
  profile: { label: 'ยินยอมแล้ว + มีประวัติแล้ว', pdpaAccepted: true, profile: sampleProfile },
}

// ผู้ป่วยที่กำลังเปิดหน้าอยู่ (อ่านจาก sessionStorage ถ้ามี)
let mockPatient = JSON.parse(sessionStorage.getItem('mockPatient') || 'null')
function saveMockPatient() {
  sessionStorage.setItem('mockPatient', JSON.stringify(mockPatient))
}

// สร้างผู้ป่วยใหม่ตามสถานการณ์ที่เลือก
function resetMockPatient(scenarioKey) {
  const scenario = MOCK_PATIENT_SCENARIOS[scenarioKey]
  mockPatient = {
    scenario: scenarioKey,
    lineUserId: 'Umock000000000000000000000000001', // หน้าตาเหมือน userId ของ LINE
    displayName: 'ผู้ใช้ทดสอบ',
    pdpaAcceptedAt: scenario.pdpaAccepted ? '2026-10-01T09:00:00+07:00' : null,
    profile: scenario.profile ? { ...scenario.profile } : null,
  }
  saveMockPatient()
}

// liff.js เรียกตอนเริ่มหน้า LIFF (แทน LINE จริง)
// scenarioKey = ค่าจาก ?user= ใน URL (ไม่มีก็ได้)
// - มี ?user= ที่ถูกต้อง → เริ่มใหม่ตามสถานการณ์นั้น
// - ไม่มี → ใช้คนเดิมที่จำไว้ (ถ้ายังไม่มีเลย เริ่มเป็น "คนใหม่")
export function startMockPatient(scenarioKey) {
  if (MOCK_PATIENT_SCENARIOS[scenarioKey]) {
    resetMockPatient(scenarioKey)
  } else if (!mockPatient) {
    resetMockPatient('new')
  }
  return {
    lineUserId: mockPatient.lineUserId,
    displayName: mockPatient.displayName,
    pictureUrl: null,
  }
}

// สถานการณ์ที่ใช้อยู่ตอนนี้ (หน้าเมนูทดสอบใช้แสดง)
export function getMockPatientScenario() {
  return mockPatient?.scenario || null
}

// คำนวณอายุ (ปีเต็ม) จากวันเกิด 'YYYY-MM-DD' — server จริงคำนวณเอง
function calculateAge(birthDate) {
  const [year, month, day] = birthDate.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - year
  // ปีนี้ยังไม่ถึงวันเกิด → ลบออก 1
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)
  if (beforeBirthday) age -= 1
  return age
}

// ประวัติในรูปแบบที่ API ตอบ (เพิ่ม age)
function profileWithAge(profile) {
  if (!profile) return null
  return { ...profile, age: calculateAge(profile.birthDate) }
}

// API ที่ต้องยินยอม PDPA ก่อน — ยังไม่ยินยอม → 403 เหมือน server จริง
function requirePatientPdpa() {
  if (!mockPatient?.pdpaAcceptedAt) {
    throw mockError(403, 'PDPA_REQUIRED', 'กรุณายินยอมการใช้ข้อมูลส่วนบุคคลก่อนใช้งาน')
  }
}

// ตรวจข้อมูลประวัติ (U3) — ข้อยกเว้น: mock เช็กแทน server เพื่อให้เห็นข้อความแดงใต้ช่อง
// คืนค่า { ชื่อช่อง: 'ข้อความผิด' } ถ้าไม่มีช่องผิดจะได้ {}
function validateProfile(body) {
  const fields = {}
  if (!body?.firstName?.trim()) fields.firstName = 'กรุณากรอกชื่อ'
  if (!body?.lastName?.trim()) fields.lastName = 'กรุณากรอกนามสกุล'
  if (!['male', 'female', 'unspecified'].includes(body?.gender)) fields.gender = 'กรุณาเลือกเพศ'

  if (!body?.birthDate) {
    fields.birthDate = 'กรุณาเลือกวันเกิด'
  } else if (body.birthDate > toDateString(new Date())) {
    // เทียบข้อความ 'YYYY-MM-DD' ได้เลย
    fields.birthDate = 'วันเกิดต้องไม่เป็นวันในอนาคต'
  }

  if (!body?.phone) {
    fields.phone = 'กรุณากรอกเบอร์โทรศัพท์'
  } else if (!/^0\d{9}$/.test(body.phone)) {
    // ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0
    fields.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก'
  }
  return fields
}

handlers.push(
  // U1 — ข้อมูลของฉัน (ไม่เช็ก PDPA)
  {
    method: 'GET',
    path: '/api/me',
    handle() {
      return {
        lineDisplayName: mockPatient.displayName,
        pdpaAccepted: Boolean(mockPatient.pdpaAcceptedAt),
        profileCompleted: Boolean(mockPatient.profile),
        profile: profileWithAge(mockPatient.profile),
      }
    },
  },

  // U2 — กดยินยอม PDPA (ไม่เช็ก PDPA — ไม่งั้นคนใหม่กดไม่ได้)
  {
    method: 'POST',
    path: '/api/me/pdpa',
    handle() {
      if (!mockPatient.pdpaAcceptedAt) {
        // เวลาตอนนี้ในรูปแบบ ISO เวลาไทย เช่น '2026-10-01T09:00:00+07:00' (ตาม contract)
        const bangkokMs = Date.now() + 7 * 60 * 60 * 1000
        mockPatient.pdpaAcceptedAt = new Date(bangkokMs).toISOString().slice(0, 19) + '+07:00'
        saveMockPatient()
      }
      return { pdpaAcceptedAt: mockPatient.pdpaAcceptedAt }
    },
  },

  // U3 — บันทึกประวัติ (ใช้ทั้งกรอกครั้งแรกและแก้ไข)
  {
    method: 'PUT',
    path: '/api/me/profile',
    handle({ body }) {
      requirePatientPdpa()
      const fields = validateProfile(body)
      if (Object.keys(fields).length > 0) {
        throw mockError(400, 'VALIDATION_ERROR', 'กรุณากรอกข้อมูลให้ครบถ้วน', { fields })
      }
      mockPatient.profile = {
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        gender: body.gender,
        birthDate: body.birthDate,
        phone: body.phone,
      }
      saveMockPatient()
      return { profile: profileWithAge(mockPatient.profile) }
    },
  },
)


// ======================================================================
// ===== หน้าจองคิว (U4–U9) — ขั้น 7.4 (กฎเวลาชุดที่ 2: 10 / 15 นาที) =====
// ======================================================================
// ใช้ตารางเวลาชุดเดียวกับหน้า "จัดการเวลา" ของ staff (slotsByDate) → สองฝั่งเห็นตรงกัน
//   staff เห็น "มีผู้จองแล้ว / กำลังถูกจอง / ปิดรับการจอง" → ผู้ป่วยเห็น "ไม่ว่าง"
// ผู้ป่วยจองแล้ว → staff เห็นนัดนี้ในหน้ารายการนัด (ถ้าเปิดในแท็บเดียวกัน)
//
// นาฬิกาจำลอง (แยกตามผู้ใช้ทดสอบ — ผู้ใช้เลือก 2026-10-03) แล้วเดินไปตามเวลาจริง (รีเฟรชหน้า = เริ่มใหม่)
//   - ผู้ใช้ทั่วไป: "ตอนนี้" = คืนก่อนวันเปิดทำการถัดไป 20:00 → หน้าจองปกติ (ไม่มีหมดเวลาจอง ไม่มีกล่องส้ม)
//   - ผู้ใช้ "จองกระชั้น" (?user=rush): "ตอนนี้" = วันเปิดทำการถัดไป 07:12 → เห็นกฎเวลาชุดที่ 2 ครบ:
//       07:00, 07:15 = "หมดเวลาจอง" (เหลือ < 11 นาที)
//       กดจอง 07:30 → กล่องแดง "ยกเลิกหรือเลื่อนไม่ได้แล้ว" (เส้นตาย 07:15 มาก่อนหมดเวลายืนยัน)
//       กดจอง 08:45 → บรรทัด "ยกเลิกหรือเลื่อนได้ก่อน 08:30 น." ปกติ
//       ทุกคิวของวันนั้นเหลือไม่ถึง 3 ชม. → กล่องส้ม + "นัดนี้จะไม่มีข้อความเตือนก่อนนัด"
// server จริงใช้ now() จาก server/lib/clock.js (เวลาจริง หรือ DEMO_NOW)

// เวลาถือคิว (วินาที) — ของจริงคือ HOLD_SECONDS=300 ของ server
// อยากทดสอบป๊อปอัป "หมดเวลายืนยันการจอง" เร็ว ๆ → แก้เป็น 20 ชั่วคราว (อย่าลืมแก้กลับเป็น 300)
const MOCK_HOLD_SECONDS = 300

// ตัวเลขกฎเวลา (ตรงกับ .env ของ server — ดู claude/time-rules-v2.md)
const BOOKING_CUTOFF_MINUTES = 10 // ต้องยืนยันก่อนนัดอย่างน้อย 10 นาที
const CHANGE_CUTOFF_MINUTES = 15 // ยกเลิก/เลื่อนได้ก่อนนัด 15 นาที
const SHORT_NOTICE_HOURS = 3 // จองห่างนัดไม่ถึง 3 ชม. = นัดกระชั้น (ไม่มีข้อความเตือน)
const HOLD_MIN_SECONDS = 60 // เหลือเวลายืนยันไม่ถึง 1 นาที → ไม่ให้ถือคิว

const MINUTE_MS = 60 * 1000

// รหัสนัดของผู้ป่วยจำลอง (ตั้งเลขสูงไว้ ไม่ให้ซ้ำกับนัดปลอมของ staff)
const MOCK_PATIENT_APPOINTMENT_ID = 9001

// ----- นาฬิกาจำลอง -----
// เวลาจริงตอนเปิดหน้า กับ เวลาจำลองตอนเปิดหน้า (เวลาไทย)
const MOCK_CLOCK_REAL_START = Date.now()
const MOCK_CLOCK_RUSH_START = Date.parse(`${nextOpenDay()}T07:12:00+07:00`) // เช้าวันนัด 07:12
const MOCK_CLOCK_NORMAL_START = MOCK_CLOCK_RUSH_START - (11 * 60 + 12) * 60 * 1000 // คืนก่อนวันนัด 20:00

// "ตอนนี้" ในโลกจำลอง (มิลลิวินาที) — api.js ส่งต่อให้หน้าเว็บใช้นับถอยหลัง
export function mockNowMs() {
  const fakeStart = mockPatient?.scenario === 'rush' ? MOCK_CLOCK_RUSH_START : MOCK_CLOCK_NORMAL_START
  return fakeStart + (Date.now() - MOCK_CLOCK_REAL_START)
}

// เวลา (มิลลิวินาที) → ข้อความ ISO เวลาไทย เช่น '2026-10-03T07:15:00+07:00'
function toBangkokIso(ms) {
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 19) + '+07:00'
}

// วันที่ 'YYYY-MM-DD' (เวลาไทย) ของเวลาจำลองตอนนี้
function mockTodayString() {
  return toBangkokIso(mockNowMs()).slice(0, 10)
}

// เวลาเริ่มของคิว (มิลลิวินาที) จากวันที่ + เวลา เช่น ('2026-10-03', '07:30')
function slotStartMs(date, startTime) {
  return Date.parse(`${date}T${startTime}:00+07:00`)
}

// สถานการณ์เพิ่ม: มีนัดอยู่แล้ว (ใช้ ?user=booked)
// นัดตัวอย่าง = วันเปิดลำดับที่ 3 ในรายการวันที่จองได้ เวลา 08:15 (แบบ Figma "ส. 10 ต.ค. 08:15")
MOCK_PATIENT_SCENARIOS.booked = {
  label: 'มีนัดอยู่แล้ว (มีประวัติแล้ว)',
  pdpaAccepted: true,
  profile: sampleProfile,
}
// สถานการณ์เพิ่ม: จองกระชั้น (ใช้ ?user=rush) — มีประวัติแล้ว ไม่มีนัด แต่นาฬิกาเป็นเช้าวันนัด 07:12
MOCK_PATIENT_SCENARIOS.rush = {
  label: 'จองกระชั้น (เช้าวันนัด 07:12)',
  pdpaAccepted: true,
  profile: sampleProfile,
}

// คิวที่ผู้ป่วยจำลองถืออยู่ { slotId, date, startTime, expiresAtMs } — null = ไม่ได้ถือ
// expiresAtMs เป็นเวลาในโลกจำลอง · เก็บในหน่วยความจำ (รีเฟรชแล้วหาย เหมือนคิวถูกปล่อย)
let mockHold = null

// วันเปิด (เสาร์–อาทิตย์) ตั้งแต่วันนี้ (จำลอง) ถึงวันนี้ + 14 วัน
function bookingDates() {
  const dates = []
  const [year, month, day] = mockTodayString().split('-').map(Number)
  const cursor = new Date(year, month - 1, day)
  for (let i = 0; i <= 14; i++) {
    const dateString = toDateString(cursor)
    // isBeyondBookingRange = วันที่ฝั่ง staff ยังไม่มีเวลา (นับ 14 วันจากเวลาเครื่อง) → ไม่ให้เลือก ให้สองฝั่งตรงกัน
    if (isOpenDay(dateString) && !isBeyondBookingRange(dateString)) dates.push(dateString)
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

// หาเวลาจาก id พร้อมบอกว่าอยู่วันไหน → { slot, date }
function findSlotWithDate(slotId) {
  for (const [date, list] of Object.entries(slotsByDate)) {
    const slot = list.find((item) => item.slotId === Number(slotId))
    if (slot) return { slot, date }
  }
  throw mockError(404, 'NOT_FOUND', 'ไม่พบเวลานี้')
}

// ถ้าคิวที่ถือไว้หมดเวลาแล้ว → ปล่อยคิว (server จริงให้ cron เคลียร์ทุกนาที)
function clearExpiredHold() {
  if (mockHold && mockNowMs() >= mockHold.expiresAtMs) {
    releaseMockHold()
  }
}

// ปล่อยคิวที่ถืออยู่ → เวลานั้นกลับเป็น "ว่าง"
function releaseMockHold() {
  if (!mockHold) return
  const { slot } = findSlotWithDate(mockHold.slotId)
  if (slot.status === 'held') slot.status = 'available'
  mockHold = null
}

// เหลือเวลาก่อนนัดกี่นาที (ตามนาฬิกาจำลอง)
function minutesUntil(date, startTime) {
  return (slotStartMs(date, startTime) - mockNowMs()) / MINUTE_MS
}

// นัดกระชั้น = เหลือไม่ถึง 3 ชม. (นับจากตอนนี้)
function isShortNotice(date, startTime) {
  return minutesUntil(date, startTime) < SHORT_NOTICE_HOURS * 60
}

// สถานะที่ผู้ป่วยเห็น (U5) จากสถานะฝั่ง staff
function patientSlotStatus(date, slot) {
  if (mockHold && mockHold.slotId === slot.slotId) return 'held_by_me'
  if (minutesUntil(date, slot.startTime) < BOOKING_CUTOFF_MINUTES + 1) return 'too_late' // เหลือ < 11 นาที
  if (slot.status === 'available') return 'available'
  return 'unavailable' // มีคนจอง / กำลังถูกจอง / ปิด — ผู้ป่วยไม่ต้องรู้ว่าแบบไหน
}

// ใส่นัดของผู้ป่วยจำลองลงในข้อมูลของ staff (ตารางนัด + เวลานั้นเป็น "มีผู้จองแล้ว")
function putPatientAppointmentIntoStaffData() {
  const appointment = mockPatient?.appointment
  if (!appointment || appointment.status !== 'booked') return

  const slot = getSlotsOfDate(appointment.date).find((item) => item.startTime === appointment.startTime)
  if (slot) slot.status = 'booked'

  const list = getAppointmentsOfDate(appointment.date)
  if (!list.some((item) => item.appointmentId === appointment.appointmentId)) {
    list.push({
      appointmentId: appointment.appointmentId,
      firstName: mockPatient.profile.firstName,
      lastName: mockPatient.profile.lastName,
      phone: mockPatient.profile.phone,
      date: appointment.date,
      startTime: appointment.startTime,
      status: 'booked',
      canMarkNoShow: false,
      canUndoNoShow: false,
      undoNoShowUntil: null,
    })
    list.sort((a, b) => a.startTime.localeCompare(b.startTime)) // เรียงตามเวลา
  }
}

// นัดของผู้ป่วยจำลอง — สถานการณ์ "มีนัดอยู่แล้ว" ที่ยังไม่มีนัด → สร้างนัดตัวอย่างให้ครั้งแรก
// (appointment = undefined แปลว่ายังไม่เคยสร้าง, null แปลว่าไม่มีนัด)
function getPatientAppointment() {
  if (!mockPatient) return null
  if (mockPatient.scenario === 'booked' && mockPatient.appointment === undefined) {
    const date = bookingDates()[2] || bookingDates()[0]
    mockPatient.appointment = {
      appointmentId: MOCK_PATIENT_APPOINTMENT_ID,
      date,
      startTime: '08:15',
      endTime: '08:30',
      status: 'booked',
    }
    saveMockPatient()
  }
  putPatientAppointmentIntoStaffData()
  return mockPatient.appointment || null
}

// เส้นตายยกเลิก/เลื่อนของนัด (มิลลิวินาที) = เวลานัด − 15 นาที
function changeDeadlineMs(date, startTime) {
  return slotStartMs(date, startTime) - CHANGE_CUTOFF_MINUTES * MINUTE_MS
}

// นัดในรูปแบบที่ API ตอบ (แบบ U8) — เพิ่ม canChange + changeDeadline (15 นาทีก่อนนัด)
function appointmentForApi(appointment) {
  if (!appointment || appointment.status !== 'booked') return null
  const deadlineMs = changeDeadlineMs(appointment.date, appointment.startTime)
  return {
    ...appointment,
    canChange: mockNowMs() < deadlineMs,
    changeDeadline: toBangkokIso(deadlineMs),
  }
}

// API จอง/ถือคิว ต้องกรอกประวัติก่อน — ยังไม่กรอก → 403 เหมือน server จริง
function requirePatientProfile() {
  if (!mockPatient?.profile) {
    throw mockError(403, 'PROFILE_REQUIRED', 'กรุณากรอกประวัติส่วนตัวก่อนจองคิว')
  }
}

// ผู้ป่วยมีนัดที่ยังใช้งานอยู่ → 409 พร้อมแนบนัด (หน้าเว็บใช้แสดงป๊อปอัป "คุณมีนัดอยู่แล้ว")
function throwIfHasActiveAppointment() {
  const appointment = appointmentForApi(getPatientAppointment())
  if (appointment) {
    throw mockError(409, 'HAS_ACTIVE_APPOINTMENT', 'คุณมีนัดอยู่แล้ว', { appointment })
  }
}

handlers.push(
  // U4 — วันที่เลือกจองได้
  {
    method: 'GET',
    path: '/api/booking-days',
    handle() {
      requirePatientPdpa()
      clearExpiredHold()
      getPatientAppointment()
      const days = bookingDates().map((date) => ({
        date,
        availableCount: getSlotsOfDate(date).filter((slot) => patientSlotStatus(date, slot) === 'available').length,
      }))
      return { days }
    },
  },

  // U5 — ตารางเวลาของวัน
  {
    method: 'GET',
    path: '/api/slots',
    handle({ query }) {
      requirePatientPdpa()
      clearExpiredHold()
      getPatientAppointment()
      const date = query.date
      if (!date || !bookingDates().includes(date)) {
        throw mockError(400, 'INVALID_DATE', 'วันที่นี้ไม่เปิดให้จอง')
      }
      const slots = getSlotsOfDate(date).map((slot) => ({
        slotId: slot.slotId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: patientSlotStatus(date, slot),
        shortNotice: isShortNotice(date, slot.startTime),
      }))
      return { date, slots }
    },
  },

  // U6 — ถือคิวไว้ (กดปุ่ม [จองคิว])
  {
    method: 'POST',
    path: '/api/holds',
    handle({ body }) {
      requirePatientPdpa()
      requirePatientProfile()
      clearExpiredHold()
      const purpose = body?.purpose || 'book'
      const currentAppointment = appointmentForApi(getPatientAppointment())
      if (purpose === 'book') {
        throwIfHasActiveAppointment()
      } else if (!currentAppointment) {
        throw mockError(409, 'NO_APPOINTMENT_TO_RESCHEDULE', 'ไม่มีนัดที่จะเลื่อน')
      }

      const { slot, date } = findSlotWithDate(body?.slotId)
      const status = patientSlotStatus(date, slot)
      if (status === 'too_late') {
        throw mockError(400, 'TOO_LATE_TO_BOOK', 'ต้องจองก่อนเวลานัดอย่างน้อย 10 นาที')
      }
      if (status === 'unavailable') {
        throw mockError(409, 'SLOT_TAKEN', 'คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น')
      }

      // เวลาหมดอายุ = ค่าที่มาก่อนระหว่าง (ตอนนี้ + 5 นาที) กับ (เวลานัด − 10 นาที)
      // เลื่อนนัด → เทียบกับ (เวลานัดเดิม − 15 นาที) ด้วย
      const now = mockNowMs()
      const bookingDeadline = slotStartMs(date, slot.startTime) - BOOKING_CUTOFF_MINUTES * MINUTE_MS
      let expiresAtMs = Math.min(now + MOCK_HOLD_SECONDS * 1000, bookingDeadline)
      let limitedByOldAppointment = false
      if (purpose === 'reschedule') {
        const oldDeadline = changeDeadlineMs(currentAppointment.date, currentAppointment.startTime)
        if (oldDeadline < expiresAtMs) {
          expiresAtMs = oldDeadline
          limitedByOldAppointment = true
        }
      }
      // เหลือเวลายืนยันไม่ถึง 1 นาที → ไม่ให้ถือ
      if (expiresAtMs - now < HOLD_MIN_SECONDS * 1000) {
        if (limitedByOldAppointment) {
          const deadlineText = toBangkokIso(expiresAtMs).slice(11, 16)
          throw mockError(409, 'TOO_LATE_TO_CHANGE', `ยกเลิกหรือเลื่อนนัดได้ก่อน ${deadlineText} น. เท่านั้น หากมาไม่ได้ กรุณาโทรแจ้งคลินิก`)
        }
        throw mockError(400, 'TOO_LATE_TO_BOOK', 'ต้องจองก่อนเวลานัดอย่างน้อย 10 นาที')
      }

      // ถือได้ครั้งละ 1 คิว → ปล่อยคิวเดิมก่อน แล้วถือคิวใหม่
      releaseMockHold()
      slot.status = 'held'
      mockHold = { slotId: slot.slotId, date, startTime: slot.startTime, expiresAtMs }
      return {
        hold: {
          slotId: slot.slotId,
          date,
          startTime: slot.startTime,
          holdExpiresAt: toBangkokIso(expiresAtMs),
          changeDeadline: toBangkokIso(changeDeadlineMs(date, slot.startTime)),
          shortNotice: isShortNotice(date, slot.startTime),
        },
      }
    },
  },

  // U7 — ปล่อยคิวที่ถืออยู่ (ไม่มีคิวก็ตอบ ok)
  {
    method: 'DELETE',
    path: '/api/holds/current',
    handle() {
      requirePatientPdpa()
      releaseMockHold()
      return { ok: true }
    },
  },

  // U8 — นัดที่ยังใช้งานอยู่ของฉัน
  {
    method: 'GET',
    path: '/api/me/appointment',
    handle() {
      requirePatientPdpa()
      return {
        appointment: appointmentForApi(getPatientAppointment()),
        clinicPhone: import.meta.env.VITE_CLINIC_PHONE || '',
      }
    },
  },

  // U9 — ยืนยันการจอง (ไม่ตรวจกฎเวลาซ้ำ ตรวจแค่ว่าคิวที่ถือยังไม่หมดเวลา)
  {
    method: 'POST',
    path: '/api/appointments',
    handle({ body }) {
      requirePatientPdpa()
      requirePatientProfile()
      clearExpiredHold()
      if (!mockHold || mockHold.slotId !== Number(body?.slotId)) {
        throw mockError(410, 'HOLD_EXPIRED', 'หมดเวลายืนยันการจอง คิวถูกปล่อยให้ผู้อื่นจองได้แล้ว')
      }
      throwIfHasActiveAppointment()

      const { slot, date } = findSlotWithDate(mockHold.slotId)
      slot.status = 'booked'
      mockHold = null
      mockPatient.appointment = {
        appointmentId: MOCK_PATIENT_APPOINTMENT_ID,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: 'booked',
      }
      saveMockPatient()
      putPatientAppointmentIntoStaffData()
      return { appointment: appointmentForApi(mockPatient.appointment) }
    },
  },
)

// เปิดหน้าใหม่ (รีเฟรช) แล้วผู้ป่วยจำลองมีนัดอยู่ → ใส่นัดกลับเข้าข้อมูลของ staff
putPatientAppointmentIntoStaffData()

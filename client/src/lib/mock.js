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
    else if (isOpenDay(date)) pattern = patternSix
    // วันธรรมดา → pattern ว่าง = ไม่มีนัด

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
]

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
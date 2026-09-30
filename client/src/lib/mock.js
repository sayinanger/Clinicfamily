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
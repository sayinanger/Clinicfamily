import { mockRequest } from './mock.js'

// ทุกหน้าเว็บต้องขอข้อมูลผ่านไฟล์นี้เท่านั้น (ห้ามเรียก fetch เองในหน้า)
// รายละเอียดของแต่ละ API ดูที่ docs/api-contract.md

// true = ใช้ข้อมูลปลอมจาก mock.js, false = เรียก server จริง
// ตั้งค่าในไฟล์ client/.env → VITE_USE_MOCK=true (แก้แล้วต้องรัน npm run dev ใหม่)
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// LINE ID token ของผู้ป่วย — หน้า LIFF จะตั้งค่าให้หลังเริ่ม LIFF (ขั้น 7)
// server ใช้ token นี้ตรวจว่าเป็นผู้ใช้ LINE คนไหนจริง ๆ
let lineIdToken = null
export function setLineIdToken(token) {
  lineIdToken = token
}

// ฟังก์ชันกลางสำหรับเรียก API
// ตัวอย่าง: await apiRequest('/api/admin/login', { method: 'POST', body: { username, password } })
// ถ้าผิดพลาดจะ throw error ที่มี .message (ข้อความไทย), .code (รหัส เช่น SLOT_TAKEN), .status (HTTP)
export async function apiRequest(path, { method = 'GET', body } = {}) {
  // โหมดข้อมูลปลอม: ไม่ต่อ server เลย
  if (USE_MOCK) {
    return mockRequest(method, path, body)
  }

  // โหมดจริง: ส่งคำขอไปที่ server
  const headers = { 'Content-Type': 'application/json' }
  if (lineIdToken) {
    headers.Authorization = `Bearer ${lineIdToken}`
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include', // ส่ง session cookie ไปด้วย (ใช้กับ staff)
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || `เกิดข้อผิดพลาด (${response.status})`)
    error.code = data?.code || 'SERVER_ERROR'
    error.status = response.status
    error.data = data // ข้อมูลเพิ่มเติม เช่น fields, appointment
    throw error
  }
  return data
}

// ===== ฟังก์ชันของแต่ละ API =====
// จะเพิ่มทีละหน้า (ขั้น 3 เป็นต้นไป) ชื่อตรงกับตารางใน docs/api-contract.md

// S1 — staff เข้าสู่ระบบ
export function adminLogin(username, password) {
  return apiRequest('/api/admin/login', { method: 'POST', body: { username, password } })
}

// S2 — staff ออกจากระบบ
export function adminLogout() {
  return apiRequest('/api/admin/logout', { method: 'POST' })
}

// S3 — ดูว่า staff login อยู่ไหม (ถ้ายังไม่ login จะ throw error ที่ .status = 401)
export function getAdminMe() {
  return apiRequest('/api/admin/me')
}

// S4 — รายการนัดของวันที่เลือก
// date = 'YYYY-MM-DD' หรือไม่ส่ง (server เลือกวันเปิดทำการถัดไปให้)
export function getAdminAppointments(date) {
  const query = date ? `?date=${date}` : ''
  return apiRequest(`/api/admin/appointments${query}`)
}

// S5 — กดปุ่ม [ไม่มา]
export function markNoShow(appointmentId) {
  return apiRequest(`/api/admin/appointments/${appointmentId}/no-show`, { method: 'POST' })
}

// S6 — กดปุ่ม [แก้คืน] (ยกเลิกการกด "ไม่มา" ภายใน 5 นาที)
export function undoNoShow(appointmentId) {
  return apiRequest(`/api/admin/appointments/${appointmentId}/no-show`, { method: 'DELETE' })
}

// S7 — เวลาทั้งหมดของวันที่เลือก (12 คิว) สำหรับหน้าจัดการเวลา
// date = 'YYYY-MM-DD' หรือไม่ส่ง (server เลือกวันเปิดทำการถัดไปให้)
export function getAdminSlots(date) {
  const query = date ? `?date=${date}` : ''
  return apiRequest(`/api/admin/slots${query}`)
}

// S8 — กดปุ่ม [ปิด] (ปิดรับการจองเวลานี้ — ปิดได้เฉพาะเวลาที่ยังว่าง)
export function closeSlot(slotId) {
  return apiRequest(`/api/admin/slots/${slotId}/close`, { method: 'POST' })
}

// S9 — กดปุ่ม [เปิด] (เปิดรับการจองเวลาที่ถูกปิดไว้)
export function openSlot(slotId) {
  return apiRequest(`/api/admin/slots/${slotId}/open`, { method: 'POST' })
}
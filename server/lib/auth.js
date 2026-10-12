// การ login ของ staff — ใช้ cookie-session (ตั้งค่าใน index.js)
// เทียบง่าย ๆ: login ถูก → server รัดสายรัดข้อมือ (cookie) ที่ประทับตราด้วย SESSION_SECRET
// ทุกคำขอครั้งต่อไป เบราว์เซอร์ส่งสายนี้มาด้วย → server ตรวจตรา ถ้าปลอม/แก้เอง ตราไม่ตรง = ไม่รับ

// login อยู่ได้ 8 ชั่วโมงนับจากตอน login (ไม่ต่ออายุตอนใช้งาน)
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000

// ด่านตรวจ: ใส่หน้า API ที่ต้อง login (S3–S11)
// ผ่าน → req.staffId = staff ที่ login อยู่ · ไม่ผ่าน → 401 UNAUTHORIZED (หน้าเว็บพาไป /admin/login เอง)
// (อายุ login ใช้เวลาจริง Date.now() ไม่ใช่ clock.js เพราะไม่ใช่กฎของคลินิก — ตั้ง DEMO_NOW แล้วไม่หลุด)
export function requireStaff(req, res, next) {
  const session = req.session
  const expired = !session?.loggedInAt || Date.now() - session.loggedInAt > SESSION_MAX_AGE_MS
  if (!session?.staffId || expired) {
    if (session && !session.isNew) req.session = null // มี cookie เก่าที่หมดอายุ/ไม่สมบูรณ์ → ล้างทิ้ง
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' })
  }
  req.staffId = session.staffId
  next()
}

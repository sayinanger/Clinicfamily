// การยืนยันตัวตนของผู้ป่วย (หน้า LIFF) ด้วย LINE ID token — ใช้กับทุก API ฝั่งผู้ป่วย (U1–U11)
//
// เทียบง่าย ๆ: ผู้ป่วยไม่มีรหัสผ่าน แต่มี "บัตรผ่าน" จาก LINE (ID token)
//   หน้าเว็บขอบัตรจาก liff.getIDToken() แล้วแนบมากับทุกคำขอ: header  Authorization: Bearer <บัตร>
//   server ส่งบัตรไปถาม LINE ว่าของจริงไหม → LINE ตอบรหัสประจำตัวคนนั้น (sub เช่น U4af49...) = users.line_user_id
//   (หน้าเว็บส่ง lineUserId มาเองไม่ได้ เพราะใครก็พิมพ์ปลอมได้)
//
// L1ข: ถาม LINE ครั้งแรกแล้ว "จำผลไว้" ในหน่วยความจำจนบัตรหมดอายุ → คำขอต่อ ๆ ไปไม่ต้องถาม LINE ซ้ำ
//   (รีสตาร์ท server = ลืมหมด แล้วถามใหม่ — ไม่เป็นไร)
// L2ข: บัตรทดสอบ "test:<line_user_id>" เช่น  Authorization: Bearer test:seed-01  (= สมหญิง ใน seed)
//   ใช้ได้เฉพาะตอนตั้ง ALLOW_TEST_TOKEN=true ใน server/.env — วันเดโมต้องตั้งเป็น false
//   (ตอนเดโม server ออกเน็ตผ่าน ngrok ใครรู้ URL ก็ยิงได้ ถ้าเปิดไว้จะสวมรอยเป็นผู้ป่วยคนไหนก็ได้)

// ค่าจาก .env เป็นข้อความเสมอ → เทียบกับ 'true'
export const ALLOW_TEST_TOKEN = process.env.ALLOW_TEST_TOKEN === 'true'

// Channel ID ของ LINE Login channel (Clinicfamily Login) — ไม่ใช่ความลับ
// LINE ใช้ตรวจว่าบัตรนี้ออกให้แอปของเรา ไม่ใช่แอปอื่น
const LINE_CHANNEL_ID = (process.env.LINE_LOGIN_CHANNEL_ID || '').trim()

// ที่อยู่ของ LINE สำหรับตรวจ ID token (เอกสาร LINE Login: "Verify ID token")
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

// บัตรทดสอบ: test: ตามด้วยตัวอักษร/ตัวเลข/ขีด ยาวไม่เกิน 100 (ความยาวคอลัมน์ line_user_id)
const TEST_TOKEN_PATTERN = /^test:([A-Za-z0-9_-]{1,100})$/

// สมุดจำบัตรที่ตรวจแล้ว: บัตร → { lineUserId, expiresAtMs }
const verifiedTokens = new Map()

// ตอบ 401 เมื่อยืนยันตัวตนไม่ผ่าน (ไม่มีบัตร / บัตรปลอม / หมดอายุ)
function sendUnauthorized(res) {
  return res.status(401).json({
    code: 'UNAUTHORIZED',
    message: 'การยืนยันตัวตนหมดอายุ กรุณาปิดแล้วเปิดหน้านี้ใหม่',
  })
}

// ด่านตรวจ: ใส่หน้า API ฝั่งผู้ป่วยทุกตัว
// ผ่าน → req.lineUserId = รหัส LINE ของผู้ป่วย · ไม่ผ่าน → 401 UNAUTHORIZED
// (อายุบัตรเทียบกับเวลาจริง Date.now() ไม่ใช่ clock.js เพราะ LINE ออกบัตรตามเวลาจริง — ตั้ง DEMO_NOW แล้วบัตรไม่หลุด)
export async function requirePatient(req, res, next) {
  const header = req.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) return sendUnauthorized(res)

  // ---------- บัตรทดสอบ ----------
  if (token.startsWith('test:')) {
    const match = token.match(TEST_TOKEN_PATTERN)
    if (!ALLOW_TEST_TOKEN || !match) return sendUnauthorized(res)
    req.lineUserId = match[1]
    return next()
  }

  // ---------- บัตรจริงจาก LINE ----------
  // เคยตรวจแล้วและยังไม่หมดอายุ → ใช้ผลเดิม
  const remembered = verifiedTokens.get(token)
  if (remembered && Date.now() < remembered.expiresAtMs) {
    req.lineUserId = remembered.lineUserId
    return next()
  }

  // ยังไม่ได้ตั้ง Channel ID → ตรวจกับ LINE ไม่ได้ (ตอบ 500 + บอกวิธีแก้ใน Terminal)
  if (!LINE_CHANNEL_ID) {
    throw new Error('ยังไม่ได้ตั้ง LINE_LOGIN_CHANNEL_ID ใน server/.env → ใส่ Channel ID ของ LINE Login channel (Clinicfamily Login)')
  }

  // ถาม LINE (รอไม่เกิน 5 วินาที) — ต่อ LINE ไม่ได้ = fetch โยน error → index.js ตอบ 500
  const response = await fetch(LINE_VERIFY_URL, {
    method: 'POST',
    body: new URLSearchParams({ id_token: token, client_id: LINE_CHANNEL_ID }),
    signal: AbortSignal.timeout(5000),
  })

  // LINE ตอบ 400 = บัตรปลอม / หมดอายุ / ไม่ใช่ของแอปเรา
  if (response.status === 400) return sendUnauthorized(res)
  if (!response.ok) {
    throw new Error(`ตรวจ ID token กับ LINE ไม่สำเร็จ (LINE ตอบ ${response.status})`)
  }

  const payload = await response.json()
  // sub = รหัสประจำตัวผู้ใช้ LINE · exp = เวลาหมดอายุของบัตร (วินาที นับจาก 1970)
  if (!payload.sub || !payload.exp) return sendUnauthorized(res)

  forgetExpiredTokens()
  verifiedTokens.set(token, { lineUserId: payload.sub, expiresAtMs: payload.exp * 1000 })
  req.lineUserId = payload.sub
  next()
}

// ล้างบัตรที่หมดอายุออกจากสมุดจำ (กันสมุดโตไปเรื่อย ๆ ถ้าเปิด server ทิ้งไว้นาน)
function forgetExpiredTokens() {
  const nowMs = Date.now()
  for (const [token, entry] of verifiedTokens) {
    if (entry.expiresAtMs <= nowMs) verifiedTokens.delete(token)
  }
}

// ข้อความเตือนตอนเปิด server (index.js เรียก)
export function warnLineAuthSettings() {
  if (ALLOW_TEST_TOKEN) {
    console.warn('⚠️  ALLOW_TEST_TOKEN=true → รับบัตรทดสอบ "test:..." อยู่ (ใช้ตอนพัฒนาเท่านั้น — วันเดโมต้องตั้งเป็น false)')
  }
  if (!LINE_CHANNEL_ID) {
    console.warn('⚠️  ยังไม่ได้ตั้ง LINE_LOGIN_CHANNEL_ID → ผู้ป่วยที่ใช้ LINE จริงจะเข้าใช้งานไม่ได้')
  }
}

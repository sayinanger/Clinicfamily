import liff from '@line/liff'
import { USE_MOCK_LIFF, setLineIdToken } from './api.js'
import { startMockPatient } from './mock.js'

// เริ่ม LINE จริงสำเร็จแล้วหรือยัง (โหมดบัตรทดสอบ = ไม่ได้เริ่ม → เรียก liff.isInClient() ไม่ได้)
let liffReady = false

// เริ่มต้น LIFF และคืนค่าข้อมูลโปรไฟล์ LINE { lineUserId, displayName, pictureUrl }
// เรียกใช้เฉพาะหน้า /liff/... เท่านั้น (LiffLayout เรียกให้)
export async function initLiff() {
  // โหมดข้อมูลปลอม: ไม่ต่อ LINE เลย ใช้ผู้ป่วยจำลองแทน
  // เลือกสถานการณ์ได้ด้วย ?user=... ท้าย URL (ดูรายการใน mock.js → MOCK_PATIENT_SCENARIOS)
  if (USE_MOCK_LIFF) {
    const scenarioKey = new URLSearchParams(window.location.search).get('user')
    return startMockPatient(scenarioKey)
  }

  const liffId = import.meta.env.VITE_LIFF_ID

  // โหมดทดสอบบนคอม (ขั้น N: L3ก) — ยังไม่มี LIFF ID → ไม่ต่อ LINE แต่ใช้ "บัตรทดสอบ" เรียก server จริง
  // ตั้งใน client/.env: VITE_USE_MOCK_LIFF=false, VITE_LIFF_ID= (ว่าง), VITE_TEST_LINE_TOKEN=test:new-01
  // server ต้องตั้ง ALLOW_TEST_TOKEN=true ด้วย ไม่งั้นได้ "การยืนยันตัวตนหมดอายุ..." (401)
  // มี VITE_LIFF_ID แล้ว → ข้ามส่วนนี้ ใช้ LINE จริงเสมอ (บัตรทดสอบไม่ถูกใช้)
  if (!liffId) {
    const testToken = (import.meta.env.VITE_TEST_LINE_TOKEN || '').trim()
    if (!testToken) {
      throw new Error('ยังไม่ได้ตั้งค่า VITE_LIFF_ID (หรือ VITE_TEST_LINE_TOKEN สำหรับทดสอบ) ในไฟล์ .env')
    }
    setLineIdToken(testToken)
    return {
      lineUserId: testToken.replace(/^test:/, ''), // เช่น 'test:new-01' → 'new-01'
      displayName: 'ผู้ทดสอบ (บัตรทดสอบ)',
      pictureUrl: null,
    }
  }

  await liff.init({ liffId })
  liffReady = true

  // ถ้าเปิดจากเบราว์เซอร์ปกติและยังไม่ login ให้พาไป login LINE ก่อน
  if (!liff.isLoggedIn()) {
    liff.login()
    return null
  }

  // ขอ ID token แล้วฝากไว้ใน api.js → ทุกครั้งที่เรียก API จะแนบไปให้ server ตรวจกับ LINE
  // (ต้องเปิด scope "openid" ในหน้าตั้งค่า LIFF ไม่งั้นจะได้ null)
  setLineIdToken(liff.getIDToken())

  const profile = await liff.getProfile()
  return {
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  }
}

// ปิดหน้าต่าง LIFF ได้ไหม — true = เปิดอยู่ในแอป LINE (โหมดจริง)
// false = โหมดข้อมูลปลอม / โหมดบัตรทดสอบ หรือเปิดในเบราว์เซอร์ธรรมดา (เช่น Chrome/Safari) ซึ่งหน้าเว็บสั่งปิดแท็บตัวเองไม่ได้
export function canCloseLiff() {
  return !USE_MOCK_LIFF && liffReady && liff.isInClient()
}

// ปิดหน้าต่าง LIFF (ใช้หลังทำรายการเสร็จ)
export function closeLiff() {
  if (liffReady && liff.isInClient()) liff.closeWindow()
}
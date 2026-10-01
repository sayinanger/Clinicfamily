import liff from '@line/liff'
import { USE_MOCK, setLineIdToken } from './api.js'
import { startMockPatient } from './mock.js'

// เริ่มต้น LIFF และคืนค่าข้อมูลโปรไฟล์ LINE { lineUserId, displayName, pictureUrl }
// เรียกใช้เฉพาะหน้า /liff/... เท่านั้น (LiffLayout เรียกให้)
export async function initLiff() {
  // โหมดข้อมูลปลอม: ไม่ต่อ LINE เลย ใช้ผู้ป่วยจำลองแทน
  // เลือกสถานการณ์ได้ด้วย ?user=... ท้าย URL (ดูรายการใน mock.js → MOCK_PATIENT_SCENARIOS)
  if (USE_MOCK) {
    const scenarioKey = new URLSearchParams(window.location.search).get('user')
    return startMockPatient(scenarioKey)
  }

  const liffId = import.meta.env.VITE_LIFF_ID
  if (!liffId) {
    throw new Error('ยังไม่ได้ตั้งค่า VITE_LIFF_ID ในไฟล์ .env')
  }

  await liff.init({ liffId })

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

// ปิดหน้าต่าง LIFF (ใช้หลังทำรายการเสร็จ)
export function closeLiff() {
  if (liff.isInClient()) liff.closeWindow()
}
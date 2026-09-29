import liff from '@line/liff'

// เริ่มต้น LIFF และคืนค่าข้อมูลโปรไฟล์ LINE (มี userId)
// เรียกใช้เฉพาะหน้า /liff/... เท่านั้น
export async function initLiff() {
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

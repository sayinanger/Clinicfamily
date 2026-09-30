import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { initLiff } from '../lib/liff.js'

// โครงหน้าของผู้ป่วย: เริ่ม LIFF ให้เสร็จก่อน แล้วค่อยแสดงหน้าข้างใน
// หน้าลูกดึงข้อมูลผู้ใช้ได้ด้วย useOutletContext() -> { lineUser }
export default function LiffLayout() {
  const [lineUser, setLineUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    initLiff()
      .then((user) => setLineUser(user))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">กำลังโหลด...</div>
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center text-red-600">{error}</div>
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white">
      <Outlet context={{ lineUser }} />
    </div>
  )
}

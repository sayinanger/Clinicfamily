import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { initLiff } from '../lib/liff.js'
import { getMe } from '../lib/api.js'

// หน้าที่ไม่ต้องยินยอม PDPA ก่อน: หน้า PDPA เอง และหน้าเมนูทดสอบ (/liff)
const PAGES_WITHOUT_PDPA = ['/liff', '/liff/pdpa']

// โครงหน้าของผู้ป่วย (ทำหน้าที่เหมือน "ยาม" หน้าประตู)
// 1) เริ่ม LIFF ให้เสร็จ (โหมดข้อมูลปลอม = ใช้ผู้ป่วยจำลอง)
// 2) ถามข้อมูลของฉัน (U1) ว่ายินยอม PDPA / กรอกประวัติหรือยัง
// 3) ถ้ายังไม่ยินยอม → พาไปหน้า PDPA ก่อน แล้วค่อยกลับมาหน้าที่ตั้งใจจะเปิด
// หน้าลูกดึงข้อมูลได้ด้วย useOutletContext() → { lineUser, me, setMe }
// useOutletContext() คือวิธีที่หน้าลูกขอข้อมูลจากยาม (me = ข้อมูลของฉัน) ส่วน setMe ใช้บอกยามว่าข้อมูลเปลี่ยนแล้ว เช่น กดยินยอมแล้ว ยามจะได้ไม่พากลับไปหน้า PDPA อีก
export default function LiffLayout() {
  const [lineUser, setLineUser] = useState(null) // ข้อมูลจาก LINE (ชื่อ LINE, userId)
  const [me, setMe] = useState(null) // ข้อมูลจาก U1 (pdpaAccepted, profileCompleted, profile)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const location = useLocation() // ตอนนี้อยู่หน้าไหน (location.pathname เช่น '/liff/profile')

  // ทำครั้งเดียวตอนเปิดหน้า
  useEffect(() => {
    async function start() {
      try {
        const user = await initLiff()
        // user = null แปลว่ากำลังพาไป login LINE (หน้าจะเปลี่ยนเอง) → ค้าง "กำลังโหลด..." ไว้
        if (!user) return
        setLineUser(user)
        setMe(await getMe())
        setLoading(false)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }
    start()
  }, [])

  if (loading) {
        return <div className="flex min-h-screen items-center justify-center bg-primary-soft text-[18px] text-muted">กำลังโหลด...</div>
    
  }

  if (error) {
        return <div className="flex min-h-screen items-center justify-center bg-primary-soft p-6 text-center text-[18px] text-liff-red">{error}</div>
  }

  // ยังไม่ยินยอม PDPA และหน้านี้ต้องยินยอมก่อน → ไปหน้า PDPA พร้อมจำว่าจะกลับมาหน้าไหน (?next=...)
  if (!me.pdpaAccepted && !PAGES_WITHOUT_PDPA.includes(location.pathname)) {
    const next = encodeURIComponent(location.pathname)
    return <Navigate to={`/liff/pdpa?next=${next}`} replace />
  }

  // พื้นเขียวจาง #EFF4EB (primary-soft) เต็มจอ — ทุกหน้าฝั่งผู้ป่วย (ผู้ใช้สั่ง 2026-10-02)
  // เนื้อหากว้างไม่เกินขนาดมือถือ (max-w-md) และอยู่กึ่งกลาง
  return (
    <div className="min-h-screen bg-primary-soft">
      <div className="mx-auto max-w-md">
        <Outlet context={{ lineUser, me, setMe }} />
      </div>
    </div>
  )
}
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../../lib/api.js'
import iconClinic from '../../assets/login/icon-clinic.svg'
import iconUser from '../../assets/login/icon-user.svg'
import iconLock from '../../assets/login/icon-lock.svg'
import iconLogin from '../../assets/login/icon-login.svg'

// หน้าเข้าสู่ระบบของ staff — ตาม Figma "login" (93:1424)
// API ที่ใช้: S1 POST /api/admin/login (ดู docs/api-contract.md)
export default function AdminLogin() {
  // ค่าที่ผู้ใช้พิมพ์ในช่องกรอก
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // ข้อความผิดพลาด (ว่าง = ไม่มี)
  const [errorMessage, setErrorMessage] = useState('')
  // true = กำลังรอ server ตอบ (กันกดปุ่มซ้ำ)
  const [loading, setLoading] = useState(false)
  // ใช้เปลี่ยนหน้า
  const navigate = useNavigate()

  // ทำงานเมื่อกดปุ่ม Login หรือกด Enter
  async function handleSubmit(event) {
    event.preventDefault() // กันไม่ให้เบราว์เซอร์รีเฟรชหน้า
    setErrorMessage('')
    setLoading(true)
    try {
      await adminLogin(username, password)
      navigate('/admin') // สำเร็จ → ไปหน้ารายการนัด
    } catch (error) {
      setErrorMessage(error.message) // ไม่สำเร็จ → แสดงข้อความจาก server/mock
    } finally {
      setLoading(false)
    }
  }

  return (
    // พื้นหลังทั้งหน้า (เขียวจาง) จัดการ์ดไว้กลางจอ
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary-soft px-4 py-10">
      {/* การ์ด login */}
      <div className="w-full max-w-[448px] rounded-2xl bg-staff-card px-8 pt-[67px] pb-[57px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] sm:px-16">
        {/* โลโก้วงกลม */}
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-staff-logo-bg">
          <img src={iconClinic} alt="" className="size-10" />
        </div>

        {/* ชื่อคลินิก + คำอธิบาย */}
        <h1 className="mt-[50px] text-center text-[40px] leading-[46px] font-bold text-black">คลินิกครอบครัว</h1>
        <p className="-mt-1.5 text-center text-[26px] leading-[46px] text-staff-subtle">Staff Login</p>

        {/* ฟอร์ม */}
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          {/* ช่อง Username */}
          <label className="flex flex-col gap-2">
            <span className="text-sm leading-5 font-semibold tracking-[0.14px] text-staff-label">Username</span>
            <div className="relative">
              <img src={iconUser} alt="" className="absolute top-4 left-4 size-4" />
              <input
                className="h-12 w-full rounded-2xl border border-staff-border bg-staff-input pr-6 pl-[45px] text-base text-staff-label placeholder:text-staff-subtle"
                placeholder="Enter your username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </label>

          {/* ช่อง Password */}
          <label className="flex flex-col gap-2">
            <span className="text-sm leading-5 font-semibold tracking-[0.14px] text-staff-label">Password</span>
            <div className="relative">
              <img src={iconLock} alt="" className="absolute top-[13px] left-4 h-[21px] w-4" />
              <input
                type="password"
                className="h-12 w-full rounded-2xl border border-staff-border bg-staff-input px-[45px] text-base text-staff-label placeholder:text-staff-subtle"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </label>

          {/* ข้อความผิดพลาด — แสดงเฉพาะตอนมี error (ไม่มีใน Figma) */}
          {errorMessage && <p className="-my-2 text-sm text-staff-red">{errorMessage}</p>}

          {/* ปุ่ม Login */}
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-staff-green text-sm leading-5 font-semibold tracking-[0.14px] text-white disabled:opacity-60"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'Login'}
            <img src={iconLogin} alt="" className="size-[15px]" />
          </button>
        </form>
      </div>

      {/* ข้อความลิขสิทธิ์ใต้การ์ด */}
      <p className="mt-[18px] text-[15px] tracking-[-0.45px] text-black">© 2026 คลินิกครอบครัว สงวนลิขสิทธิ์</p>
    </div>
  )
}
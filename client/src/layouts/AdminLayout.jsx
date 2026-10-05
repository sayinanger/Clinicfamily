import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminLogout, getAdminMe } from '../lib/api.js'
import menuAppointments from '../assets/admin/menu-appointments.svg'
import menuAppointmentsActive from '../assets/admin/menu-appointments-active.svg'
import menuSlots from '../assets/admin/menu-slots.svg'
import menuSlotsActive from '../assets/admin/menu-slots-active.svg'
import menuStats from '../assets/admin/menu-stats.svg'
import menuStatsActive from '../assets/admin/menu-stats-active.svg'
import iconLogout from '../assets/admin/icon-logout.svg'
import iconStaffUser from '../assets/admin/icon-staff-user.svg'

// เมนูด้านซ้าย 3 เมนู — แต่ละเมนูมีไอคอน 2 สี (ปกติ = เทา, เลือกอยู่ = ฟ้า)
const menus = [
  { to: '/admin', label: 'ดูรายการนัดหมาย', icon: menuAppointments, iconActive: menuAppointmentsActive },
  { to: '/admin/slots', label: 'จัดการเวลา', icon: menuSlots, iconActive: menuSlotsActive },
  { to: '/admin/stats', label: 'สถิติ', icon: menuStats, iconActive: menuStatsActive },
]

// โครงหน้าของ staff ตาม Figma (255:52): เมนูข้างซ้าย + แถบบน + เนื้อหาแต่ละหน้า
// ทำหน้าที่ "ยาม" ด้วย: เปิดมาจะถาม server ว่า login อยู่ไหม (S3) ถ้าไม่ → พาไปหน้า login
// ออกแบบให้พอดีจอ MacBook Air (หน้าต่างเบราว์เซอร์ ≥ 1280×720)
export default function AdminLayout() {
  // staff ที่ login อยู่ — null = ยังเช็กไม่เสร็จ (ยังไม่แสดงหน้า)
  const [staff, setStaff] = useState(null)
  // ข้อความผิดพลาดที่ไม่ใช่ "ยังไม่ login" เช่น server ไม่ได้เปิด (ว่าง = ไม่มี)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()

  // ทำครั้งเดียวตอนเปิดหน้า: เช็กว่า login อยู่ไหม
  useEffect(() => {
    getAdminMe()
      .then((data) => setStaff(data.staff))
      .catch((error) => {
        if (error.status === 401) {
          navigate('/admin/login', { replace: true }) // ไม่ได้ login → ไปหน้า login
        } else {
          setErrorMessage(error.message) // ปัญหาอื่น (เช่น server ไม่ได้เปิด) → ข้อความแดงกลางจอ (ผู้ใช้เลือก 2026-10-06)
        }
      })
  }, [navigate])

  // กด "ออกจากระบบ" → ลบ session แล้วกลับหน้า login ทันที
  async function handleLogout() {
    try {
      await adminLogout()
    } finally {
      navigate('/admin/login', { replace: true })
    }
  }

  // เช็ก login ไม่ได้เพราะปัญหาอื่น → ข้อความแดงกลางจอ
  if (errorMessage) {
    return (
      <div className="flex h-screen items-center justify-center bg-staff-card p-6 text-center text-staff-red">
        {errorMessage}
      </div>
    )
  }

  // ระหว่างรอเช็ก login → แสดงพื้นว่าง ๆ (ไม่ให้เห็นข้อมูลก่อนรู้ว่า login แล้ว)
  if (!staff) {
    return <div className="h-screen bg-staff-card" />
  }

  return (
    // ทั้งจอสูงพอดีหน้าต่าง: ซ้าย = เมนู, ขวา = แถบบน + เนื้อหา
    <div className="flex h-screen bg-staff-card">
      {/* ===== เมนูข้างซ้าย (กว้าง 255px ตาม Figma) ===== */}
      <aside className="flex w-[255px] shrink-0 flex-col border-r border-staff-line bg-white">
        {/* ชื่อคลินิก */}
        <div className="px-7 pt-9">
          <p className="text-2xl leading-5 font-bold text-black">คลินิกครอบครัว</p>
          <p className="mt-[7px] text-sm leading-5 text-staff-subtle">Staff Dashboard</p>
        </div>

        {/* รายการเมนู — NavLink บอกได้ว่าเมนูไหนตรงกับหน้าที่เปิดอยู่ (isActive) */}
        <nav className="mt-[29px] flex flex-1 flex-col gap-2 px-4">
          {menus.map((menu) => (
            <NavLink
              key={menu.to}
              to={menu.to}
              end // ให้ "/admin" ติดสีเฉพาะตอนอยู่หน้า /admin พอดี
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg p-3 text-sm leading-5 font-medium ${
                  isActive ? 'bg-staff-blue-soft text-staff-blue' : 'text-staff-menu hover:bg-staff-line'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <img src={isActive ? menu.iconActive : menu.icon} alt="" className="size-5" />
                  {menu.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ปุ่มออกจากระบบ (ล่างสุด) */}
        <div className="border-t border-staff-line px-4 pt-[17px] pb-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-sm leading-5 font-medium text-staff-menu hover:bg-staff-line"
          >
            <img src={iconLogout} alt="" className="size-5" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* ===== ฝั่งขวา ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* แถบบน: ชื่อ staff + รูปคน */}
        <header className="flex h-16 shrink-0 items-center justify-end gap-3 border-b border-staff-line bg-white px-8">
          <span className="text-sm leading-5 font-medium text-staff-name">{staff.name}</span>
          <span className="flex size-8 items-center justify-center rounded-full bg-staff-avatar">
            <img src={iconStaffUser} alt="" className="size-5" />
          </span>
        </header>

        {/* เนื้อหาของแต่ละหน้า (Outlet = ที่วางหน้าลูก) — ถ้ายาวเกินจอจะเลื่อนเฉพาะส่วนนี้ */}
        <main className="flex-1 overflow-y-auto px-8 pt-4 pb-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
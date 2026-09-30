import { Routes, Route, Navigate } from 'react-router-dom'
import LiffLayout from './layouts/LiffLayout.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import LiffHome from './pages/liff/LiffHome.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminAppointments from './pages/admin/AdminAppointments.jsx'
import AdminComingSoon from './pages/admin/AdminComingSoon.jsx'
import NotFound from './pages/NotFound.jsx'

// กำหนดเส้นทาง (route) ทั้งหมดของแอป
// /liff/...  = หน้าของผู้ป่วย (เปิดใน LINE)
// /admin/... = หน้าของ staff (เปิดในเบราว์เซอร์)
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />

      {/* ฝั่งผู้ป่วย: LiffLayout จะเริ่ม LIFF ก่อนแสดงหน้าข้างใน */}
      <Route path="/liff" element={<LiffLayout />}>
        <Route index element={<LiffHome />} />
      </Route>

      {/* ฝั่ง staff — ทุกหน้าใน AdminLayout ต้อง login ก่อน (AdminLayout เช็กให้) */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminAppointments />} />
        {/* หน้าชั่วคราว — ขั้น 5–6 จะเปลี่ยนเป็นหน้าจริง */}
        <Route path="slots" element={<AdminComingSoon title="จัดการเวลา" />} />
        <Route path="stats" element={<AdminComingSoon title="สถิติ" />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
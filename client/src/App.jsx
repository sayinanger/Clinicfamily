import { Routes, Route, Navigate } from 'react-router-dom'
import LiffLayout from './layouts/LiffLayout.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import LiffHome from './pages/liff/LiffHome.jsx'
import LiffPdpa from './pages/liff/LiffPdpa.jsx'
import LiffProfile from './pages/liff/LiffProfile.jsx'
import LiffBooking from './pages/liff/LiffBooking.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminAppointments from './pages/admin/AdminAppointments.jsx'
import AdminSlots from './pages/admin/AdminSlots.jsx'
import AdminStats from './pages/admin/AdminStats.jsx'
import NotFound from './pages/NotFound.jsx'

// กำหนดเส้นทาง (route) ทั้งหมดของแอป
// /liff/...  = หน้าของผู้ป่วย (เปิดใน LINE)
// /admin/... = หน้าของ staff (เปิดในเบราว์เซอร์)
// Navigate = เปลี่ยนหน้าเลย (ไม่ต้องกดย้อนกลับมาหน้านี้)
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} /> 

      {/* ฝั่งผู้ป่วย: LiffLayout จะเริ่ม LIFF + เช็ก PDPA ก่อนแสดงหน้าข้างใน */}
      <Route path="/liff" element={<LiffLayout />}>
        <Route index element={<LiffHome />} />
        <Route path="pdpa" element={<LiffPdpa />} />
        <Route path="profile" element={<LiffProfile />} />
        <Route path="booking" element={<LiffBooking />} />
      </Route>

      {/* ฝั่ง staff — ทุกหน้าใน AdminLayout ต้อง login ก่อน (AdminLayout เช็กให้) */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminAppointments />} />
        <Route path="slots" element={<AdminSlots />} />
        <Route path="stats" element={<AdminStats />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}


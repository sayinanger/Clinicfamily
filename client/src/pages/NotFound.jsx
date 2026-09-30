import { Link } from 'react-router-dom'

// หน้าที่แสดงเมื่อไม่พบเส้นทาง
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-gray-600">ไม่พบหน้าที่ต้องการ</p>
      <Link to="/admin" className="text-primary underline">กลับหน้าหลัก</Link>
    </div>
  )
}

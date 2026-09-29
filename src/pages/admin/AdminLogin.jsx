import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// หน้าเข้าสู่ระบบของ staff (ยังไม่ต่อ API — จะเชื่อมเมื่อทำ backend)
export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  function handleSubmit(event) {
    event.preventDefault()
    // TODO: เรียก POST /api/admin/login แล้วค่อยเปลี่ยนหน้า
    navigate('/admin')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-xl bg-white p-6 shadow">
        <h1 className="text-center text-xl font-bold text-primary">เข้าสู่ระบบ Staff</h1>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="ชื่อผู้ใช้"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="รหัสผ่าน"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="w-full rounded-lg bg-primary py-2 font-semibold text-white">เข้าสู่ระบบ</button>
      </form>
    </div>
  )
}

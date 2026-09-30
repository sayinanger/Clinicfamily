import { NavLink, Outlet } from 'react-router-dom'

// โครงหน้าของ staff: แถบเมนูด้านซ้าย + เนื้อหาด้านขวา
export default function AdminLayout() {
  const menuClass = ({ isActive }) =>
    `block rounded-lg px-4 py-2 ${isActive ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 border-r border-gray-200 bg-white p-4">
        <h1 className="mb-6 text-xl font-bold text-primary">Clinicfamily</h1>
        <nav className="space-y-1">
          <NavLink to="/admin" end className={menuClass}>ดูรายการนัดหมาย</NavLink>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}

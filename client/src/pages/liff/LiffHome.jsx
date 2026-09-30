import { useOutletContext } from 'react-router-dom'

// หน้าแรกของผู้ป่วย (ชั่วคราว) — แสดงว่า LIFF ดึง LINE User ID ได้แล้ว
export default function LiffHome() {
  const { lineUser } = useOutletContext()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-primary">Clinicfamily</h1>
      <p className="mt-4 text-gray-700">สวัสดี {lineUser?.displayName}</p>
      <p className="mt-2 break-all text-sm text-gray-500">LINE User ID: {lineUser?.lineUserId}</p>
    </div>
  )
}

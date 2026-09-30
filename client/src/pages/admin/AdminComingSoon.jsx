// หน้าชั่วคราวของเมนูที่ยังไม่ได้ทำ (จัดการเวลา = ขั้น 5, สถิติ = ขั้น 6)
// title = ชื่อหน้า — ขั้น 5–6 จะเปลี่ยนไปใช้หน้าจริงแทนไฟล์นี้
export default function AdminComingSoon({ title }) {
  return (
    <div>
      <h1 className="text-2xl leading-7 font-bold text-black">{title}</h1>
      <p className="mt-3 text-staff-subtle">ยังไม่ได้ทำ</p>
    </div>
  )
}
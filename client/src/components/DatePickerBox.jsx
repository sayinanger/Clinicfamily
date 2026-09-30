import { useRef } from 'react'
import { formatThaiDateLong } from '../lib/format.js'
import iconCalendar from '../assets/admin/icon-calendar.svg'

// กล่องเลือกวันที่ของหน้า staff (ใช้ร่วมกันในหน้า "ดูรายการนัดหมาย" และ "จัดการเวลา")
// หน้าตาตาม Figma (กล่อง 289×38 + ไอคอนปฏิทิน) แต่ปฏิทินที่เด้งขึ้นมาเป็นของเบราว์เซอร์
//
// วิธีใช้: <DatePickerBox value={date} onChange={(newDate) => ...} />
//   value    = วันที่ที่แสดงอยู่ 'YYYY-MM-DD' (ว่าง = ยังไม่รู้ → แสดง "กำลังโหลด...")
//   onChange = ฟังก์ชันที่ถูกเรียกเมื่อเลือกวันใหม่ ได้รับวันที่ 'YYYY-MM-DD'
export default function DatePickerBox({ value, onChange }) {
  // ใช้สั่งเปิดปฏิทินของเบราว์เซอร์ (ช่องวันที่จริงที่โปร่งใส)
  const dateInputRef = useRef(null)

  // กดกล่อง → สั่งเปิดปฏิทิน (ถ้าเบราว์เซอร์ไม่รองรับคำสั่งนี้ก็ไม่เป็นไร
  // เพราะช่องวันที่จริงวางทับกล่องอยู่ กดแล้วเบราว์เซอร์เปิดปฏิทินให้เอง)
  function openCalendar() {
    try {
      dateInputRef.current.showPicker()
    } catch {
      // ไม่ต้องทำอะไร
    }
  }

  // เลือกวันที่แล้ว → ส่งวันที่ใหม่กลับไปให้หน้าที่ใช้กล่องนี้
  function handleChange(event) {
    if (event.target.value) {
      onChange(event.target.value)
    }
  }

  return (
    // กล่องหน้าตาตาม Figma + ช่องวันที่จริง (โปร่งใส) วางทับอยู่ด้านบน
    // กดตรงไหนของกล่องก็เท่ากับกดช่องวันที่จริง → ปฏิทินของเบราว์เซอร์เด้งขึ้นมา
    <div className="relative h-[38px] w-[289px]">
      {/* ส่วนที่มองเห็น */}
      <div className="flex h-full w-full items-center justify-between rounded-[5px] border border-staff-subtle bg-white px-[15px] text-[15px] font-medium text-black">
        {value ? formatThaiDateLong(value) : 'กำลังโหลด...'}
        <img src={iconCalendar} alt="" className="size-3.5" />
      </div>
      {/* ช่องวันที่จริง: โปร่งใส (opacity-0) วางทับทั้งกล่อง
          บรรทัด [&::-webkit-calendar-picker-indicator] = ขยายปุ่มปฏิทินของ Chrome ให้เต็มกล่อง */}
      <input
        ref={dateInputRef}
        type="date"
        value={value}
        onChange={handleChange}
        onClick={openCalendar}
        aria-label="เลือกวันที่"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
    </div>
  )
}
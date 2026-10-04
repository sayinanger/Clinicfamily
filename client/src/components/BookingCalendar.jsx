import { useState } from 'react'
import { formatThaiMonthLong } from '../lib/format.js'
import { getNowMs } from '../lib/api.js'

// หัวคอลัมน์ปฏิทิน เริ่มวันอาทิตย์ (ผู้ใช้เลือก 2026-10-02)
const WEEKDAY_HEADERS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// เดือน 'YYYY-MM' บวก/ลบ จำนวนเดือน เช่น addMonths('2026-12', 1) → '2027-01'
function addMonths(month, amount) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + amount, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// วันนี้ 'YYYY-MM-DD' — ใช้ขีดเส้นใต้วันนี้ในปฏิทิน (โหมดข้อมูลปลอมใช้วันของนาฬิกาจำลอง)
function todayString() {
  const now = new Date(getNowMs())
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ปฏิทินเลือกวันบนหน้าจองคิว (แบบ ก ที่ผู้ใช้เลือก 2026-10-03 แทนแถบ 4 วันใน Figma)
// props:
//   days         = วันที่จองได้จาก U4 [{ date: 'YYYY-MM-DD', availableCount }]
//   selectedDate = วันที่เลือกอยู่ตอนนี้
//   onSelect(date) = กดวันที่ → ส่งวันที่กลับไปให้หน้าจองคิวโหลดตารางใหม่ทันที
//   originalDate = (หน้าเลื่อนนัดเท่านั้น — ขั้น 7.5) วันของนัดเดิม → วงกลมเส้นประ + คำอธิบาย "นัดเดิม"
// วันเปิดที่ยังมีคิวว่าง = วงกลมขอบเขียว (กดได้), วันที่เลือก = วงกลมเขียวทึบ,
// วันอื่น/วันที่เต็มแล้ว = ตัวเลขเทา ไม่มีวงกลม (กดไม่ได้)
export default function BookingCalendar({ days, selectedDate, onSelect, originalDate }) {
  const [viewMonth, setViewMonth] = useState(selectedDate.slice(0, 7)) // เดือนที่กำลังดู 'YYYY-MM'

  // วันที่กดได้ = มีคิวว่างอย่างน้อย 1 คิว
  const bookableDates = days.filter((day) => day.availableCount > 0).map((day) => day.date)
  // เดือนที่มีวันให้จอง → ใช้เปิด/ปิดปุ่ม ‹ ›
  const months = days.map((day) => day.date.slice(0, 7))
  const canGoBack = months.some((month) => month < viewMonth)
  const canGoNext = months.some((month) => month > viewMonth)

  // สร้างช่องของเดือนที่ดู: ช่องว่างก่อนวันที่ 1 + วันที่ 1..สิ้นเดือน
  const [year, monthNumber] = viewMonth.split('-').map(Number)
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay() // 0 = อาทิตย์
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${viewMonth}-${String(day).padStart(2, '0')}`)
  }
  const today = todayString()

  return (
    <div className="rounded-[5px] border border-primary bg-white px-2.5 pt-2.5 pb-2">
      {/* หัวปฏิทิน: ‹ ชื่อเดือน › */}
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, -1))}
          disabled={!canGoBack}
          aria-label="เดือนก่อน"
          className="h-8 w-8 text-[22px] text-primary disabled:text-[#CCCCCC]"
        >
          ‹
        </button>
        <p className="text-[18px] font-bold text-black">{formatThaiMonthLong(viewMonth)}</p>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          disabled={!canGoNext}
          aria-label="เดือนถัดไป"
          className="h-8 w-8 text-[22px] text-primary disabled:text-[#CCCCCC]"
        >
          ›
        </button>
      </div>

      {/* ตารางวัน 7 คอลัมน์ */}
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_HEADERS.map((name) => (
          <div key={name} className="py-0.5 text-[14px] font-semibold text-muted">
            {name}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />
          const dayNumber = Number(date.slice(8))
          const canPick = bookableDates.includes(date)
          const isSelected = date === selectedDate
          const isToday = date === today

          // สีของวงกลมตามสถานะ
          let circleClass = 'text-[#BBBBBB]' // วันอื่น/เต็ม → ตัวเลขเทา ไม่มีวงกลม
          if (canPick && isSelected) circleClass = 'border-2 border-primary bg-primary font-bold text-white'
          else if (canPick) circleClass = 'border-2 border-primary font-bold text-primary'
          // วันของนัดเดิม (หน้าเลื่อนนัด) → เส้นประ (ถ้าวันนั้นเต็ม = วงกลมเส้นประสีเทา)
          if (date === originalDate) {
            circleClass += canPick ? ' border-dashed' : ' border-2 border-dashed border-[#BBBBBB]'
          }

          return (
            <div key={date} className="flex h-9 items-center justify-center">
              <button
                type="button"
                disabled={!canPick}
                onClick={() => onSelect(date)}
                className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-[16px] ${circleClass} ${
                  isToday ? 'underline' : ''
                }`}
              >
                {dayNumber}
              </button>
            </div>
          )
        })}
      </div>

      {/* คำอธิบายสี */}
      <div className="mt-1.5 flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-[13px] text-[#555555]">
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded-full bg-primary" />
          วันที่เลือก
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded-full border-2 border-primary" />
          เปิดให้จอง
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded-full bg-[#DDDDDD]" />
          เต็ม/ปิด
        </span>
        {originalDate && (
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-primary" />
            นัดเดิม
          </span>
        )}
      </div>
    </div>
  )
}
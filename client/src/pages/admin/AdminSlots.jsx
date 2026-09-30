import { useEffect, useState } from 'react'
import { getAdminSlots, closeSlot, openSlot } from '../../lib/api.js'
import DatePickerBox from '../../components/DatePickerBox.jsx'

// หน้าจัดการเวลา — ตาม Figma "จัดการเวลา (v2)" (255:203)
// API ที่ใช้: S7 ดูเวลาของวัน, S8 กด [ปิด], S9 กด [เปิด] (ดู docs/api-contract.md)
// ใช้ขนาดเดียวกับหน้ารายการนัด (แถวสูง 40px เตี้ยกว่า Figma, ตัวหนังสือในตารางตัวปกติ ยกเว้นสถานะ)
// เพื่อให้ 12 คิวอยู่ในจอ MacBook Air โดยไม่ต้องเลื่อน

// คำและสีจุดของแต่ละสถานะ
const statusLabels = {
  available: { text: 'เปิดรับการจอง', dot: 'bg-staff-open' },
  closed: { text: 'ปิดรับการจอง', dot: 'bg-staff-closed-dot' },
  booked: { text: 'มีผู้จองแล้ว', dot: 'bg-staff-blue' },
  held: { text: 'กำลังถูกจอง', dot: 'bg-staff-orange' },
}

// วันที่ 'YYYY-MM-DD' เป็นเสาร์/อาทิตย์ไหม (getDay: 0 = อาทิตย์, 6 = เสาร์)
// ใช้เลือกข้อความตอนตารางว่าง
function isWeekend(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const dayOfWeek = new Date(year, month - 1, day).getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

export default function AdminSlots() {
  // วันที่ที่กำลังดู 'YYYY-MM-DD' — ว่าง = ยังไม่รู้ (รอ server บอกวันเปิดทำการถัดไป)
  const [date, setDate] = useState('')
  // เวลาทั้งหมดของวันนั้น (ปกติ 12 คิว)
  const [slots, setSlots] = useState([])
  // true = กำลังโหลด
  const [loading, setLoading] = useState(true)
  // ข้อความผิดพลาด (ว่าง = ไม่มี)
  const [errorMessage, setErrorMessage] = useState('')
  // id ของเวลาที่กำลังกดปุ่มอยู่ (กันกดซ้ำ) — null = ไม่มี
  const [busyId, setBusyId] = useState(null)

  // โหลดเวลาของวัน — selectedDate ว่าง = ให้ server เลือกวันเปิดทำการถัดไป
  async function loadSlots(selectedDate) {
    setLoading(true)
    setErrorMessage('')
    try {
      const data = await getAdminSlots(selectedDate)
      setDate(data.date)
      setSlots(data.slots)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  // เปิดหน้ามาครั้งแรก → โหลดวันเปิดทำการถัดไป
  useEffect(() => {
    loadSlots('')
  }, [])

  // กด [ปิด] หรือ [เปิด] — action = closeSlot หรือ openSlot
  async function handleAction(slotId, action) {
    setBusyId(slotId)
    setErrorMessage('')
    try {
      const updated = await action(slotId)
      // แทนที่แถวเดิมด้วยข้อมูลใหม่จาก server
      setSlots((list) => list.map((item) => (item.slotId === slotId ? updated : item)))
    } catch (error) {
      setErrorMessage(error.message) // เช่น "ปิดได้เฉพาะเวลาที่ยังว่าง" (มีคนจองไปก่อนกด)
      loadSlots(date) // โหลดใหม่ให้ตรงกับ server
    } finally {
      setBusyId(null)
    }
  }

  // ปุ่มในคอลัมน์ "จัดการ" ของแต่ละแถว — ปุ่มบอกสิ่งที่จะทำเมื่อกด
  function renderAction(item) {
    const busy = busyId === item.slotId
    // ทุกปุ่มกว้าง 73px เท่ากัน (ตาม Figma หน้านี้) ตัวหนังสือตัวปกติ
    const buttonBase = 'h-7 w-[73px] rounded-[5px] border bg-white text-sm'

    // เปิดรับการจองอยู่ → ปุ่ม [ปิด] กรอบแดง
    if (item.status === 'available') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction(item.slotId, closeSlot)}
          className={`${buttonBase} border-staff-red text-staff-red hover:bg-red-50 disabled:opacity-60`}
        >
          ปิด
        </button>
      )
    }

    // ปิดรับการจองอยู่ → ปุ่ม [เปิด] กรอบเขียว
    if (item.status === 'closed') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction(item.slotId, openSlot)}
          className={`${buttonBase} border-staff-open text-staff-open hover:bg-green-50 disabled:opacity-60`}
        >
          เปิด
        </button>
      )
    }

    // มีผู้จองแล้ว / กำลังถูกจอง → "ปิดไม่ได้" สีเทา กดไม่ได้
    return (
      <button type="button" disabled className={`${buttonBase} border-staff-disabled text-staff-disabled`}>
        ปิดไม่ได้
      </button>
    )
  }

  // ข้อความตอนตารางว่าง: วันธรรมดา = คลินิกไม่เปิด, เสาร์–อาทิตย์ = ระบบยังไม่สร้างเวลา (ไกลเกิน 14 วัน)
  function emptyMessage() {
    if (date && !isWeekend(date)) {
      return 'วันนี้ไม่มีเวลาทำการ (คลินิกเปิดเฉพาะเสาร์–อาทิตย์)'
    }
    return 'ยังไม่มีเวลาของวันนี้ (ระบบสร้างล่วงหน้า 14 วัน)'
  }

  return (
    <div>
      {/* หัวข้อหน้า */}
      <h1 className="text-2xl leading-7 font-bold text-black">จัดการเวลา</h1>

      {/* แถวเลือกวันที่ */}
      <div className="mt-2 flex items-center gap-6">
        <span className="text-xl font-medium text-black">วันที่</span>
        {/* กล่องเลือกวันที่ (ใช้ร่วมกับหน้ารายการนัด) — เลือกวันใหม่ → โหลดเวลาของวันนั้น */}
        <DatePickerBox value={date} onChange={loadSlots} />
      </div>

      {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
      {errorMessage && <p className="mt-3 text-sm text-staff-red">{errorMessage}</p>}

      {/* ตารางเวลา */}
      <div className="mt-3 overflow-hidden rounded-xl border border-staff-table-border bg-white">
        <table className="w-full table-fixed text-left text-[15px] text-black">
          {/* ความกว้างแต่ละคอลัมน์ (สัดส่วนตาม Figma) */}
          <colgroup>
            <col className="w-[41.4%]" />
            <col className="w-[37%]" />
            <col className="w-[21.6%]" />
          </colgroup>
          <thead className="bg-staff-table-head">
            <tr className="h-10">
              <th className="pl-10 font-medium">เวลา</th>
              <th className="pl-[25px] font-medium">สถานะ</th>
              <th className="pl-[13px] font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-staff-border">
            {loading ? (
              <tr className="h-10">
                <td colSpan={3} className="text-center text-staff-subtle">
                  กำลังโหลด...
                </td>
              </tr>
            ) : slots.length === 0 ? (
              <tr className="h-10">
                <td colSpan={3} className="text-center text-staff-subtle">
                  {emptyMessage()}
                </td>
              </tr>
            ) : (
              slots.map((item) => (
                <tr key={item.slotId} className="h-10">
                  <td className="pl-10">{item.startTime}</td>
                  <td>
                    {/* จุดสีหน้าสถานะ (ขนาด 7px ตาม Figma) — คำสถานะตัวหนา แบบเดียวกับหน้ารายการนัด */}
                    <span className="flex items-center gap-3 text-sm font-medium">
                      <span className={`size-[7px] rounded-full ${statusLabels[item.status]?.dot}`} />
                      {statusLabels[item.status]?.text}
                    </span>
                  </td>
                  <td>{renderAction(item)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
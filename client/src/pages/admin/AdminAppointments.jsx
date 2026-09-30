import { useEffect, useRef, useState } from 'react'
import { getAdminAppointments, markNoShow, undoNoShow } from '../../lib/api.js'
import { formatThaiDateLong, formatThaiDateShort } from '../../lib/format.js'
import iconCalendar from '../../assets/admin/icon-calendar.svg'

// หน้าดูรายการนัดหมาย — ตาม Figma "ดูรายการนัดหมาย (v2)" (255:52)
// API ที่ใช้: S4 ดูรายการ, S5 กด [ไม่มา], S6 กด [แก้คืน] (ดู docs/api-contract.md)
// ปรับความสูงแถวให้เล็กกว่า Figma เพื่อให้ 12 คิวอยู่ในจอ MacBook Air โดยไม่ต้องเลื่อน

// คำและสีของแต่ละสถานะ
const statusLabels = {
  booked: { text: 'ยืนยันแล้ว', color: 'text-staff-ok' },
  no_show: { text: 'ไม่มา', color: 'text-staff-orange' },
  cancelled: { text: 'ยกเลิก', color: 'text-staff-red' },
}

export default function AdminAppointments() {
  // วันที่ที่กำลังดู 'YYYY-MM-DD' — ว่าง = ยังไม่รู้ (รอ server บอกวันเปิดทำการถัดไป)
  const [date, setDate] = useState('')
  // รายการนัดของวันนั้น
  const [appointments, setAppointments] = useState([])
  // true = กำลังโหลดรายการ
  const [loading, setLoading] = useState(true)
  // ข้อความผิดพลาด (ว่าง = ไม่มี)
  const [errorMessage, setErrorMessage] = useState('')
  // id ของนัดที่กำลังกดปุ่มอยู่ (กันกดซ้ำ) — null = ไม่มี
  const [busyId, setBusyId] = useState(null)
  // เวลาปัจจุบัน อัปเดตทุก 10 วินาที → ปุ่ม [แก้คืน] เปลี่ยนเป็นสีเทาเมื่อครบ 5 นาที
  const [now, setNow] = useState(Date.now())
  // ใช้สั่งเปิดปฏิทินของเบราว์เซอร์ (ช่องวันที่จริงที่โปร่งใส)
  const dateInputRef = useRef(null)

  // โหลดรายการนัด — selectedDate ว่าง = ให้ server เลือกวันเปิดทำการถัดไป
  async function loadAppointments(selectedDate) {
    setLoading(true)
    setErrorMessage('')
    try {
      const data = await getAdminAppointments(selectedDate)
      setDate(data.date)
      setAppointments(data.appointments)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  // เปิดหน้ามาครั้งแรก → โหลดวันเปิดทำการถัดไป
  useEffect(() => {
    loadAppointments('')
  }, [])

  // นาฬิกาเดินทุก 10 วินาที (หยุดเมื่อออกจากหน้า)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])

  // เลือกวันที่ใหม่จากปฏิทิน → โหลดรายการของวันนั้น
  function handleDateChange(event) {
    if (event.target.value) {
      loadAppointments(event.target.value)
    }
  }

  // กดกล่องวันที่ → สั่งเปิดปฏิทินของเบราว์เซอร์ (ถ้าเบราว์เซอร์ไม่รองรับคำสั่งนี้
  // ก็ไม่เป็นไร เพราะช่องวันที่จริงวางทับกล่องอยู่ กดแล้วเบราว์เซอร์เปิดปฏิทินให้เอง)
  function openCalendar() {
    try {
      dateInputRef.current.showPicker()
    } catch {
      // ไม่ต้องทำอะไร
    }
  }

  // กด [ไม่มา] หรือ [แก้คืน] — action = markNoShow หรือ undoNoShow
  async function handleAction(appointmentId, action) {
    setBusyId(appointmentId)
    setErrorMessage('')
    try {
      const updated = await action(appointmentId)
      // แทนที่แถวเดิมด้วยข้อมูลใหม่จาก server
      setAppointments((list) => list.map((item) => (item.appointmentId === appointmentId ? updated : item)))
    } catch (error) {
      setErrorMessage(error.message) // เช่น "เกิน 5 นาทีแล้ว แก้คืนไม่ได้"
      loadAppointments(date) // โหลดใหม่ให้ตรงกับ server
    } finally {
      setBusyId(null)
    }
  }

  // ปุ่มในคอลัมน์ "จัดการ" ของแต่ละแถว
  function renderAction(item) {
    const busy = busyId === item.appointmentId
        // ทุกปุ่มกว้าง 64px เท่ากัน (เท่าปุ่ม [แก้คืน] ใน Figma)
    const buttonBase = 'h-7 w-16 rounded-md border bg-white text-sm'

    // ยืนยันแล้ว → ปุ่ม [ไม่มา] (ถึงเวลานัด = กรอบแดงกดได้, ยังไม่ถึง = สีเทากดไม่ได้)
    if (item.status === 'booked') {
      return item.canMarkNoShow ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction(item.appointmentId, markNoShow)}
          className={`${buttonBase} border-staff-red text-staff-red hover:bg-red-50 disabled:opacity-60`}
        >
          ไม่มา
        </button>
      ) : (
        <button type="button" disabled className={`${buttonBase} border-staff-disabled text-staff-disabled`}>
          ไม่มา
        </button>
      )
    }

    // ไม่มา → ปุ่ม [แก้คืน] (ยังไม่เกิน 5 นาที = กดได้, เกินแล้ว = สีเทากดไม่ได้)
    if (item.status === 'no_show') {
      const undoStillOpen =
        item.canUndoNoShow && item.undoNoShowUntil && new Date(item.undoNoShowUntil).getTime() > now
      return undoStillOpen ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction(item.appointmentId, undoNoShow)}
          className={`${buttonBase} border-staff-undo text-staff-undo hover:bg-gray-50 disabled:opacity-60`}
        >
          แก้คืน
        </button>
      ) : (
        <button type="button" disabled className={`${buttonBase} border-staff-disabled text-staff-disabled`}>
          แก้คืน
        </button>
      )
    }

    // ยกเลิก → ขีด "—" (ไม่มีปุ่ม)
    return <span className="inline-block w-16 text-center text-staff-disabled">—</span>
  }

  return (
    <div>
      {/* หัวข้อหน้า */}
      <h1 className="text-2xl leading-7 font-bold text-black">ดูรายการนัดหมาย</h1>

      {/* แถวเลือกวันที่ */}
      <div className="mt-2 flex items-center gap-6">
        <span className="text-xl font-medium text-black">วันที่</span>
        {/* กล่องหน้าตาตาม Figma + ช่องวันที่จริง (โปร่งใส) วางทับอยู่ด้านบน
            กดตรงไหนของกล่องก็เท่ากับกดช่องวันที่จริง → ปฏิทินของเบราว์เซอร์เด้งขึ้นมา */}
        <div className="relative h-[38px] w-[289px]">
          {/* ส่วนที่มองเห็น */}
          <div className="flex h-full w-full items-center justify-between rounded-[5px] border border-staff-subtle bg-white px-[15px] text-[15px] font-medium text-black">
            {date ? formatThaiDateLong(date) : 'กำลังโหลด...'}
            <img src={iconCalendar} alt="" className="size-3.5" />
          </div>
          {/* ช่องวันที่จริง: โปร่งใส (opacity-0) วางทับทั้งกล่อง
              บรรทัด [&::-webkit-calendar-picker-indicator] = ขยายปุ่มปฏิทินของ Chrome ให้เต็มกล่อง */}
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={handleDateChange}
            onClick={openCalendar}
            aria-label="เลือกวันที่"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />
        </div>
      </div>

      {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
      {errorMessage && <p className="mt-3 text-sm text-staff-red">{errorMessage}</p>}

      {/* ตารางรายการนัด */}
      <div className="mt-3 overflow-hidden rounded-xl border border-staff-table-border bg-white">
        <table className="w-full table-fixed text-left text-[15px] text-black">
          {/* ความกว้างแต่ละคอลัมน์ (สัดส่วนตาม Figma) */}
          <colgroup>
            <col className="w-[11.7%]" />
            <col className="w-[22.8%]" />
            <col className="w-[15.6%]" />
            <col className="w-[12.5%]" />
            <col className="w-[10.4%]" />
            <col className="w-[14.6%]" />
            <col className="w-[12.4%]" />
          </colgroup>
          <thead className="bg-staff-table-head">
            <tr className="h-10">
              <th className="text-center font-medium">ลำดับ</th>
              <th className="pl-9 font-medium">ชื่อผู้จอง</th>
              <th className="font-medium">เบอร์โทร</th>
              <th className="font-medium">วันที่</th>
              <th className="font-medium">เวลา</th>
              <th className="font-medium">สถานะ</th>
              <th className="pl-[5px] font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-staff-border">
            {loading ? (
              <tr className="h-10">
                <td colSpan={7} className="text-center text-staff-subtle">
                  กำลังโหลด...
                </td>
              </tr>
            ) : appointments.length === 0 ? (
              <tr className="h-10">
                <td colSpan={7} className="text-center text-staff-subtle">
                  ไม่มีนัดหมายในวันนี้
                </td>
              </tr>
            ) : (
              appointments.map((item, index) => (
                <tr key={item.appointmentId} className="h-10">
                  <td className="text-center">{index + 1}</td>
                  <td className="truncate pl-9">
                    {item.firstName} {item.lastName}
                  </td>
                  <td>{item.phone}</td>
                  <td>{formatThaiDateShort(item.date)}</td>
                  <td>{item.startTime}</td>
                  <td className={`font-medium ${statusLabels[item.status]?.color}`}>{statusLabels[item.status]?.text}</td>
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
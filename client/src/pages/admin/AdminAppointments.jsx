import { useEffect, useRef, useState } from 'react'
import { getAdminAppointments, markNoShow, undoNoShow, getNowMs, getHealth, sendDemoReminder } from '../../lib/api.js'
import { formatThaiDateShort } from '../../lib/format.js'
import DatePickerBox from '../../components/DatePickerBox.jsx'

// หน้าดูรายการนัดหมาย — ตาม Figma "ดูรายการนัดหมาย (v2)" (255:52)
// API ที่ใช้: S4 ดูรายการ, S5 กด [ไม่มา], S6 กด [แก้คืน] (ดู docs/api-contract.md)
// ชุด P: โหมดเดโม (health.demo = true — O18ก) → ป้าย "โหมดเดโม · เวลา …" (P5ก) + คอลัมน์ "ส่งเตือน (เดโม)" (P3ก)
//   ปุ่ม [เตือนวันก่อน] [เตือน 2 ชม.] ในแถวที่ยืนยันแล้ว → D1 ส่งการ์ดเตือนทันที → กล่องเขียว/แดงเหนือตาราง (P2ก)
// ปรับความสูงแถวให้เล็กกว่า Figma เพื่อให้ 12 คิวอยู่ในจอ MacBook Air โดยไม่ต้องเลื่อน

// คำและสีของแต่ละสถานะ
// ชื่อการ์ดเตือนแต่ละแบบ (ตรงกับหัวการ์ดใน server/lib/lineMessages.js) + คำบนปุ่ม
const reminderTypes = [
  { type: 'day_before', button: 'เตือนวันก่อน', title: 'พรุ่งนี้มีนัด' },
  { type: 'before_2h', button: 'เตือน 2 ชม.', title: 'อีก 2 ชั่วโมงถึงเวลานัด' },
]

// ความกว้างคอลัมน์ (สัดส่วนตาม Figma) — โหมดเดโมเพิ่มคอลัมน์ "ส่งเตือน (เดโม)" ท้ายสุด แล้วบีบคอลัมน์อื่น
const NORMAL_COLUMNS = ['11.7%', '22.8%', '15.6%', '12.5%', '10.4%', '14.6%', '12.4%']
const DEMO_COLUMNS = ['7%', '17%', '13%', '12.5%', '7%', '10.5%', '10%', '23%']

// เวลา (มิลลิวินาที) → '18 ต.ค. 05:20' เวลาไทย (ใช้ในป้ายโหมดเดโม)
function formatDemoTime(ms) {
  return new Date(ms).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  // ใช้ getNowMs() (ไม่ใช้ Date.now() ตรง ๆ) เพื่อให้ตรงกับเวลาของ server ตอนเดโมที่ตั้ง DEMO_NOW
  const [now, setNow] = useState(getNowMs())
  // วันที่ที่กำลังดูอยู่ "ตอนนี้" — ใช้เช็กตอนโหลดเงียบ ๆ ว่าผู้ใช้เปลี่ยนวันไปแล้วหรือยัง
  // (useRef = ตัวแปรที่จำค่าไว้ได้ แต่เปลี่ยนแล้วไม่ทำให้หน้าวาดใหม่)
  const currentDateRef = useRef('')
  // true = server เปิดโหมดเดโมอยู่ (จาก /api/health) → แสดงป้าย + ปุ่มส่งเตือน
  const [demo, setDemo] = useState(false)
  // ปุ่มส่งเตือนที่กำลังกดอยู่ เช่น '12-before_2h' (กันกดซ้ำ) — null = ไม่มี
  const [busyReminder, setBusyReminder] = useState(null)
  // ผลการกดส่งเตือนล่าสุด { ok: true/false, text } — null = ไม่แสดงกล่อง
  const [reminderResult, setReminderResult] = useState(null)

  // โหลดรายการนัด — selectedDate ว่าง = ให้ server เลือกวันเปิดทำการถัดไป
  // silent = true → โหลดเงียบ ๆ (ไม่ขึ้น "กำลังโหลด..." ไม่ลบข้อความผิดพลาดเดิม) ใช้ตอนโหลดใหม่เองทุก 30 วินาที
  async function loadAppointments(selectedDate, silent = false) {
    if (!silent) {
      setLoading(true)
      setErrorMessage('')
      setReminderResult(null) // เปลี่ยนวัน → ล้างกล่องผลส่งเตือน
    }
    try {
      const data = await getAdminAppointments(selectedDate)
      // โหลดเงียบ ๆ เสร็จช้า แต่ผู้ใช้เปลี่ยนไปดูวันอื่นแล้ว → ทิ้งข้อมูลเก่า (ไม่งั้นตารางจะกลับไปเป็นวันเดิม)
      if (silent && data.date !== currentDateRef.current) return
      currentDateRef.current = data.date
      setDate(data.date)
      setAppointments(data.appointments)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // เปิดหน้ามาครั้งแรก → โหลดวันเปิดทำการถัดไป + ถาม server ว่าเปิดโหมดเดโมไหม
  // (ถามไม่สำเร็จ → ถือว่าไม่ใช่โหมดเดโม ไม่แสดงปุ่ม — หน้ารายการนัดยังใช้ได้ปกติ)
  useEffect(() => {
    loadAppointments('')
    getHealth()
      .then((data) => setDemo(data.demo === true))
      .catch(() => setDemo(false))
  }, [])

  // นาฬิกาเดินทุก 10 วินาที (หยุดเมื่อออกจากหน้า)
  useEffect(() => {
    const timer = setInterval(() => setNow(getNowMs()), 10000)
    return () => clearInterval(timer)
  }, [])

  // โหลดรายการใหม่เองทุก 30 วินาที (ผู้ใช้เลือก 2026-10-06)
  // → ถึงเวลานัดแล้วปุ่ม [ไม่มา] เปลี่ยนเป็นกรอบแดงเอง + เห็นนัดใหม่/นัดที่ถูกยกเลิกโดยไม่ต้องเปลี่ยนวันที่
  // เริ่มนับใหม่ทุกครั้งที่เปลี่ยนวันที่ และหยุดเมื่อออกจากหน้า
  useEffect(() => {
    if (!date) return
    const timer = setInterval(() => loadAppointments(date, true), 30000)
    return () => clearInterval(timer)
  }, [date])

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

  // กดปุ่มส่งเตือน (D1) → กล่องเขียว (ส่งแล้ว) / แดง (LINE ไม่รับ) เหนือตาราง
  async function handleSendReminder(item, reminder) {
    const key = `${item.appointmentId}-${reminder.type}`
    const name = `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || 'ผู้ป่วย'
    setBusyReminder(key)
    setErrorMessage('')
    setReminderResult(null)
    try {
      const result = await sendDemoReminder(item.appointmentId, reminder.type)
      setReminderResult(
        result.sent
          ? { ok: true, text: `ส่งการ์ด "${reminder.title}" ให้ ${name} (${formatThaiDateShort(item.date)} ${item.startTime}) แล้ว` }
          : { ok: false, text: `ส่งการ์ด "${reminder.title}" ให้ ${name} ไม่สำเร็จ — LINE ไม่รับข้อความ · บันทึกเป็น failed แล้ว` }
      )
    } catch (error) {
      setErrorMessage(error.message) // เช่น นัดถูกยกเลิกไปแล้ว (409) → โหลดใหม่ให้ตรงกับ server
      loadAppointments(date)
    } finally {
      setBusyReminder(null)
    }
  }

  // ปุ่มในคอลัมน์ "ส่งเตือน (เดโม)" — เฉพาะนัดที่ยืนยันแล้ว (อื่น ๆ ขีด "—")
  function renderReminderButtons(item) {
    if (item.status !== 'booked') return <span className="text-staff-disabled">—</span>
    return (
      <div className="flex gap-1.5">
        {reminderTypes.map((reminder) => {
          const busy = busyReminder === `${item.appointmentId}-${reminder.type}`
          return (
            <button
              key={reminder.type}
              type="button"
              disabled={busyReminder !== null}
              onClick={() => handleSendReminder(item, reminder)}
              className="h-[26px] rounded-md border border-staff-remind bg-staff-remind-soft px-2 text-[13px] whitespace-nowrap text-staff-remind hover:bg-orange-100 disabled:opacity-60"
            >
              {busy ? 'กำลังส่ง…' : reminder.button}
            </button>
          )
        })}
      </div>
    )
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl leading-7 font-bold text-black">ดูรายการนัดหมาย</h1>
        {/* ป้ายโหมดเดโม (P5ก) — เวลาเดโมของ server เดินตามนาฬิกาในหน้านี้ */}
        {demo && (
          <span className="rounded-full border border-staff-remind-border bg-staff-remind-soft px-2.5 py-0.5 text-xs text-staff-remind">
            โหมดเดโม · เวลา {formatDemoTime(now)}
          </span>
        )}
      </div>

      {/* แถวเลือกวันที่ */}
      <div className="mt-2 flex items-center gap-6">
        <span className="text-xl font-medium text-black">วันที่</span>
        {/* กล่องเลือกวันที่ (ไฟล์ components/DatePickerBox.jsx ใช้ร่วมกับหน้าจัดการเวลา)
            เลือกวันใหม่ → โหลดรายการนัดของวันนั้น */}
        <DatePickerBox value={date} onChange={loadAppointments} />
      </div>

      {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
      {errorMessage && <p className="mt-3 text-sm text-staff-red">{errorMessage}</p>}

      {/* ผลการกดส่งเตือน (โหมดเดโม) */}
      {reminderResult && (
        <div
          className={`mt-2.5 rounded-lg border px-3 py-2 text-sm ${
            reminderResult.ok
              ? 'border-primary-light bg-primary-soft text-primary'
              : 'border-liff-red-border bg-liff-red-bg text-liff-red'
          }`}
        >
          {reminderResult.ok ? '✓ ' : '✕ '}
          {reminderResult.text}
        </div>
      )}

      {/* ตารางรายการนัด */}
      <div className="mt-3 overflow-hidden rounded-xl border border-staff-table-border bg-white">
        <table className="w-full table-fixed text-left text-[15px] text-black">
          {/* ความกว้างแต่ละคอลัมน์ (โหมดเดโมมี 8 คอลัมน์) */}
          <colgroup>
            {(demo ? DEMO_COLUMNS : NORMAL_COLUMNS).map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead className="bg-staff-table-head">
            <tr className="h-10">
              <th className="text-center font-medium">ลำดับ</th>
              <th className={`${demo ? 'pl-6' : 'pl-9'} font-medium`}>ชื่อผู้จอง</th>
              <th className="font-medium">เบอร์โทร</th>
              <th className="font-medium">วันที่</th>
              <th className="font-medium">เวลา</th>
              <th className="font-medium">สถานะ</th>
              <th className="pl-[5px] font-medium">จัดการ</th>
              {demo && <th className="font-medium">ส่งเตือน (เดโม)</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-staff-border">
            {loading ? (
              <tr className="h-10">
                <td colSpan={demo ? 8 : 7} className="text-center text-staff-subtle">
                  กำลังโหลด...
                </td>
              </tr>
            ) : appointments.length === 0 ? (
              <tr className="h-10">
                <td colSpan={demo ? 8 : 7} className="text-center text-staff-subtle">
                  ไม่มีนัดหมายในวันนี้
                </td>
              </tr>
            ) : (
              appointments.map((item, index) => (
                <tr key={item.appointmentId} className="h-10">
                  <td className="text-center">{index + 1}</td>
                  <td className={`truncate ${demo ? 'pl-6' : 'pl-9'}`}>
                    {/* ผู้ป่วยที่ถูกล้างข้อมูล (PDPA) server ส่งชื่อ/เบอร์เป็น null → แสดง "—" */}
                    {item.firstName || item.lastName ? `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() : '—'}
                  </td>
                  <td>{item.phone || '—'}</td>
                  <td>{formatThaiDateShort(item.date)}</td>
                  <td>{item.startTime}</td>
                  <td className={`font-medium ${statusLabels[item.status]?.color}`}>{statusLabels[item.status]?.text}</td>
                  <td>{renderAction(item)}</td>
                  {demo && <td>{renderReminderButtons(item)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
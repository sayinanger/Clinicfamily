import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom'
import {
  USE_MOCK,
  getBookingDays,
  getSlots,
  createHold,
  releaseHold,
  getMyAppointment,
  createAppointment,
  rescheduleAppointment,
  getNowMs,
} from '../../lib/api.js'
import { canCloseLiff, closeLiff } from '../../lib/liff.js'
import { formatThaiDateWeekdayShort, timeFromIso } from '../../lib/format.js'
import BookingCalendar from '../../components/BookingCalendar.jsx'
import { Popup, PopupTitle, PopupText, PopupBigTime, PopupButton } from '../../components/Popup.jsx'

// คำที่แสดงในคอลัมน์ "สถานะ" ตามค่า status จาก U5
// held_by_me (ฉันถือคิวนี้อยู่) แสดงเหมือน "ว่าง" และกดได้ — กดซ้ำ = ถือคิวเดิมต่อ
const STATUS_LABELS = {
  available: 'ว่าง',
  held_by_me: 'ว่าง',
  unavailable: 'ไม่ว่าง',
  too_late: 'หมดเวลาจอง',
}

// เพศ (ค่าจาก U1) → คำที่แสดงในป๊อปอัปยืนยัน
const GENDER_LABELS = { male: 'ชาย', female: 'หญิง', unspecified: 'ไม่ระบุ' }

// วินาทีที่เหลือ → '00 : 04 : 12' (ชั่วโมง : นาที : วินาที แบบ Figma)
function formatCountdown(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(' : ')
}

// หน้าจองคิว (/liff/booking) — Figma 275:184
// ขั้นตอน: เลือกวัน → กด [จองคิว] (ถือคิว 5 นาที + นับถอยหลัง) → ป๊อปอัปยืนยัน → [ยืนยัน] = จองสำเร็จ
//
// หน้าเลื่อนนัด (/liff/reschedule) ใช้ไฟล์นี้ด้วย — App.jsx ส่ง mode="reschedule" มา (ขั้น 7.5, Figma 279:240 / 279:338)
// ต่างจากหน้าจองคิวแค่: หัวข้อ "เลื่อนนัด", แถบ "นัดเดิม" ด้านบน, ปฏิทินมีวงกลมเส้นประที่วันนัดเดิม,
// ถือคิวแบบ purpose 'reschedule', ป๊อปอัปยืนยัน "จาก ... เป็น ...", กดยืนยันแล้วเรียก U11 แทน U9
export default function LiffBooking({ mode = 'book' }) {
  const { me } = useOutletContext() // ข้อมูลของฉันจาก LiffLayout (มีประวัติไว้แสดงในป๊อปอัป)
  const navigate = useNavigate()
  const isReschedule = mode === 'reschedule' // true = หน้าเลื่อนนัด
  const thisPagePath = isReschedule ? '/liff/reschedule' : '/liff/booking' // ใช้กับ ?next= ตอนพาไปกรอกประวัติ

  const [days, setDays] = useState([]) // วันที่เลือกได้ (U4)
  const [selectedDate, setSelectedDate] = useState('') // วันที่กำลังดู 'YYYY-MM-DD'
  const [slots, setSlots] = useState([]) // เวลาของวันที่เลือก (U5)
  const [loadingPage, setLoadingPage] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [errorMessage, setErrorMessage] = useState('') // ข้อความแดงเหนือตาราง
  const [busy, setBusy] = useState(false) // กำลังส่งคำขอ → กันกดซ้ำ
  

  const [hold, setHold] = useState(null) // คิวที่ถืออยู่ { slotId, date, startTime, holdExpiresAt } — null = ไม่ได้ถือ
  const [secondsLeft, setSecondsLeft] = useState(0) // เวลาที่เหลือ (วินาที)

  // ป๊อปอัปที่เปิดอยู่: null = ไม่มี, 'confirm' = ยืนยันการจอง, 'expired' = หมดเวลายืนยัน,
  // 'hasAppointment' = มีนัดอยู่แล้ว, 'success' = จองสำเร็จ
  const [popup, setPopup] = useState(null)
  const [existingAppointment, setExistingAppointment] = useState(null) // นัดเดิม (ป๊อปอัปมีนัดอยู่แล้ว / แถบนัดเดิมของหน้าเลื่อนนัด)
  const [bookedAppointment, setBookedAppointment] = useState(null) // นัดที่เพิ่งจอง/เลื่อน (ป๊อปอัปสำเร็จ)
  const [expiredStartTime, setExpiredStartTime] = useState('') // เวลาของคิวที่หมดเวลา (ป๊อปอัปหมดเวลา)

  // โหลดตารางเวลาของวันที่ระบุ
  async function loadSlots(date) {
    setLoadingSlots(true)
    try {
      const data = await getSlots(date)
      setSlots(data.slots)
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setLoadingSlots(false)
    }
  }

  // เปิดหน้า: ดูว่ามีนัดอยู่แล้วไหม (U8) + วันที่เลือกได้ (U4) พร้อมกัน
  useEffect(() => {
    if (!me.profileCompleted) return // ยังไม่มีประวัติ → ด้านล่างจะพาไปหน้าประวัติ
    async function start() {
      try {
        const [appointmentData, daysData] = await Promise.all([getMyAppointment(), getBookingDays()])
        // หน้าเลื่อนนัด: ไม่มีนัด หรือเลยเวลาแก้ไขแล้ว → กลับไปหน้ายกเลิก/เลื่อนนัด (หน้านั้นแสดงข้อความให้เอง)
        if (isReschedule && !appointmentData.appointment?.canChange) {
          navigate('/liff/appointment', { replace: true })
          return
        }
        setDays(daysData.days)
        // เริ่มที่วันแรกที่ยังมีคิวว่าง (ถ้าเต็มทุกวัน → วันแรก)
        const firstBookable = daysData.days.find((day) => day.availableCount > 0) || daysData.days[0]
        if (firstBookable) setSelectedDate(firstBookable.date)
        if (isReschedule) {
          // หน้าเลื่อนนัด: จำนัดเดิมไว้แสดงในแถบ "นัดเดิม" และป๊อปอัปยืนยัน
          setExistingAppointment(appointmentData.appointment)
        } else if (appointmentData.appointment) {
          // หน้าจองคิว: มีนัดอยู่แล้ว → ขึ้นป๊อปอัปทันที (ผู้ใช้เลือก 2026-10-02)
          setExistingAppointment(appointmentData.appointment)
          setPopup('hasAppointment')
        }
      } catch (err) {
        setErrorMessage(err.message)
      } finally {
        setLoadingPage(false)
      }
    }
    start()
  }, [me.profileCompleted, isReschedule, navigate])

  // เปลี่ยนวันที่ → โหลดตารางของวันนั้น
  useEffect(() => {
    if (selectedDate) loadSlots(selectedDate)
  }, [selectedDate])

  // นับถอยหลังทุก 1 วินาที ตอนถือคิวอยู่ (เทียบกับ holdExpiresAt จาก server)
  useEffect(() => {
    if (!hold) return
    function tick() {
      const left = Math.max(0, Math.ceil((Date.parse(hold.holdExpiresAt) - getNowMs()) / 1000))
      setSecondsLeft(left)
      if (left === 0) {
        // หมดเวลา → ปิดป๊อปอัปยืนยัน แล้วเปิดป๊อปอัป "หมดเวลายืนยันการจอง"
        setExpiredStartTime(hold.startTime)
        setHold(null)
        setPopup('expired')
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer) // หยุดนับเมื่อ hold เปลี่ยน/ออกจากหน้า
  }, [hold])

  // ยังไม่กรอกประวัติ → ไปกรอกก่อน บันทึกแล้วกลับมาหน้านี้ (?next=)
  if (!me.profileCompleted) {
    return <Navigate to={`/liff/profile?next=${thisPagePath}`} replace />
  }

  // กดปุ่ม [จองคิว] ในตาราง → ถือคิว (U6)
  async function handleSelectSlot(slot) {
    setErrorMessage('')
    setBusy(true)
    try {
      const data = await createHold(slot.slotId, isReschedule ? 'reschedule' : 'book')
      setHold(data.hold)
      setPopup('confirm')
    } catch (err) {
      if (err.code === 'HAS_ACTIVE_APPOINTMENT') {
        setExistingAppointment(err.data?.appointment)
        setPopup('hasAppointment')
      } else if (err.code === 'PROFILE_REQUIRED') {
        navigate(`/liff/profile?next=${thisPagePath}`)
      } else if (err.code === 'NO_APPOINTMENT_TO_RESCHEDULE' || err.code === 'TOO_LATE_TO_CHANGE') {
        // หน้าเลื่อนนัด: ไม่มีนัดแล้ว / นัดเดิมใกล้เส้นตายจนเลื่อนไม่ทัน → กลับหน้ายกเลิก/เลื่อนนัด
        // (หน้านั้นแสดง "คุณยังไม่มีนัด" หรือกล่องแดงพร้อมเบอร์คลินิกให้เอง — ผู้ใช้เลือก 2026-10-04)
        navigate('/liff/appointment', { replace: true })
      } else {
        // เช่น คิวมีคนจองไปก่อน / หมดเวลาจอง → ข้อความแดง + โหลดตารางใหม่
        setErrorMessage(err.message)
        loadSlots(selectedDate)
      }
    } finally {
      setBusy(false)
    }
  }

  // ป๊อปอัปยืนยัน: กด [ยืนยัน] → จอง (U9) / หน้าเลื่อนนัด → เลื่อนนัด (U11)
  async function handleConfirm() {
    setBusy(true)
    try {
      const data = isReschedule ? await rescheduleAppointment(hold.slotId) : await createAppointment(hold.slotId)
      setHold(null)
      setBookedAppointment(data.appointment)
      setPopup('success')
    } catch (err) {
      if (err.code === 'HOLD_EXPIRED') {
        setExpiredStartTime(hold.startTime)
        setHold(null)
        setPopup('expired')
      } else if (err.code === 'HAS_ACTIVE_APPOINTMENT') {
        setHold(null)
        setExistingAppointment(err.data?.appointment)
        setPopup('hasAppointment')
      } else {
        // error อื่น → ปล่อยคิว ปิดป๊อปอัป แสดงข้อความแดง แล้วโหลดตารางใหม่
        await releaseHold().catch(() => {})
        setHold(null)
        setPopup(null)
        setErrorMessage(err.message)
        loadSlots(selectedDate)
      }
    } finally {
      setBusy(false)
    }
  }

  // ป๊อปอัปยืนยัน: กด [ยกเลิก] → ปล่อยคิว (U7)
  async function handleCancelHold() {
    setBusy(true)
    await releaseHold().catch(() => {}) // ปล่อยไม่สำเร็จก็ไม่เป็นไร (server ปล่อยเองเมื่อครบ 5 นาที)
    setHold(null)
    setPopup(null)
    setBusy(false)
    loadSlots(selectedDate)
  }

  // ป๊อปอัปหมดเวลา: กด [ตกลง] → โหลดตารางใหม่ให้เลือกเวลาใหม่
  function handleExpiredOk() {
    setPopup(null)
    loadSlots(selectedDate)
  }

  // ป๊อปอัปจองสำเร็จ / เลื่อนนัดสำเร็จ: กด [ปิด]
  // ในแอป LINE = ปิดหน้าต่าง LIFF / ทดสอบบนเบราว์เซอร์ (ข้อมูลปลอม) = กลับเมนูทดสอบ
  // เปิดในเบราว์เซอร์ธรรมดา (ปิดแท็บเองไม่ได้) = ไปหน้ายกเลิก/เลื่อนนัด ให้เห็นนัดล่าสุดของตัวเอง (ผู้ใช้เลือก 2026-10-06)
  function handleSuccessClose() {
    if (USE_MOCK) {
      navigate('/liff')
    } else if (canCloseLiff()) {
      closeLiff()
    } else {
      navigate('/liff/appointment', { replace: true })
    }
  }

  // กล่องส้ม: วันที่เลือกมีคิวว่างที่เหลือไม่ถึง 3 ชม. (จองแล้วจะไม่มีข้อความเตือนก่อนนัด)
  const hasShortNoticeSlot = slots.some((slot) => slot.status === 'available' && slot.shortNotice)

  // ป๊อปอัปยืนยัน: เส้นตายยกเลิก/เลื่อนมาถึงก่อนหมดเวลายืนยัน → ยืนยันแล้วจะแก้นัดไม่ได้เลย → กล่องแดง
  const cannotChangeAfterBooking = hold && Date.parse(hold.changeDeadline) <= Date.parse(hold.holdExpiresAt)

  if (loadingPage) {
    return <p className="pt-12 text-center text-[18px] text-muted">กำลังโหลด...</p>
  }

  return (
    <div className="px-[31px] pt-12 pb-10">
      <h1 className="text-center text-[29px] font-semibold text-black">{isReschedule ? 'เลื่อนนัด' : 'จองคิว'}</h1>

      {/* แถบนัดเดิม — หน้าเลื่อนนัดเท่านั้น (Figma 279:240) */}
      {isReschedule && existingAppointment && (
        <div className="mt-5 rounded-[5px] border-[1.5px] border-primary-light bg-white px-2 py-1.5 text-center text-[16px] font-medium text-primary">
          นัดเดิม : {formatThaiDateWeekdayShort(existingAppointment.date)} เวลา {existingAppointment.startTime} น.
        </div>
      )}

      {/* ===== เลือกวันที่ ===== */}
      <h2 className={`${isReschedule ? 'mt-4' : 'mt-8'} text-[21px] font-semibold text-black`}>เลือกวันที่</h2>
      {/* ปฏิทิน — กดวันที่แล้วตารางข้างล่างเปลี่ยนทันที (แบบ ก ที่ผู้ใช้เลือก 2026-10-03 แทนแถบ 4 วันใน Figma) */}
      <div className="mt-1">
        {selectedDate ? (
          <BookingCalendar
            days={days}
            selectedDate={selectedDate}
            originalDate={isReschedule ? existingAppointment?.date : undefined}
            onSelect={(date) => {
              setErrorMessage('')
              setSelectedDate(date)
            }}
          />
        ) : (
          <p className="rounded-[5px] border border-primary bg-white p-3 text-center text-[16px] text-muted">
            ไม่มีวันที่เปิดให้จอง
          </p>
        )}
      </div>
      <p className="mt-1 text-[14px] text-muted">จองล่วงหน้าได้ไม่เกิน 14 วัน และต้องจองก่อนเวลานัดอย่างน้อย 10 นาที</p>

      {/* กล่องส้ม — นัดกระชั้น (กฎเวลาชุดที่ 2, ไม่มีใน Figma) */}
      {hasShortNoticeSlot && !loadingSlots && (
        <div className="mt-2 rounded-[5px] border border-liff-orange-border bg-liff-orange-bg px-3 py-2 text-[15px] text-liff-orange">
          คิวที่เหลือไม่ถึง 3 ชั่วโมงจะไม่มีข้อความเตือนก่อนนัด
        </div>
      )}

      {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
      {errorMessage && (
        <div className="mt-3 rounded-[5px] border border-liff-red-border bg-liff-red-bg p-3 text-[16px] text-liff-red">
          {errorMessage}
        </div>
      )}

      {/* ===== ตารางเวลา ===== */}
      <div className="mt-2 overflow-hidden rounded-[5px] border border-liff-table-line bg-white">
        <table className="w-full table-fixed text-center">
          <thead>
            <tr className="h-[34px] bg-primary text-[17px] font-semibold text-white">
              {/* ความกว้างคอลัมน์ตามสัดส่วน Figma 94 : 137 : 147 */}
              <th className="w-[24.9%] font-semibold">เวลา</th>
              <th className="w-[36.2%] font-semibold">สถานะ</th>
              <th className="w-[38.9%] font-semibold">จองคิว</th>
            </tr>
          </thead>
          <tbody>
            {loadingSlots ? (
              <tr>
                <td colSpan={3} className="h-[76px] text-[16px] text-muted">
                  กำลังโหลด...
                </td>
              </tr>
            ) : slots.length === 0 ? (
              <tr>
                <td colSpan={3} className="h-[76px] text-[16px] text-muted">
                  ไม่มีเวลาให้จองในวันนี้
                </td>
              </tr>
            ) : (
              slots.map((slot) => {
                const canBook = slot.status === 'available' || slot.status === 'held_by_me'
                return (
                  <tr key={slot.slotId} className="h-[38px] border-t border-liff-table-line first:border-t-0">
                    <td className="text-[17px] font-semibold text-black">{slot.startTime}</td>
                    <td
                      className={`border-l border-liff-table-line text-[16px] font-semibold ${
                        canBook ? 'text-primary' : 'text-muted'
                      }`}
                    >
                      {STATUS_LABELS[slot.status]}
                    </td>
                    <td className="border-l border-liff-table-line px-2">
                      <button
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        disabled={!canBook || busy}
                        className={`h-[25px] w-[130px] max-w-full rounded-[10px] text-[15px] font-semibold ${
                          canBook ? 'bg-primary-light text-primary' : 'bg-liff-gray-button text-muted'
                        }`}
                      >
                        จองคิว
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== กล่องนับถอยหลัง — แสดงเฉพาะตอนถือคิวอยู่ (ผู้ใช้เลือก 2026-10-02) ===== */}
      {hold && (
        <div className="mt-5 flex flex-col items-center justify-center rounded-[5px] border border-primary-light bg-white py-2.5">
          <p className="text-[14px] font-semibold text-primary">เวลาที่เหลือในการจอง</p>
          <p className="text-[29px] leading-tight font-semibold text-primary">{formatCountdown(secondsLeft)}</p>
          {/* เวลาที่ต้องยืนยันให้ทัน (กฎเวลาชุดที่ 2) */}
          <p className="text-[14px] text-muted">กรุณายืนยันก่อน {timeFromIso(hold.holdExpiresAt)} น.</p>
        </div>
      )}

      {/* ===== ป๊อปอัป ===== */}

      {/* ยืนยันการจอง (Figma 278:198) / ยืนยันการเลื่อนนัด (Figma 279:338) */}
      {popup === 'confirm' && hold && (
        <Popup>
          {isReschedule ? (
            <>
              <PopupTitle>ยืนยันการเลื่อนนัด</PopupTitle>
              {/* นัดเดิม (ขีดฆ่าเวลา) → นัดใหม่ */}
              <p className="w-full text-[16px] leading-[1.4] text-muted">
                จาก : {formatThaiDateWeekdayShort(existingAppointment.date)} เวลา{' '}
                <span className="line-through">{existingAppointment.startTime} น.</span>
              </p>
              <PopupText>เป็น : {formatThaiDateWeekdayShort(hold.date)}</PopupText>
              {/* เวลาใหม่ตัวใหญ่ที่สุดในการ์ด (เหมือนป๊อปอัปจองคิว) */}
              <PopupBigTime>เวลา {hold.startTime} น.</PopupBigTime>
            </>
          ) : (
            <>
              <PopupTitle>ยืนยันการจอง</PopupTitle>
              <PopupText>{formatThaiDateWeekdayShort(hold.date)}</PopupText>
              {/* เวลานัดตัวใหญ่ที่สุดในการ์ด (กฎเวลาชุดที่ 2 — กันกดผิดเวลา) */}
              <PopupBigTime>เวลา {hold.startTime} น.</PopupBigTime>
              <PopupText>
                ชื่อ : {me.profile.firstName} {me.profile.lastName}
              </PopupText>
              <PopupText>{`เพศ : ${GENDER_LABELS[me.profile.gender]}    อายุ : ${me.profile.age} ปี`}</PopupText>
              <PopupText>เบอร์โทร : {me.profile.phone}</PopupText>
            </>
          )}
          {/* เส้นตายยกเลิก/เลื่อน — ถ้าเลยตั้งแต่ตอนยืนยัน แสดงกล่องแดงแทน */}
          {cannotChangeAfterBooking ? (
            <div className="w-full rounded-[5px] border border-liff-red-border bg-liff-red-bg p-2.5 text-[15px] leading-[1.4] text-liff-red">
              นัดนี้ยกเลิกหรือเลื่อนไม่ได้แล้ว กรุณาตรวจเวลาให้ถูกต้องก่อนยืนยัน
            </div>
          ) : (
            <p className="w-full text-[16px] leading-[1.4] text-black">
              ยกเลิกหรือเลื่อนได้ก่อน {timeFromIso(hold.changeDeadline)} น.
            </p>
          )}
          {/* นัดกระชั้น (เหลือไม่ถึง 3 ชม.) */}
          {hold.shortNotice && (
            <p className="w-full text-[15px] leading-[1.4] text-liff-orange">นัดนี้จะไม่มีข้อความเตือนก่อนนัด</p>
          )}
          <div className="flex gap-4 pt-[10px]">
            <PopupButton onClick={handleConfirm} disabled={busy}>
              ยืนยัน
            </PopupButton>
            <PopupButton variant="red" onClick={handleCancelHold} disabled={busy}>
              ยกเลิก
            </PopupButton>
          </div>
        </Popup>
      )}

      {/* หมดเวลายืนยันการจอง (Figma 278:307) */}
      {popup === 'expired' && (
        <Popup>
          <PopupTitle color="text-liff-red">{isReschedule ? 'หมดเวลายืนยันการเลื่อนนัด' : 'หมดเวลายืนยันการจอง'}</PopupTitle>
          <PopupText>คิว {expiredStartTime} น. ถูกปล่อยให้ผู้อื่นจองได้แล้ว</PopupText>
          {/* หน้าเลื่อนนัด: บอกให้มั่นใจว่านัดเดิมยังอยู่ (UC5: hold ใหม่หมดเวลา → นัดเดิมไม่เปลี่ยน) */}
          {isReschedule && <PopupText>นัดเดิมของคุณยังไม่เปลี่ยน</PopupText>}
          <PopupText>กรุณาเลือกเวลาใหม่อีกครั้ง</PopupText>
          <div className="pt-[10px]">
            <PopupButton onClick={handleExpiredOk}>ตกลง</PopupButton>
          </div>
        </Popup>
      )}

      {/* คุณมีนัดอยู่แล้ว (Figma 278:411) — [เลื่อนนัด] ไปหน้าเลื่อนนัดเลย / [ยกเลิกนัด] ไปหน้ายกเลิก/เลื่อนนัด (ขั้น 7.5) */}
      {/* กากบาท ✕ มุมขวาบน — ไม่มีใน Figma (ผู้ใช้สั่งเพิ่ม 2026-10-02): ปิดป๊อปอัปแล้วดูตารางเวลาต่อได้ */}
      {popup === 'hasAppointment' && existingAppointment && (
        <Popup onClose={() => setPopup(null)}>
          <PopupTitle>คุณมีนัดอยู่แล้ว</PopupTitle>
          <PopupText>
            {formatThaiDateWeekdayShort(existingAppointment.date)} เวลา {existingAppointment.startTime} น.
          </PopupText>
          <PopupText>จองได้ครั้งละ 1 นัด หากต้องการเปลี่ยน กรุณาเลื่อนหรือยกเลิกนัดเดิม</PopupText>
          <div className="flex gap-4 pt-[10px]">
            <PopupButton onClick={() => navigate('/liff/reschedule')}>เลื่อนนัด</PopupButton>
            <PopupButton variant="red" onClick={() => navigate('/liff/appointment')}>
              ยกเลิกนัด
            </PopupButton>
          </div>
        </Popup>
      )}

      {/* จองสำเร็จ (ไม่มีใน Figma v2 — ออกแบบตามสไตล์ป๊อปอัปอื่น) */}
      {popup === 'success' && bookedAppointment && !isReschedule && (
        <Popup>
          <PopupTitle color="text-liff-success">จองสำเร็จ</PopupTitle>
          <PopupText>{formatThaiDateWeekdayShort(bookedAppointment.date)}</PopupText>
          <PopupText>เวลา {bookedAppointment.startTime} น.</PopupText>
          <PopupText>ระบบส่งข้อความยืนยันทาง LINE แล้ว</PopupText>
          <div className="pt-[10px]">
            <PopupButton onClick={handleSuccessClose}>ปิด</PopupButton>
          </div>
        </Popup>
      )}

      {/* เลื่อนนัดสำเร็จ (ไม่มีใน Figma — ขั้น 7.5 ตามตัวอย่างจอ ⑧ ที่ผู้ใช้ดูแล้ว) */}
      {popup === 'success' && bookedAppointment && isReschedule && (
        <Popup>
          <PopupTitle color="text-liff-success">เลื่อนนัดสำเร็จ</PopupTitle>
          <PopupText>นัดใหม่ : {formatThaiDateWeekdayShort(bookedAppointment.date)}</PopupText>
          <PopupBigTime>เวลา {bookedAppointment.startTime} น.</PopupBigTime>
          <p className="w-full text-[16px] leading-[1.4] text-[#555555]">ระบบส่งข้อความยืนยันการเลื่อนนัดทาง LINE แล้ว</p>
          <div className="pt-[10px]">
            <PopupButton onClick={handleSuccessClose}>ปิด</PopupButton>
          </div>
        </Popup>
      )}
    </div>
  )
}
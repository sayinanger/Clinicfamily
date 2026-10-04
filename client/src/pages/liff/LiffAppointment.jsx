import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { USE_MOCK, getMyAppointment, cancelAppointment } from '../../lib/api.js'
import { closeLiff } from '../../lib/liff.js'
import { formatPhone, formatThaiDateWeekdayShort, timeFromIso } from '../../lib/format.js'
import { Popup, PopupTitle, PopupText, PopupBigTime, PopupButton } from '../../components/Popup.jsx'

// เพศ (ค่าจาก U1) → คำที่แสดงในการ์ด
const GENDER_LABELS = { male: 'ชาย', female: 'หญิง', unspecified: 'ไม่ระบุ' }

// 1 บรรทัดในการ์ดนัด: "หัวข้อ : ค่า"
function CardRow({ label, children }) {
  return (
    <p>
      <span className="font-semibold">{label}</span> : {children}
    </p>
  )
}

// ตัวเลือกแบบวงกลม (ยกเลิกนัด / เลื่อนนัด) — Figma 279:446
// selected = เลือกอยู่ (วงกลมขอบหนาสีเขียว), disabled = เลยเวลาแก้ไข (สีเทา กดไม่ได้ — Figma 279:519)
function ChoiceOption({ label, selected, disabled, onClick }) {
  let boxClass = 'border-primary-light bg-white text-black' // ปกติ
  let dotClass = 'border-[1.5px] border-black' // วงกลมว่าง
  if (disabled) {
    boxClass = 'border-[#E2E2E2] bg-[#F3F3F3] text-[#AAAAAA]'
    dotClass = 'border-[1.5px] border-[#BBBBBB]'
  } else if (selected) {
    boxClass = 'border-primary bg-white text-black'
    dotClass = 'border-[6px] border-primary'
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`mt-3 flex h-[52px] w-full items-center gap-3 rounded-[8px] border-[1.5px] px-4 text-left text-[19px] font-medium ${boxClass}`}
    >
      <span className={`h-5 w-5 flex-none rounded-full ${dotClass}`} />
      {label}
    </button>
  )
}

// ออกจากหน้า: ในแอป LINE = ปิดหน้าต่าง LIFF / ทดสอบบนเบราว์เซอร์ (ข้อมูลปลอม) = กลับเมนูทดสอบ
function useLeavePage() {
  const navigate = useNavigate()
  return () => {
    if (USE_MOCK) {
      navigate('/liff')
    } else {
      closeLiff()
    }
  }
}

// หน้ายกเลิก/เลื่อนนัด (/liff/appointment) — Figma 279:446 (ปกติ) / 279:519 (เลยเวลาแก้ไข)
// ขั้นตอน: ดูนัด → เลือก "ยกเลิกนัด" หรือ "เลื่อนนัด" → [ยืนยัน]
//   ยกเลิกนัด → ป๊อปอัปถามซ้ำ → [ยืนยันยกเลิก] = ยกเลิก (U10) → ป๊อปอัปยกเลิกแล้ว
//   เลื่อนนัด → ป๊อปอัปถามซ้ำ → [เลือกเวลาใหม่] = ไปหน้าเลื่อนนัด /liff/reschedule (หน้าจองคิวโหมดเลื่อน)
// เลยเส้นตาย (15 นาทีก่อนนัด) → ตัวเลือกเป็นสีเทา + กล่องแดงให้โทรแจ้งคลินิก
export default function LiffAppointment() {
  const { me } = useOutletContext() // ข้อมูลของฉันจาก LiffLayout (ชื่อ/เพศ/อายุ แสดงในการ์ด)
  const navigate = useNavigate()
  const leavePage = useLeavePage()

  const [loading, setLoading] = useState(true)
  const [appointment, setAppointment] = useState(null) // นัดที่ใช้งานอยู่ (U8) — null = ไม่มีนัด
  const [clinicPhone, setClinicPhone] = useState('') // เบอร์คลินิก (U8) ใช้ในกล่องแดง
  const [choice, setChoice] = useState('') // ตัวเลือกที่กด: '' = ยังไม่เลือก, 'cancel', 'reschedule'
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false) // กำลังส่งคำขอ → กันกดซ้ำ

  // ป๊อปอัปที่เปิดอยู่: null = ไม่มี, 'confirmCancel' = ถามซ้ำก่อนยกเลิก, 'cancelled' = ยกเลิกแล้ว,
  // 'confirmReschedule' = ถามซ้ำก่อนไปหน้าเลื่อนนัด
  const [popup, setPopup] = useState(null)
  const [cancelledAppointment, setCancelledAppointment] = useState(null) // นัดที่เพิ่งยกเลิก (ป๊อปอัปยกเลิกแล้ว)

  // โหลดนัดของฉัน (U8)
  async function loadAppointment() {
    try {
      const data = await getMyAppointment()
      setAppointment(data.appointment)
      setClinicPhone(data.clinicPhone)
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  // เปิดหน้า → โหลดนัด
  useEffect(() => {
    loadAppointment()
  }, [])

  // กด [ยืนยัน] ด้านล่าง
  function handleConfirmChoice() {
    setErrorMessage('')
    if (choice === 'cancel') {
      setPopup('confirmCancel') // ถามซ้ำก่อน (ผู้ใช้เลือก 2026-10-04)
    } else if (choice === 'reschedule') {
      setPopup('confirmReschedule') // ถามซ้ำก่อน กันกดผิด (ผู้ใช้สั่ง 2026-10-04 — แบบ ก)
    }
  }

  // ป๊อปอัปถามซ้ำ: กด [ยืนยันยกเลิก] → ยกเลิกนัด (U10)
  async function handleCancelAppointment() {
    setBusy(true)
    try {
      const data = await cancelAppointment()
      setCancelledAppointment(data.appointment)
      setPopup('cancelled')
    } catch (err) {
      // เช่น เปิดหน้าค้างไว้จนเลยเส้นตาย (TOO_LATE_TO_CHANGE) → ข้อความแดง + โหลดนัดใหม่ (จะเห็นกล่องแดงเลยเวลา)
      setPopup(null)
      setChoice('')
      setErrorMessage(err.message)
      loadAppointment()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="pt-12 text-center text-[18px] text-muted">กำลังโหลด...</p>
  }

  // ป๊อปอัปยกเลิกแล้ว — แสดงแม้นัดจะหายไปแล้ว (ต้องอยู่ก่อนเช็ก "ไม่มีนัด")
  const cancelledPopup = popup === 'cancelled' && cancelledAppointment && (
    <Popup>
      <PopupTitle color="text-liff-success">ยกเลิกนัดแล้ว</PopupTitle>
      <PopupText>
        นัด{formatThaiDateWeekdayShort(cancelledAppointment.date)} เวลา {cancelledAppointment.startTime} น. ถูกยกเลิกแล้ว
      </PopupText>
      <p className="w-full text-[16px] leading-[1.4] text-[#555555]">ระบบส่งข้อความยืนยันการยกเลิกทาง LINE แล้ว</p>
      <div className="pt-[10px]">
        <PopupButton onClick={leavePage}>ปิด</PopupButton>
      </div>
    </Popup>
  )

  // ===== ไม่มีนัด (ไม่มีใน Figma — ตามตัวอย่างจอ ⑤ ที่ผู้ใช้เลือก) =====
  if (!appointment && popup !== 'cancelled') {
    return (
      <div className="px-[31px] pt-12 pb-10">
        <h1 className="text-center text-[29px] font-semibold text-black">ยกเลิก/เลื่อนนัด</h1>
        {errorMessage && (
          <div className="mt-6 rounded-[5px] border border-liff-red-border bg-liff-red-bg p-3 text-[16px] text-liff-red">
            {errorMessage}
          </div>
        )}
        <div className="mt-6 rounded-[8px] bg-white px-4 py-7 text-center text-[19px] text-[#444444]">คุณยังไม่มีนัด</div>
        <Link
          to="/liff/booking"
          className="mt-6 flex h-[60px] w-full items-center justify-center rounded-[5px] bg-primary text-[23px] font-semibold text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)]"
        >
          จองคิว
        </Link>
      </div>
    )
  }

  // นัดที่จะแสดงในการ์ด (หลังยกเลิกแล้ว ใช้นัดที่เพิ่งยกเลิกแสดงไว้ข้างหลังป๊อปอัป)
  const shownAppointment = appointment || cancelledAppointment
  const canChange = appointment?.canChange ?? false
  const deadlineText = timeFromIso(shownAppointment.changeDeadline)
  const profile = me.profile // มีแน่นอน เพราะต้องกรอกประวัติก่อนจอง

  return (
    <div className="px-[31px] pt-12 pb-10">
      <h1 className="text-center text-[29px] font-semibold text-black">ยกเลิก/เลื่อนนัด</h1>

      {/* การ์ดนัด (Figma 279:446) */}
      <div className="mt-6 rounded-[8px] border border-[#99AAAA] bg-white px-4 py-3 text-[18px] leading-[2] text-black">
        <CardRow label="ชื่อ">
          {profile?.firstName} {profile?.lastName}
        </CardRow>
        <CardRow label="เพศ">{GENDER_LABELS[profile?.gender] || '-'}</CardRow>
        <CardRow label="อายุ">{profile?.age} ปี</CardRow>
        <CardRow label="สถานะ">
          <span className="text-liff-success">ยืนยันการจองเรียบร้อย</span>
        </CardRow>
        <CardRow label="วันที่จอง">{formatThaiDateWeekdayShort(shownAppointment.date)}</CardRow>
        <CardRow label="เวลาที่จอง">{shownAppointment.startTime} น.</CardRow>
      </div>

      {/* เส้นตายยกเลิก/เลื่อน — แสดงตลอดเมื่อยังแก้ได้ (กฎเวลาชุดที่ 2) */}
      {canChange && (
        <p className="mt-3 text-center text-[16px] font-medium text-primary">ยกเลิกหรือเลื่อนได้ก่อน {deadlineText} น.</p>
      )}

      {/* ตัวเลือก — เริ่มต้นยังไม่เลือก (กันกดยกเลิกโดยไม่ตั้งใจ) */}
      <div role="radiogroup" className={canChange ? 'mt-1' : 'mt-3'}>
        <ChoiceOption
          label="ยกเลิกนัด"
          selected={choice === 'cancel'}
          disabled={!canChange}
          onClick={() => setChoice('cancel')}
        />
        <ChoiceOption
          label="เลื่อนนัด"
          selected={choice === 'reschedule'}
          disabled={!canChange}
          onClick={() => setChoice('reschedule')}
        />
      </div>

      {/* เลยเวลาแก้ไข (Figma 279:519) — ข้อความตามกฎเวลาชุดที่ 2 */}
      {!canChange && (
        <div className="mt-4 rounded-[8px] border border-liff-red-border bg-liff-red-bg p-3 text-center text-[15px] leading-[1.5] text-liff-red">
          ยกเลิกหรือเลื่อนนัดได้ก่อน {deadlineText} น. เท่านั้น
          <br />
          {/* whitespace-nowrap = ไม่ให้ตัดบรรทัดกลางคำ (จอแคบ → ขึ้นบรรทัดใหม่ก่อนคำว่า "โทร") */}
          <span className="whitespace-nowrap">หากมาไม่ได้ กรุณาโทรแจ้งคลินิก</span>
          {clinicPhone && <span className="whitespace-nowrap"> โทร {formatPhone(clinicPhone)}</span>}
        </div>
      )}

      {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
      {errorMessage && (
        <div className="mt-4 rounded-[5px] border border-liff-red-border bg-liff-red-bg p-3 text-[16px] text-liff-red">
          {errorMessage}
        </div>
      )}

      {/* ปุ่มล่าง: [ยืนยัน] + [ปิด] (Figma เป็น [ยกเลิก] — เปลี่ยนเป็น [ปิด] ไม่ให้สับสนกับ "ยกเลิกนัด" ผู้ใช้เลือก 2026-10-04) */}
      <div className="mt-7 flex justify-center gap-6">
        <button
          type="button"
          onClick={handleConfirmChoice}
          disabled={!canChange || !choice || busy}
          className="min-w-[110px] rounded-[6px] bg-primary-light px-[22px] py-[8px] text-[18px] font-semibold text-primary shadow-[0_4px_4px_rgba(0,0,0,0.15)] disabled:bg-[#DDDDDD] disabled:text-[#999999] disabled:shadow-none"
        >
          ยืนยัน
        </button>
        <button
          type="button"
          onClick={leavePage}
          className="min-w-[110px] rounded-[6px] border-[1.5px] border-[#CCCCCC] bg-white px-[22px] py-[8px] text-[18px] font-semibold text-[#555555]"
        >
          ปิด
        </button>
      </div>

      {/* ===== ป๊อปอัป ===== */}

      {/* ถามซ้ำก่อนยกเลิก (ไม่มีใน Figma — ตามตัวอย่างจอ ②) */}
      {popup === 'confirmCancel' && appointment && (
        <Popup>
          <PopupTitle>ยืนยันการยกเลิกนัด</PopupTitle>
          <PopupText>{formatThaiDateWeekdayShort(appointment.date)}</PopupText>
          <PopupBigTime>เวลา {appointment.startTime} น.</PopupBigTime>
          <p className="w-full text-[16px] leading-[1.4] text-[#555555]">เมื่อยกเลิกแล้ว คิวนี้จะเปิดให้ผู้อื่นจองทันที</p>
          <div className="flex gap-4 pt-[10px]">
            <PopupButton variant="red" onClick={handleCancelAppointment} disabled={busy}>
              ยืนยันยกเลิก
            </PopupButton>
            <PopupButton variant="gray" onClick={() => setPopup(null)} disabled={busy}>
              ไม่ยกเลิก
            </PopupButton>
          </div>
        </Popup>
      )}

      {/* ถามซ้ำก่อนเลื่อนนัด (ไม่มีใน Figma — ผู้ใช้เลือกแบบ ก 2026-10-04)
          ตอนนี้นัดยังไม่เปลี่ยน — เปลี่ยนจริงตอนกดยืนยันในหน้าเลื่อนนัด */}
      {popup === 'confirmReschedule' && appointment && (
        <Popup>
          <PopupTitle>ต้องการเลื่อนนัดนี้?</PopupTitle>
          <PopupText>{formatThaiDateWeekdayShort(appointment.date)}</PopupText>
          <PopupBigTime>เวลา {appointment.startTime} น.</PopupBigTime>
          <p className="w-full text-[16px] leading-[1.4] text-[#555555]">นัดเดิมยังอยู่จนกว่าคุณจะยืนยันเวลาใหม่</p>
          <div className="flex gap-4 pt-[10px]">
            <PopupButton onClick={() => navigate('/liff/reschedule')}>เลือกเวลาใหม่</PopupButton>
            <PopupButton variant="gray" onClick={() => setPopup(null)}>
              ไม่เลื่อน
            </PopupButton>
          </div>
        </Popup>
      )}

      {/* ยกเลิกแล้ว (ไม่มีใน Figma — ตามตัวอย่างจอ ③) */}
      {cancelledPopup}
    </div>
  )
}

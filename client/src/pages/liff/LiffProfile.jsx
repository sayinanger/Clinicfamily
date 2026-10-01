import { useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { saveProfile } from '../../lib/api.js'
import { THAI_MONTHS } from '../../lib/format.js'

// ตัวเลือกเพศ (value = ค่าที่ส่งให้ server ตาม API contract)
const GENDER_OPTIONS = [
  { value: 'male', label: 'ชาย' },
  { value: 'female', label: 'หญิง' },
  { value: 'unspecified', label: 'ไม่ระบุ' },
]

// ปี พ.ศ. ให้เลือก: ปีนี้ ย้อนไป 110 ปี (เรียงใหม่ → เก่า) เช่น 2569, 2568, ... 2459
// ปี พ.ศ. = ปี ค.ศ. + 543
const THIS_YEAR_BE = new Date().getFullYear() + 543
const YEAR_OPTIONS = Array.from({ length: 111 }, (_, index) => THIS_YEAR_BE - index)

// จำนวนวันในเดือน (เดือน 1–12, ปี ค.ศ.) เช่น ก.พ. 2024 = 29
// ยังไม่เลือกเดือน/ปี → 31
function daysInMonth(month, yearCE) {
  if (!month) return 31
  return new Date(yearCE || 2000, month, 0).getDate() // ปี 2000 เป็นปีอธิกสุรทิน → ก.พ. ได้ 29
}

// แปลงประวัติจาก server เป็นค่าในช่องกรอก (วันเกิด '1968-04-12' → วัน 12 / เดือน 4 / ปี 2511)
function profileToForm(profile) {
  if (!profile) {
    return { firstName: '', lastName: '', gender: '', day: '', month: '', yearBE: '', phone: '' }
  }
  const [year, month, day] = profile.birthDate.split('-').map(Number)
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    gender: profile.gender,
    day: String(day),
    month: String(month),
    yearBE: String(year + 543),
    phone: profile.phone,
  }
}

// วัน/เดือน/ปี พ.ศ. ในช่องเลือก → 'YYYY-MM-DD' ปี ค.ศ. (เลือกไม่ครบ → '' ให้ server ตอบว่ายังไม่เลือก)
function formToBirthDate(form) {
  if (!form.day || !form.month || !form.yearBE) return ''
  const yearCE = Number(form.yearBE) - 543
  const month = form.month.padStart(2, '0')
  const day = form.day.padStart(2, '0')
  return `${yearCE}-${month}-${day}`
}

// หน้าประวัติส่วนตัว (Figma 274:215) — ใช้ทั้งกรอกครั้งแรกและแก้ไข
// ถ้าเปิดมาพร้อม ?next=... (เช่น จากเมนูจองคิว) บันทึกเสร็จจะไปหน้านั้นต่อ
// ถ้าไม่มี → แสดง "บันทึกแล้ว" อยู่หน้าเดิม
export default function LiffProfile() {
  const { me, setMe } = useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')

  const [form, setForm] = useState(() => profileToForm(me.profile)) // ค่าในช่องกรอกทั้งหมด
  const [fieldErrors, setFieldErrors] = useState({}) // ข้อความผิดรายช่อง { phone: '...' }
  const [error, setError] = useState('') // ข้อความผิดรวม (เช่น server ล่ม)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false) // true = แสดงกล่อง "บันทึกแล้ว"

  // เปลี่ยนค่าช่องใดช่องหนึ่ง เช่น updateField('firstName', 'สมหญิง')
  // พิมพ์ใหม่แล้ว → ลบข้อความผิดของช่องนั้น + ซ่อน "บันทึกแล้ว"
  function updateField(name, value) {
    const newForm = { ...form, [name]: value }
    // เปลี่ยนเดือน/ปีแล้ววันที่เลือกไว้เกินเดือนนั้น (เช่น 31 → ก.พ.) → ล้างช่องวัน
    const maxDay = daysInMonth(Number(newForm.month), Number(newForm.yearBE) - 543)
    if (Number(newForm.day) > maxDay) newForm.day = ''
    setForm(newForm)

    // ช่องวัน/เดือน/ปี ใช้ข้อความผิดร่วมกันชื่อ birthDate
    const errorKey = ['day', 'month', 'yearBE'].includes(name) ? 'birthDate' : name
    setFieldErrors({ ...fieldErrors, [errorKey]: undefined })
    setSaved(false)
  }

  // กดปุ่ม "บันทึก"
  async function handleSubmit(event) {
    event.preventDefault() // กันเบราว์เซอร์รีเฟรชหน้าเองตอนส่งฟอร์ม
    setSaving(true)
    setError('')
    setFieldErrors({})
    setSaved(false)
    try {
      const result = await saveProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        birthDate: formToBirthDate(form),
        phone: form.phone,
      })
      // บอก LiffLayout ว่ามีประวัติแล้ว (หน้าอื่นจะเห็นค่าใหม่)
      setMe({ ...me, profileCompleted: true, profile: result.profile })
      if (next) {
        navigate(next, { replace: true })
        return
      }
      setSaved(true)
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        setFieldErrors(err.data?.fields || {}) // ข้อความแดงใต้ช่องที่ผิด
      } else {
        setError(err.message)
      }
    }
    setSaving(false)
  }

  const maxDay = daysInMonth(Number(form.month), Number(form.yearBE) - 543)
  const dayOptions = Array.from({ length: maxDay }, (_, index) => index + 1)

  return (
    <div className="px-6 pt-12 pb-10">
      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-[321px]">
        <h1 className="text-center text-[29px] font-semibold text-black">ประวัติส่วนตัว</h1>

        <div className="mt-14 space-y-6">
          {/* ชื่อ */}
          <Field label="ชื่อ" htmlFor="firstName" error={fieldErrors.firstName}>
            <input
              id="firstName"
              type="text"
              value={form.firstName}
              onChange={(event) => updateField('firstName', event.target.value)}
              autoComplete="given-name"
              className={underlineInputClass}
            />
          </Field>

          {/* นามสกุล */}
          <Field label="นามสกุล" htmlFor="lastName" error={fieldErrors.lastName}>
            <input
              id="lastName"
              type="text"
              value={form.lastName}
              onChange={(event) => updateField('lastName', event.target.value)}
              autoComplete="family-name"
              className={underlineInputClass}
            />
          </Field>

          {/* เพศ — วงกลมให้เลือก 1 อย่าง */}
          <Field label="เพศ" error={fieldErrors.gender}>
            <div className="mt-2 grid grid-cols-3">
              {GENDER_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 text-[23px] font-semibold text-black">
                  <input
                    type="radio"
                    name="gender"
                    value={option.value}
                    checked={form.gender === option.value}
                    onChange={() => updateField('gender', option.value)}
                    // appearance-none = ซ่อนวงกลมของเบราว์เซอร์ แล้ววาดเองให้เหมือน Figma (วงกลม 15px ขอบดำ)
                    // เลือกแล้ว = ขอบหนาสีเขียว
                    className="size-[15px] shrink-0 cursor-pointer appearance-none rounded-full border border-black checked:border-[5px] checked:border-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Field>

          {/* วันเกิด — 3 ช่องเลือก วัน / เดือน / ปี พ.ศ. */}
          <Field label="วันเกิด" error={fieldErrors.birthDate}>
            <div className="grid grid-cols-[1fr_1.7fr_1.3fr] gap-3">
              <select
                aria-label="วันเกิด"
                value={form.day}
                onChange={(event) => updateField('day', event.target.value)}
                className={selectClass(form.day)}
              >
                <option value="">วัน</option>
                {dayOptions.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                aria-label="เดือนเกิด"
                value={form.month}
                onChange={(event) => updateField('month', event.target.value)}
                className={selectClass(form.month)}
              >
                <option value="">เดือน</option>
                {THAI_MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
              <select
                aria-label="ปีเกิด (พ.ศ.)"
                value={form.yearBE}
                onChange={(event) => updateField('yearBE', event.target.value)}
                className={selectClass(form.yearBE)}
              >
                <option value="">ปี พ.ศ.</option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </Field>

          {/* เบอร์โทรศัพท์ — รับเฉพาะตัวเลข สูงสุด 10 ตัว (มือถือจะขึ้นแป้นตัวเลข) */}
          <Field label="เบอร์โทรศัพท์" htmlFor="phone" error={fieldErrors.phone}>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value.replace(/\D/g, ''))}
              autoComplete="tel"
              className={underlineInputClass}
            />
          </Field>
        </div>

        {/* บันทึกสำเร็จ (ไม่มีใน Figma — สีเขียวสำเร็จจากชุดสีหน้าผู้ป่วย) */}
        {saved && (
          <p className="mt-8 rounded-[5px] bg-liff-success-bg px-4 py-3 text-center text-[18px] font-medium text-liff-success">
            บันทึกแล้ว
          </p>
        )}

        {/* ข้อความผิดพลาดรวม (ไม่มีใน Figma) */}
        {error && (
          <p className="mt-8 rounded-[5px] border border-liff-red-border bg-liff-red-bg px-4 py-3 text-[16px] text-liff-red">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-8 h-[60px] w-full rounded-[5px] bg-primary text-[23px] font-semibold text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)] disabled:bg-liff-disabled disabled:shadow-none"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
    </div>
  )
}

// หน้าตาช่องพิมพ์แบบ Figma: ไม่มีกรอบ มีแค่เส้นใต้สีดำ (เลือกอยู่ = เส้นเขียว)
const underlineInputClass =
  'h-11 w-full border-b border-black bg-transparent text-[20px] text-black outline-none focus:border-primary'

// ช่องเลือก (select) เส้นใต้แบบเดียวกัน — ยังไม่เลือก = ตัวหนังสือเทา #999 แบบ placeholder ใน Figma
function selectClass(value) {
  const color = value ? 'text-black' : 'text-liff-placeholder'
  return `h-11 w-full border-b border-black bg-transparent text-[18px] outline-none focus:border-primary ${color}`
}

// กล่องของแต่ละช่อง: หัวข้อ + ช่องกรอก (children) + ข้อความผิดสีแดง
function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[23px] font-semibold text-black">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[16px] text-liff-red">{error}</p>}
    </div>
  )
}
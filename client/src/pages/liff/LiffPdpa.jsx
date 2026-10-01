import { useState } from 'react'
import { Navigate, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { acceptPdpa } from '../../lib/api.js'
import { formatPhone, formatThaiDateLong } from '../../lib/format.js'

// ชื่อและเบอร์คลินิก ตั้งค่าในไฟล์ client/.env (VITE_CLINIC_NAME, VITE_CLINIC_PHONE)
const CLINIC_NAME = import.meta.env.VITE_CLINIC_NAME || 'คลินิก'
const CLINIC_PHONE = formatPhone(import.meta.env.VITE_CLINIC_PHONE || '')
// วันที่ข้อตกลงนี้มีผล (ปี ค.ศ.) — แสดงเป็น "1 ตุลาคม 2569"
const EFFECTIVE_DATE = '2026-10-01'

// หน้ายินยอมการใช้ข้อมูลส่วนบุคคล (PDPA) — ไม่มีใน Figma ออกแบบตามสไตล์หน้าผู้ป่วยอื่น
// ข้อความมาจาก claude/pdpa-consent-draft.md
// เปิดหน้านี้เมื่อ: LiffLayout พามา (ยังไม่ยินยอม) พร้อม ?next=หน้าที่จะไปต่อ
export default function LiffPdpa() {
  const { me, setMe } = useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next') || '/liff' // กดยินยอมแล้วไปหน้านี้

  const [showDetails, setShowDetails] = useState(false) // เปิด/ปิด "รายละเอียดเพิ่มเติม"
  const [agreed, setAgreed] = useState(false) // ติ๊กช่องยินยอมแล้วหรือยัง
  const [saving, setSaving] = useState(false) // กำลังส่งไป server (กันกดซ้ำ)
  const [error, setError] = useState('')

  // ยินยอมไปแล้ว (เช่น กดย้อนกลับมาหน้านี้) → ไปหน้าถัดไปเลย
  if (me.pdpaAccepted) {
    return <Navigate to={next} replace />
  }

  // กดปุ่ม "ยินยอมและเริ่มใช้งาน"
  async function handleAccept() {
    setSaving(true)
    setError('')
    try {
      await acceptPdpa()
      setMe({ ...me, pdpaAccepted: true }) // บอก LiffLayout ว่ายินยอมแล้ว
      navigate(next, { replace: true }) // replace = กดย้อนกลับแล้วไม่วนมาหน้านี้อีก
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="px-6 pt-12 pb-10">
      <div className="mx-auto max-w-[321px]">
        <h1 className="text-center text-[29px] leading-snug font-semibold text-black">
          ข้อตกลงการใช้ข้อมูลส่วนบุคคล
        </h1>

        <p className="mt-6 text-[18px] text-black">
          {CLINIC_NAME} ขอเก็บข้อมูลของคุณเพื่อใช้ในการจองคิวผ่าน LINE ดังนี้
        </p>

        {/* ส่วนที่ 1 — สรุปสั้น */}
        <ul className="mt-4 space-y-3 rounded-[5px] bg-white p-4 text-[17px] text-black">
          <li>
            <span className="font-semibold">ข้อมูลที่เก็บ:</span> ชื่อ–นามสกุล เพศ วันเกิด เบอร์โทรศัพท์
            รหัสผู้ใช้ LINE และประวัติการนัดหมาย
          </li>
          <li>
            <span className="font-semibold">ใช้เพื่อ:</span> จองคิว ส่งข้อความยืนยันและแจ้งเตือนนัดทาง LINE
            และติดต่อคุณเกี่ยวกับนัดหมาย
          </li>
          <li>
            <span className="font-semibold">เราไม่เก็บ</span> ข้อมูลอาการหรือประวัติการรักษา
          </li>
          <li>
            <span className="font-semibold">เราไม่ขาย</span> หรือเปิดเผยข้อมูลของคุณให้บุคคลอื่นเพื่อการตลาด
          </li>
          <li>คุณขอดู แก้ไข หรือขอยกเลิกความยินยอมได้ตลอดเวลา</li>
        </ul>

        {/* ปุ่มเปิด/ปิดรายละเอียด */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="mt-4 text-[18px] font-medium text-primary underline"
        >
          {showDetails ? 'ซ่อนรายละเอียด ▴' : 'อ่านรายละเอียดเพิ่มเติม ▾'}
        </button>

        {/* ส่วนที่ 2 — รายละเอียดเพิ่มเติม (แสดงเมื่อกดเปิด) */}
        {showDetails && <PdpaDetails />}

        {/* ช่องติ๊กยินยอม — ทั้งแถวกดได้ เพราะอยู่ใน <label> */}
        <label className="mt-6 flex cursor-pointer items-start gap-3 text-[18px] text-black">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 size-6 shrink-0 accent-primary"
          />
          <span>
            ข้าพเจ้าได้อ่านและยินยอมให้ {CLINIC_NAME} เก็บและใช้ข้อมูลส่วนบุคคลตามรายละเอียดข้างต้น
          </span>
        </label>

        {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
        {error && (
          <p className="mt-4 rounded-[5px] border border-liff-red-border bg-liff-red-bg px-4 py-3 text-[16px] text-liff-red">
            {error}
          </p>
        )}

        {/* ปุ่มยินยอม — กดได้เมื่อติ๊กแล้วเท่านั้น (เทา #9E9E9E เมื่อกดไม่ได้) */}
        <button
          type="button"
          onClick={handleAccept}
          disabled={!agreed || saving}
          className="mt-8 h-[60px] w-full rounded-[5px] bg-primary text-[23px] font-semibold text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)] disabled:bg-liff-disabled disabled:shadow-none"
        >
          {saving ? 'กำลังบันทึก...' : 'ยินยอมและเริ่มใช้งาน'}
        </button>
      </div>
    </div>
  )
}

// หัวข้อย่อยในรายละเอียด (ใช้ซ้ำ 8 ข้อ)
function DetailSection({ title, children }) {
  return (
    <section className="mt-4">
      <h2 className="font-semibold text-black">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  )
}

// รายละเอียดเพิ่มเติม 8 ข้อ (ส่วนที่ 2 ของร่าง PDPA)
function PdpaDetails() {
  return (
    <div className="mt-2 text-[16px] text-black">
      <DetailSection title="1. ผู้ควบคุมข้อมูล">
        <p>
          {CLINIC_NAME} โทร {CLINIC_PHONE} หรือส่งข้อความผ่าน LINE Official Account ของคลินิก
        </p>
      </DetailSection>

      <DetailSection title="2. ข้อมูลที่เก็บ">
        <ul className="list-disc space-y-1 pl-5">
          <li>ข้อมูลที่คุณกรอก: ชื่อ นามสกุล เพศ วันเกิด เบอร์โทรศัพท์</li>
          <li>ข้อมูลจาก LINE: รหัสผู้ใช้ LINE (User ID) เพื่อระบุตัวคุณและส่งข้อความถึงคุณ</li>
          <li>ข้อมูลการใช้บริการ: วันและเวลานัด การยกเลิก การเลื่อนนัด และการมาหรือไม่มาตามนัด</li>
          <li>วันและเวลาที่คุณกดยินยอม</li>
        </ul>
      </DetailSection>

      <DetailSection title="3. วัตถุประสงค์">
        <ul className="list-disc space-y-1 pl-5">
          <li>จัดการการจองคิว การยกเลิก และการเลื่อนนัด</li>
          <li>ส่งข้อความยืนยันการจองและแจ้งเตือนก่อนถึงวันและเวลานัดผ่าน LINE</li>
          <li>ให้เจ้าหน้าที่คลินิกตรวจสอบรายการนัดและติดต่อคุณเมื่อจำเป็น</li>
          <li>จัดทำสถิติการมาตามนัดของคลินิกในภาพรวม ซึ่งไม่ระบุตัวบุคคล</li>
        </ul>
      </DetailSection>

      <DetailSection title="4. การเปิดเผยข้อมูล">
        <p>
          ข้อมูลของคุณจะเข้าถึงได้เฉพาะเจ้าหน้าที่ของคลินิก และผู้ให้บริการที่จำเป็นต่อการทำงานของระบบเท่านั้น ได้แก่
          LINE (ช่องทางส่งข้อความ) และผู้ให้บริการเซิร์ฟเวอร์และฐานข้อมูล
        </p>
      </DetailSection>

      <DetailSection title="5. ระยะเวลาเก็บข้อมูล">
        <p>
          เก็บไว้ตลอดระยะเวลาที่คุณใช้บริการ เมื่อคุณขอยกเลิก คลินิกจะลบหรือทำให้ข้อมูลไม่สามารถระบุตัวคุณได้
          ยกเว้นข้อมูลที่ต้องเก็บตามกฎหมาย
        </p>
      </DetailSection>

      <DetailSection title="6. สิทธิของคุณ">
        <p>ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 คุณมีสิทธิ:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>ขอเข้าถึงหรือขอสำเนาข้อมูล</li>
          <li>ขอแก้ไขข้อมูลให้ถูกต้อง (แก้ไขเองได้ที่เมนู "ประวัติส่วนตัว")</li>
          <li>ขอลบหรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้</li>
          <li>ขอถอนความยินยอม</li>
          <li>คัดค้านหรือขอระงับการใช้ข้อมูล</li>
          <li>ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล</li>
        </ul>
        <p className="mt-1">ติดต่อใช้สิทธิได้ที่ {CLINIC_PHONE} หรือแชท LINE ของคลินิก</p>
      </DetailSection>

      <DetailSection title="7. การถอนความยินยอม">
        <p>
          หากถอนความยินยอม คุณจะไม่สามารถจองคิวผ่าน LINE ได้ แต่ยังจองผ่านทางโทรศัพท์ได้ตามปกติ
          การถอนความยินยอมไม่กระทบการใช้ข้อมูลที่เกิดขึ้นก่อนหน้า
        </p>
      </DetailSection>

      <DetailSection title="8. การรักษาความปลอดภัย">
        <p>
          ระบบจำกัดการเข้าถึงข้อมูลเฉพาะเจ้าหน้าที่ที่ต้องเข้าสู่ระบบ และรับส่งข้อมูลผ่านการเชื่อมต่อที่เข้ารหัส (HTTPS)
        </p>
      </DetailSection>

      <p className="mt-4">มีผลตั้งแต่ {formatThaiDateLong(EFFECTIVE_DATE)}</p>
    </div>
  )
}
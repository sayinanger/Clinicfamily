import { Link, useOutletContext } from 'react-router-dom'
import { USE_MOCK, getNowMs } from '../../lib/api.js'
import { MOCK_PATIENT_SCENARIOS, getMockPatientScenario } from '../../lib/mock.js'
import { formatThaiDayChip } from '../../lib/format.js'

// เวลาของนาฬิกาจำลองตอนเปิดหน้า เช่น 'ศ. 2 ต.ค. 2569 20:00 น.' (ใช้เฉพาะโหมดข้อมูลปลอม)
function mockClockText() {
  // บวก 7 ชม. แล้วอ่านแบบ ISO (UTC) = ได้วันเวลาไทย เช่น '2026-10-02T20:00:00.000Z'
  const bangkokIso = new Date(getNowMs() + 7 * 60 * 60 * 1000).toISOString()
  const date = bangkokIso.slice(0, 10)
  const buddhistYear = Number(date.slice(0, 4)) + 543
  return `${formatThaiDayChip(date)} ${buddhistYear} ${bangkokIso.slice(11, 16)} น.`
}

// เมนูของหน้านี้ (แทนปุ่ม Rich Menu ใน LINE) — path = null คือหน้าที่ยังไม่ได้ทำ
const MENU_ITEMS = [
  { label: 'ประวัติส่วนตัว', path: '/liff/profile' },
  { label: 'จองคิว', path: '/liff/booking' },
  { label: 'ยกเลิก/เลื่อนนัด', path: '/liff/appointment' },
]

// หน้าเมนูทดสอบ (/liff) — ใช้ตอนพัฒนาบนเบราว์เซอร์เท่านั้น
// ใน LINE จริง ปุ่ม Rich Menu จะเปิดแต่ละหน้าโดยตรง (เช่น /liff/profile) ผู้ป่วยจึงไม่เห็นหน้านี้
// หน้านี้ไม่ต้องยินยอม PDPA ก่อน (ตั้งไว้ใน LiffLayout) → กดเมนูแล้วจะเจอหน้า PDPA เหมือนของจริง
export default function LiffHome() {
  const { lineUser, me } = useOutletContext()
  const currentScenario = USE_MOCK ? getMockPatientScenario() : null

  return (
    <div className="px-6 pt-12 pb-10">
      <div className="mx-auto max-w-[321px]">
        <h1 className="text-center text-[29px] font-semibold text-black">เมนูทดสอบ</h1>
        <p className="mt-1 text-center text-[16px] text-muted">แทน Rich Menu — ใช้ตอนพัฒนาเท่านั้น</p>

        {/* สถานะของผู้ใช้ตอนนี้ */}
        <div className="mt-6 rounded-[5px] bg-white p-4 text-[17px] text-black">
          <p>ชื่อ LINE: {lineUser.displayName}</p>
          <p>ยินยอม PDPA: {me.pdpaAccepted ? '✔ แล้ว' : '✘ ยัง'}</p>
          <p>กรอกประวัติ: {me.profileCompleted ? '✔ แล้ว' : '✘ ยัง'}</p>
          {/* นาฬิกาจำลอง — เปลี่ยนตามผู้ใช้ทดสอบ (ดูตารางในคู่มือการใช้งาน) */}
          {/*แสดงบรรทัดนี้เฉพาะตอนใช้ข้อมูลปลอม พอต่อ server จริงแล้วบรรทัดนี้จะหายไปเอง เวลาที่แสดงคือเวลาตอนเปิดหน้า ถ้าอยากเห็นเวลาล่าสุดให้รีเฟรชหน้า*/}
          {USE_MOCK && <p>นาฬิกาจำลอง: {mockClockText()}</p>}
        </div>

        {/* ปุ่มเมนู */}
        <div className="mt-6 space-y-3">
          {MENU_ITEMS.map((item) =>
            item.path ? (
              <Link
                key={item.label}
                to={item.path}
                className="flex h-[52px] w-full items-center justify-center rounded-[5px] bg-primary text-[20px] font-semibold text-white"
              >
                {item.label}
              </Link>
            ) : (
              <div
                key={item.label}
                className="flex h-[52px] w-full items-center justify-center rounded-[5px] bg-liff-gray-button text-[20px] font-semibold text-liff-disabled"
              >
                {item.label} (ยังไม่ได้ทำ)
              </div>
            ),
          )}
        </div>

        {/* สลับผู้ใช้ทดสอบ — มีเฉพาะโหมดข้อมูลปลอม */}
        {/* ใช้ <a href> (โหลดหน้าใหม่ทั้งหน้า) ไม่ใช้ <Link> เพราะต้องให้ LiffLayout เริ่มผู้ใช้ใหม่ */}
        {USE_MOCK && (
          <div className="mt-10">
            <h2 className="text-[20px] font-semibold text-black">สลับผู้ใช้ทดสอบ</h2>
            <p className="mt-1 text-[15px] text-muted">กดแล้วเริ่มใหม่ตามสถานการณ์ (ข้อมูลที่กรอกไว้จะหาย)</p>
            <div className="mt-3 space-y-2">
              {Object.entries(MOCK_PATIENT_SCENARIOS).map(([key, scenario]) => (
                <a
                  key={key}
                  href={`/liff?user=${key}`}
                  className={`block rounded-[5px] border px-4 py-3 text-[17px] ${
                    key === currentScenario
                      ? 'border-primary bg-primary-light font-semibold text-primary'
                      : 'border-primary-light text-black'
                  }`}
                >
                  {scenario.label}
                  {key === currentScenario && ' ← ตอนนี้'}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
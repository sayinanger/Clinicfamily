import { useEffect, useState } from 'react'
import { getAdminStats, getAdminStatsTrend } from '../../lib/api.js'
import { formatThaiMonthLong, formatThaiMonthShort } from '../../lib/format.js'
import iconCalendar from '../../assets/admin/icon-calendar.svg'

// หน้าสถิติ — ตาม Figma "สถิติ" (259:64)
// API ที่ใช้: S10 สถิติรายเดือน, S11 อัตราไม่มาย้อนหลัง 6 เดือน (ดู docs/api-contract.md)
// กราฟวาดด้วย div ธรรมดา (ไม่ใช้ไลบรารีกราฟ)

// รายการเดือนให้เลือก = เดือนปัจจุบันย้อนหลัง 12 เดือน (ใหม่สุดอยู่บน) เป็น 'YYYY-MM'
function lastTwelveMonths() {
    const months = []
    for (let monthsAgo = 0; monthsAgo < 12; monthsAgo++) {
    const day = new Date()
    day.setDate(1) // ตั้งเป็นวันที่ 1 ก่อน กันเดือนเพี้ยน (เช่น 31 ต.ค. ย้อน 1 เดือน)
    day.setMonth(day.getMonth() - monthsAgo)
    const month = String(day.getMonth() + 1).padStart(2, '0')
    months.push(`${day.getFullYear()}-${month}`)
    }
    return months
}

// แสดงอัตรา % ทศนิยม 1 ตำแหน่ง — null (ตัวหารเป็น 0) → "—"
function formatRate(rate) {
    return rate === null ? '—' : `${rate.toFixed(1)}%`
}

// "85.6% ของนัดทั้งหมด" — หน้าเว็บคำนวณเองจาก total (ตาม contract) — total เป็น 0 → "—"
function percentOfTotal(count, total) {
    if (total === 0) return '— ของนัดทั้งหมด'
  return `${((count / total) * 100).toFixed(1)}% ของนัดทั้งหมด`
}

// บรรทัดเทียบเดือนก่อน: คืน { text, color }
// ลดลง = เขียว, เพิ่มขึ้น = แดง, เท่าเดิม/ไม่มีข้อมูล = เทา
function compareWithPrevMonth(stats) {
    const prevText = `เดือนก่อน ${formatRate(stats.prevNoShowRate)}`
    if (stats.diffPoints === null) {
        return { text: prevText, color: 'text-staff-stat-label' }
    }
    if (stats.diffPoints < 0) {
        return { text: `${prevText}  (ลดลง ${Math.abs(stats.diffPoints).toFixed(1)} จุด)`, color: 'text-staff-open' }
    }
    if (stats.diffPoints > 0) {
        return { text: `${prevText}  (เพิ่มขึ้น ${stats.diffPoints.toFixed(1)} จุด)`, color: 'text-staff-red' }
    }
    return { text: `${prevText}  (เท่าเดิม)`, color: 'text-staff-stat-label' }
}

// การ์ดตัวเลข 1 ใบ (แถวบน 4 ใบ)
//   label = หัวการ์ด, value = ตัวเลขใหญ่, valueColor = สีตัวเลข, note = บรรทัดล่าง
function SummaryCard({ label, value, valueColor, note }) {
    return (
        <div className="rounded-xl border border-staff-table-border bg-white px-5 py-4">
            <p className="text-sm text-staff-stat-label">{label}</p>
            <p className={`mt-1 text-[32px] leading-10 font-bold ${valueColor}`}>{value}</p>
            <p className="mt-1 text-[13px] text-staff-stat-label">{note}</p>
        </div>
    )
}

// กราฟแท่งอัตราไม่มาย้อนหลัง
//   trend = ข้อมูลจาก S11, selectedMonth = เดือนที่เลือกอยู่ (แท่งเดือนนั้นเป็นสีส้ม)
function TrendChart({ trend, selectedMonth }) {
  // ความสูงของแท่งที่สูงที่สุด (px) — Figma: เส้นงานวิจัย 22% อยู่สูง 132px (6px ต่อ 1%)
  const MAX_BAR_HEIGHT = 132
  // ค่าสูงสุดของแกน = ค่าที่มากกว่าระหว่างเส้นงานวิจัย กับแท่งที่สูงที่สุด (กันแท่งทะลุกรอบ)
  const rates = trend.months.map((item) => item.noShowRate ?? 0)
  const maxRate = Math.max(trend.referenceRate, ...rates)
  // แปลง % เป็นความสูง px
  const toHeight = (rate) => (rate / maxRate) * MAX_BAR_HEIGHT

  return (
    // พื้นที่กราฟ: สูง 132px + เผื่อด้านบนให้ป้ายตัวเลข
    <div className="relative mt-[50px] h-[132px] border-b border-staff-table-border">
      {/* เส้นประงานวิจัย (สีเข้ม ตาม Figma) + ป้ายสีแดงมุมขวา */}
      <div
        className="absolute inset-x-0 border-t border-dashed border-staff-number"
        style={{ bottom: toHeight(trend.referenceRate) }}
      >
        <span className="absolute right-0 bottom-0.5 text-[11px] text-staff-red underline">
          งานวิจัย {trend.referenceRate.toFixed(0)}%
        </span>
      </div>

      {/* แท่งกราฟ — แต่ละเดือนกินที่เท่ากัน แท่งอยู่กลาง */}
      <div className="absolute inset-0 flex">
        {trend.months.map((item) => (
          <div key={item.month} className="relative flex flex-1 flex-col items-center justify-end">
            {/* ป้ายตัวเลขเหนือแท่ง */}
            <span className="mb-0.5 text-xs text-black">{formatRate(item.noShowRate)}</span>
            {/* แท่ง: เดือนที่เลือก = ส้ม, อื่น ๆ = ฟ้า; null = ไม่มีแท่ง */}
            <div
              className={`w-10 rounded-t-[4px] ${item.month === selectedMonth ? 'bg-staff-orange' : 'bg-staff-blue'}`}
              style={{ height: toHeight(item.noShowRate ?? 0) }}
            />
            {/* ชื่อเดือนใต้เส้นฐาน */}
            <span className="absolute -bottom-6 text-xs text-staff-stat-label">
              {formatThaiMonthShort(item.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminStats() {
  // เดือนที่กำลังดู 'YYYY-MM' — ว่าง = ยังไม่รู้ (รอ server บอกเดือนปัจจุบัน)
  const [month, setMonth] = useState('')
  // สถิติของเดือนที่เลือก (S10) — null = ยังไม่มีข้อมูล
  const [stats, setStats] = useState(null)
  // ข้อมูลกราฟ 6 เดือน (S11) — โหลดครั้งเดียว ไม่เปลี่ยนตามเดือนที่เลือก
  const [trend, setTrend] = useState(null)
  // true = กำลังโหลด
  const [loading, setLoading] = useState(true)
  // ข้อความผิดพลาด (ว่าง = ไม่มี)
  const [errorMessage, setErrorMessage] = useState('')

  // โหลดสถิติของเดือน — selectedMonth ว่าง = ให้ server ใช้เดือนปัจจุบัน
  async function loadStats(selectedMonth) {
    setLoading(true)
    setErrorMessage('')
    try {
      const data = await getAdminStats(selectedMonth)
      setMonth(data.month)
      setStats(data)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  // เปิดหน้ามาครั้งแรก → โหลดสถิติเดือนปัจจุบัน + กราฟ 6 เดือน
  useEffect(() => {
    loadStats('')
    getAdminStatsTrend(6)
      .then((data) => setTrend(data))
      .catch((error) => setErrorMessage(error.message))
  }, [])

  // ถ้า server บอกเดือนที่ไม่อยู่ในรายการ (เช่น เวลาเครื่องไม่ตรง) ก็เพิ่มเข้าไป ช่องเลือกจะได้แสดงถูก
  const monthOptions = lastTwelveMonths()
  if (month && !monthOptions.includes(month)) monthOptions.unshift(month)

  const comparison = stats ? compareWithPrevMonth(stats) : null

  return (
    <div>
      {/* หัวข้อหน้า */}
      <h1 className="text-2xl leading-7 font-bold text-black">สถิติการนัดหมาย</h1>

      {/* แถวเลือกเดือน */}
      <div className="mt-2 flex items-center gap-6">
        <span className="text-xl font-medium text-black">เดือน</span>
        {/* กล่องหน้าตาตาม Figma (289×38) — ข้างในเป็นรายการเดือนให้เลือก (select) */}
        <div className="relative h-[38px] w-[289px]">
          <select // คือช่องที่กดแล้วมีรายการให้เลือก
            value={month}
            onChange={(event) => loadStats(event.target.value)}
            aria-label="เลือกเดือน"
            className="h-full w-full cursor-pointer appearance-none rounded-[5px] border border-staff-subtle bg-white px-[15px] text-[15px] font-medium text-black"
          >
            {/* ยังไม่รู้เดือน → แสดง "กำลังโหลด..." */}
            {!month && <option value="">กำลังโหลด...</option>}
            {monthOptions.map((item) => (
              <option key={item} value={item}>
                {formatThaiMonthLong(item)}
              </option>
            ))}
          </select>
          {/* ไอคอนปฏิทินมุมขวา (pointer-events-none = กดทะลุไปที่ช่องเลือก) */}
          <img
            src={iconCalendar}
            alt=""
            className="pointer-events-none absolute top-1/2 right-[15px] size-3.5 -translate-y-1/2"
          />
        </div>
      </div>

      {/* ข้อความผิดพลาด (ไม่มีใน Figma) */}
      {errorMessage && <p className="mt-3 text-sm text-staff-red">{errorMessage}</p>}

      {loading && !stats ? (
        <p className="mt-3 text-staff-subtle">กำลังโหลด...</p>
      ) : (
        stats && (
          // ขณะโหลดเดือนใหม่ ทำให้จางลงนิดหน่อย
          <div className={loading ? 'opacity-60' : ''}>
            {/* ===== แถวบน: การ์ด 4 ใบ ===== */}
            <div className="mt-3 grid grid-cols-4 gap-4">
              <SummaryCard
                label="นัดทั้งหมด"
                value={stats.total}
                valueColor="text-staff-number"
                note={`จาก ${stats.totalSlots} คิว (${stats.workingDays} วันทำการ)`}
              />
              <SummaryCard
                label="มาตามนัด"
                value={stats.attended}
                valueColor="text-staff-open"
                note={percentOfTotal(stats.attended, stats.total)}
              />
              <SummaryCard
                label="ไม่มา"
                value={stats.noShow}
                valueColor="text-staff-orange"
                note={percentOfTotal(stats.noShow, stats.total)}
              />
              <SummaryCard
                label="ยกเลิก"
                value={stats.cancelled}
                valueColor="text-staff-red"
                note={percentOfTotal(stats.cancelled, stats.total)}
              />
            </div>

            {/* ===== แถวล่าง: อัตราไม่มา (กว้าง 300px ตาม Figma) + กราฟ (ยืดตามจอ) ===== */}
            <div className="mt-[9px] flex gap-4">
              {/* การ์ดอัตราไม่มาตามนัด */}
              <div className="h-[300px] w-[300px] shrink-0 rounded-xl border border-staff-table-border bg-white p-6">
                <p className="font-semibold text-staff-number">อัตราไม่มาตามนัด</p>
                <p className="mt-1 text-5xl leading-[62px] font-bold text-staff-orange">
                  {formatRate(stats.noShowRate)}
                </p>
                {/* สูตร + ตัวเลขจริง */}
                <p className="mt-1 text-[13px] leading-[17px] text-staff-stat-label">
                  ไม่มา ÷ (มาตามนัด + ไม่มา)
                  <br />= {stats.noShow} ÷ {stats.attended + stats.noShow}
                </p>
                <hr className="mt-2 border-staff-table-border" />
                <p className={`mt-2 text-sm font-medium whitespace-pre ${comparison.color}`}>{comparison.text}</p>
                <p className="mt-2 text-[13px] text-staff-stat-label">
                  ค่าอ้างอิงจากงานวิจัย {stats.referenceRate.toFixed(1)}%
                </p>
              </div>

              {/* การ์ดกราฟ 6 เดือน */}
              <div className="h-[300px] min-w-0 flex-1 rounded-xl border border-staff-table-border bg-white px-6 pt-6">
                <p className="font-semibold text-staff-number">อัตราไม่มาตามนัดย้อนหลัง 6 เดือน</p>
                {trend ? (
                  <TrendChart trend={trend} selectedMonth={month} />
                ) : (
                  <p className="mt-3 text-staff-subtle">กำลังโหลด...</p>
                )}
              </div>
            </div>

            {/* หมายเหตุใต้การ์ด */}
            <p className="mt-4 text-xs text-staff-stat-label">
              * มาตามนัด = นัดที่ผ่านเวลาแล้วและไม่ได้ถูกบันทึกว่า "ไม่มา" &nbsp; * ไม่นับนัดที่ยกเลิกในการคำนวณอัตราไม่มาตามนัด
            </p>
          </div>
        )
      )}
    </div>
  )
}
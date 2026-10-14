// ชุด P — ข้อความเตือนก่อนนัด (cron + ปุ่มเดโม D1) และล้างคิวที่ถือค้าง
//
// cron (node-cron) ตื่นทุก 1 นาที แล้วทำ 2 อย่าง:
//   1) ส่งการ์ดเตือน 2 แบบ
//      - day_before = 07:00 ของวันก่อนนัด
//      - before_2h  = 2 ชั่วโมงก่อนนัด
//   2) ล้างคิว held ที่หมดเวลาถือ → available (M6ก — ระบบถือว่าว่างอยู่แล้ว ขั้นนี้แค่เก็บกวาดข้อมูล)
//
// กติกาการเตือน (claude/time-rules-v2.md + project-snapshot หมวด 5):
//   - ส่งเฉพาะนัด booked
//   - นัดกระชั้น (เวลานัด − เวลาจอง/เลื่อนล่าสุด < 3 ชม.) → ไม่เตือนทั้ง 2 แบบ
//   - จอง/เลื่อนหลังเวลาส่งไปแล้ว → ไม่ส่งแบบนั้น (เช่น จอง ศ. 20:00 นัด ส. 07:30 → ไม่มีเตือนวันก่อน)
//   - เลยเวลาส่งเกิน 10 นาที → ข้าม (กันส่งย้อนหลังตอนเพิ่งเปิด server)
//   - มีแถวใน notifications แล้ว (sent หรือ failed) → ไม่ส่งซ้ำ
//   - เวลา "ตอนนี้" มาจาก clock.js → ตั้ง DEMO_NOW แล้ว cron ทำงานตามเวลาเดโม (O15ก)
//   - ผู้ป่วย seed (รหัส LINE ปลอม) → LINE ปฏิเสธ → บันทึก failed (O16ก)
//   - LINE_PUSH_ENABLED ไม่ใช่ true → พิมพ์ลง Terminal และบันทึก sent (P6ก — ไม่พิมพ์ซ้ำทุกนาที)
//
// ปุ่มเดโม D1 (sendReminderNow): ส่งทันที ไม่ดูกติกาข้างบน เช็กแค่นัดเป็น booked (P4ก)
//   บันทึก/อัปเดตแถว notifications ของ (นัด + แบบ) — กดซ้ำได้ อัปเดต sent_at (O17ก)

import cron from 'node-cron'
import { query } from '../db.js'
import { now, toThaiIso, bangkokTime, addDays } from './clock.js'
import { MINUTE_MS, SHORT_NOTICE_MS } from './rules.js'
import { reminderMessage, sendLineMessage, REMINDER_TYPES } from './lineMessages.js'
import { AppointmentError, toPatientAppointment } from '../services/appointments.js'

// ส่งช้ากว่าเวลาส่งได้ไม่เกินเท่านี้ (เลยแล้วข้าม)
const SEND_WINDOW_MS = 10 * MINUTE_MS
// เตือน 2 ชม.ก่อนนัด
const BEFORE_2H_MS = 2 * 60 * MINUTE_MS
// เลข id ที่ใหญ่สุดของคอลัมน์ INTEGER
const MAX_INTEGER = 2147483647

// นัด + เวลา + ข้อมูลผู้ป่วยที่ใช้ทำการ์ดเตือน
const SELECT_REMINDER_ROW = `
  SELECT a.appointment_id, a.status, a.created_at, a.updated_at,
         u.line_user_id, u.first_name, u.last_name,
         t.slot_date, t.start_time, t.end_time
  FROM appointments a
  JOIN time_slots t ON t.slot_id = a.slot_id
  JOIN users u ON u.user_id = a.user_id`

// เวลาที่ต้องส่งเตือนแต่ละแบบ (Date)
export function reminderSendTime(type, slotDate, startTime) {
  if (type === 'day_before') return bangkokTime(addDays(slotDate, -1), '07:00')
  return new Date(bangkokTime(slotDate, startTime).getTime() - BEFORE_2H_MS)
}

// นัดนี้ "ถึงเวลาส่ง" เตือนแบบ type ตอน currentTime ไหม (ยังไม่ดูว่าเคยส่งแล้วหรือยัง — SQL เช็กเอง)
// row ต้องมี status, slot_date, start_time, created_at, updated_at
export function isReminderDue(type, row, currentTime) {
  if (row.status !== 'booked') return false

  const appointmentTime = bangkokTime(row.slot_date, row.start_time)
  // เวลาจอง/เลื่อนล่าสุด (เลื่อนนัด = updated_at ใหม่ · จองใหม่ = created_at เท่ากับ updated_at)
  const bookedAt = Math.max(row.created_at.getTime(), row.updated_at.getTime())

  // นัดกระชั้น → ไม่เตือนเลย
  if (appointmentTime.getTime() - bookedAt < SHORT_NOTICE_MS) return false

  const sendTime = reminderSendTime(type, row.slot_date, row.start_time).getTime()
  // จอง/เลื่อนหลังเวลาส่งไปแล้ว → ไม่ส่งแบบนี้
  if (bookedAt >= sendTime) return false
  // ยังไม่ถึงเวลาส่ง หรือเลยมาเกิน 10 นาทีแล้ว → ไม่ส่ง
  const t = currentTime.getTime()
  return t >= sendTime && t < sendTime + SEND_WINDOW_MS
}

// แถวจากฐานข้อมูล → การ์ดเตือน
function buildReminder(type, row, currentTime) {
  const appointment = toPatientAppointment(row, currentTime)
  return reminderMessage(type, { firstName: row.first_name, lastName: row.last_name }, appointment)
}

// ส่งการ์ดหา 1 คน → 'sent' | 'failed' (ไม่ throw)
async function deliver(row, message) {
  try {
    // ผู้ป่วยที่ถูกล้างข้อมูล (PDPA) ไม่มีรหัส LINE → ส่งไม่ได้
    if (!row.line_user_id) throw new Error('ผู้ป่วยไม่มีรหัส LINE')
    await sendLineMessage(row.line_user_id, message)
    return 'sent'
  } catch (error) {
    console.error(`ส่งการ์ดเตือนไม่สำเร็จ (นัด #${row.appointment_id}, ผู้ป่วย ${row.line_user_id}):`, error.message)
    return 'failed'
  }
}

// ---------- 1) cron: ส่งเตือนที่ถึงเวลา ----------
// คืนจำนวนที่ส่ง { sent, failed }
export async function sendDueReminders(currentTime = now()) {
  // นัด booked ที่อยู่ในช่วง วันนี้ ถึง อีก 2 วัน (เวลาไทย) — เตือนวันก่อนของนัดพรุ่งนี้ + เตือน 2 ชม. ของนัดวันนี้
  const today = toThaiIso(currentTime).slice(0, 10)
  const result = await query(
    `${SELECT_REMINDER_ROW}
     WHERE a.status = 'booked' AND t.slot_date BETWEEN $1 AND $2
     ORDER BY t.slot_date, t.start_time`,
    [today, addDays(today, 2)]
  )

  const counts = { sent: 0, failed: 0 }
  for (const row of result.rows) {
    for (const type of REMINDER_TYPES) {
      if (!isReminderDue(type, row, currentTime)) continue

      const message = buildReminder(type, row, currentTime)
      // จองแถวไว้ก่อนส่ง (ON CONFLICT = มีแถวของนัด+แบบนี้แล้ว → ไม่ได้แถว → ข้าม)
      // ทำให้ส่งได้ครั้งเดียวแน่นอน แม้ cron 2 รอบทำงานซ้อนกัน
      const claimed = await query(
        `INSERT INTO notifications (appointment_id, type, message, sent_at, status)
         VALUES ($1, $2, $3, $4, 'sent')
         ON CONFLICT (appointment_id, type) DO NOTHING
         RETURNING notification_id`,
        [row.appointment_id, type, message.altText, currentTime]
      )
      if (claimed.rowCount === 0) continue

      const status = await deliver(row, message)
      if (status === 'failed') {
        await query(`UPDATE notifications SET status = 'failed' WHERE notification_id = $1`, [
          claimed.rows[0].notification_id,
        ])
      }
      counts[status] += 1
    }
  }
  return counts
}

// ---------- 2) cron: ล้างคิวที่ถือค้าง (M6ก) ----------
// คืนจำนวนคิวที่ล้าง
export async function releaseExpiredHolds(currentTime = now()) {
  const result = await query(
    `UPDATE time_slots
     SET slot_status = 'available', held_by_user_id = NULL, hold_expires_at = NULL
     WHERE slot_status = 'held' AND hold_expires_at <= $1`,
    [currentTime]
  )
  return result.rowCount
}

// ---------- D1: ปุ่มเดโม ส่งเตือนทันที ----------
// body = { appointmentId, type } → { sent, status, sentAt } (P2ก: LINE ไม่รับ → 200 sent:false status:'failed')
export async function sendReminderNow(body) {
  const { appointmentId, type } = body || {}
  const fields = {}
  if (!Number.isInteger(appointmentId) || appointmentId < 1 || appointmentId > MAX_INTEGER) {
    fields.appointmentId = 'ต้องเป็นเลขนัด'
  }
  if (!REMINDER_TYPES.includes(type)) fields.type = 'ต้องเป็น day_before หรือ before_2h'
  if (Object.keys(fields).length > 0) {
    throw new AppointmentError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', { fields })
  }

  const result = await query(`${SELECT_REMINDER_ROW} WHERE a.appointment_id = $1`, [appointmentId])
  const row = result.rows[0]
  if (!row) throw new AppointmentError(404, 'NOT_FOUND', 'ไม่พบนัดหมายนี้')
  if (row.status !== 'booked') throw new AppointmentError(409, 'INVALID_STATUS', 'นัดนี้ไม่อยู่ในสถานะยืนยันแล้ว')

  const currentTime = now()
  const message = buildReminder(type, row, currentTime)
  const status = await deliver(row, message)

  // บันทึกใหม่ หรือทับแถวเดิมของ (นัด + แบบ) — O17ก
  await query(
    `INSERT INTO notifications (appointment_id, type, message, sent_at, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (appointment_id, type)
     DO UPDATE SET message = EXCLUDED.message, sent_at = EXCLUDED.sent_at, status = EXCLUDED.status`,
    [appointmentId, type, message.altText, currentTime, status]
  )
  return { sent: status === 'sent', status, sentAt: toThaiIso(currentTime) }
}

// ---------- เริ่มตัวตั้งเวลา (index.js เรียกครั้งเดียวตอนเปิด server) ----------
// ทำงานทุก 1 นาที ('* * * * *' = ทุกนาที ทุกชั่วโมง ทุกวัน) ตามเวลาไทย
// running = กันรอบใหม่เริ่มขณะรอบเก่ายังไม่เสร็จ (เช่น LINE ตอบช้า)
let running = false

export async function runSchedulerOnce() {
  if (running) return
  running = true
  try {
    const currentTime = now()
    const released = await releaseExpiredHolds(currentTime)
    const { sent, failed } = await sendDueReminders(currentTime)
    if (released || sent || failed) {
      const time = toThaiIso(currentTime).slice(11, 16)
      console.log(`⏰ ${time} cron: ส่งเตือน ${sent} · ส่งไม่สำเร็จ ${failed} · ล้างคิวที่ถือค้าง ${released}`)
    }
  } catch (error) {
    // ต่อฐานข้อมูลไม่ได้ ฯลฯ → แค่พิมพ์ไว้ รอบหน้าลองใหม่ (server ไม่ดับ)
    console.error('cron ทำงานไม่สำเร็จ (จะลองใหม่นาทีหน้า):', error.message)
  } finally {
    running = false
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', runSchedulerOnce, { timezone: 'Asia/Bangkok' })
  console.log('⏰ เริ่ม cron แล้ว (ทุก 1 นาที: ส่งเตือนก่อนนัด + ล้างคิวที่ถือค้าง)')
  runSchedulerOnce() // ทำรอบแรกทันที ไม่ต้องรอขึ้นนาทีใหม่
}

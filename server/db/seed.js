// ใส่ข้อมูลตัวอย่าง (seed) ลงตารางที่ db:reset สร้างไว้
// วิธีรัน: ในโฟลเดอร์ server/ พิมพ์  npm run db:seed
//   ลำดับที่ถูกต้อง: npm run db:reset → npm run db:seed → รัน check.sql ใน Supabase (ต้องได้ 0 แถว)
//   ต้องมี SEED_STAFF_PASSWORD ใน server/.env (รหัส login หน้า admin — ตั้งเอง ไม่ขึ้น git)
//
// สิ่งที่ใส่ (นับวันจาก "วันที่รัน" เสมอ → รันเดือนไหนกราฟก็มีเส้นครบ):
//   staff 1 คน · ผู้ป่วยสมมติ 12 คน (line_user_id ขึ้นต้น seed-)
//   คิวเสาร์–อาทิตย์ ตั้งแต่วันที่ 1 ของ 5 เดือนก่อน ถึงวันนี้ + 14 วัน (วันละ 12 คิว)
//   นัดย้อนหลัง 5 เดือนเต็ม (ตัวเลขเท่ากับ mock) + เดือนนี้ + นัดล่วงหน้า
//   ไม่ใส่ notifications (ระบบส่งเตือนจริงทำสัปดาห์ 5) และไม่มีคิว held (ถือคิวหมดอายุใน 5 นาที)

import bcrypt from 'bcryptjs'
import { pool } from '../db.js'

// ===================================================================
// 1) ค่าตั้งต้น
// ===================================================================

const STAFF_USERNAME = 'staff'
const STAFF_NAME = 'staff' // ชื่อที่แสดงมุมขวาบนของหน้า admin
const BCRYPT_ROUNDS = 10 // ความแรงในการบด (ยิ่งมากยิ่งช้า) 10 = ค่าที่นิยม


// ผู้ป่วยสมมติชุดเดียวกับ mock.js (ชื่อ/เบอร์ไม่ใช่คนจริง) + เพศ/วันเกิดสมมติ (ประวัติต้องครบถึงจองได้)
const patients = [
  { firstName: 'สมหญิง', lastName: 'ใจดี', gender: 'female', birthDate: '1975-03-14', phone: '0891110001' },
  { firstName: 'ประเสริฐ', lastName: 'มั่นคง', gender: 'male', birthDate: '1962-08-02', phone: '0891110002' },
  { firstName: 'วันเพ็ญ', lastName: 'แสงทอง', gender: 'female', birthDate: '1988-11-25', phone: '0891110003' },
  { firstName: 'ธนากร', lastName: 'รุ่งเรือง', gender: 'male', birthDate: '1994-01-09', phone: '0891110004' },
  { firstName: 'มาลี', lastName: 'ศรีสุข', gender: 'female', birthDate: '1957-06-30', phone: '0891110005' },
  { firstName: 'สุรชัย', lastName: 'บุญมา', gender: 'male', birthDate: '1970-12-18', phone: '0891110006' },
  { firstName: 'กาญจนา', lastName: 'ทองดี', gender: 'female', birthDate: '1983-04-05', phone: '0891110007' },
  { firstName: 'วิชัย', lastName: 'พงษ์ไพร', gender: 'male', birthDate: '1966-09-21', phone: '0891110008' },
  { firstName: 'อรุณี', lastName: 'ชื่นใจ', gender: 'female', birthDate: '1999-02-27', phone: '0891110009' },
  { firstName: 'สมศักดิ์', lastName: 'เพียรดี', gender: 'male', birthDate: '1959-07-13', phone: '0891110010' },
  { firstName: 'นิภา', lastName: 'สายสุวรรณ', gender: 'female', birthDate: '1979-10-08', phone: '0891110011' },
  { firstName: 'ชัยวัฒน์', lastName: 'ดวงแก้ว', gender: 'male', birthDate: '1991-05-16', phone: '0891110012' },
]

// นัดย้อนหลัง: ตัวเลขเท่ากับ statsByMonthsAgo ใน client/src/lib/mock.js
// key = กี่เดือนก่อนเดือนนี้ · มา = booked ที่เลยเวลาแล้ว (ไม่มีสถานะแยก)
const pastMonthCounts = {
  1: { attended: 77, noShow: 6, cancelled: 7 }, // รวม 90
  2: { attended: 79, noShow: 7, cancelled: 9 }, // รวม 95
  3: { attended: 77, noShow: 8, cancelled: 6 }, // รวม 91
  4: { attended: 74, noShow: 9, cancelled: 7 }, // รวม 90
  5: { attended: 77, noShow: 11, cancelled: 8 }, // รวม 96
}

// 12 เวลาของวันเปิด (07:00–09:45 คิวละ 15 นาที)
const START_TIMES = ['07:00', '07:15', '07:30', '07:45', '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45']

// นัดล่วงหน้า — วันเปิดที่ 1, 2, 3, ... นับจากวันนี้ (ใส่ได้เฉพาะคิวที่ยังไม่ถึงเวลา)
// B = ยืนยันแล้ว (booked) · C = ยกเลิก · X = staff ปิดคิว (ไม่มีนัด)
// ผู้ป่วย 1 คนมีนัดที่ยังไม่ถึงเวลาได้ 1 นัด → B รวมทุกวัน = 12 = จำนวนผู้ป่วยพอดี
const futureDayPatterns = [
  { '07:00': 'B', '07:15': 'B', '07:30': 'C', '07:45': 'B', '08:00': 'B', '08:15': 'B', '08:30': 'B', '08:45': 'C', '09:00': 'B', '09:15': 'B', '09:30': 'B', '09:45': 'B' },
  { '07:00': 'B', '07:30': 'C', '08:45': 'X', '09:00': 'X' },
  { '07:15': 'B', '08:00': 'C' },
]

// ===================================================================
// 2) ตัวช่วยเรื่องวันที่ — คิดเป็นวันที่ไทยแบบข้อความ 'YYYY-MM-DD'
// ===================================================================

// เวลาปัจจุบัน — ขั้น F จะเปลี่ยนไปเรียก now() จาก server/lib/clock.js (รองรับ DEMO_NOW)
function getNow() {
  return new Date()
}

const DAY_MS = 24 * 60 * 60 * 1000
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

// Date → วันที่ไทย 'YYYY-MM-DD'
function bangkokDateOf(date) {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

// 'YYYY-MM-DD' บวก/ลบวัน
function addDays(dateString, days) {
  return new Date(Date.parse(`${dateString}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

// เสาร์หรืออาทิตย์?
function isOpenDay(dateString) {
  const dayOfWeek = new Date(`${dateString}T00:00:00Z`).getUTCDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

// วันที่ + เวลาไทย → Date (ส่งให้ pg เป็น Date เสมอ ไม่ประกอบข้อความเวลาเอง)
function bangkokTime(dateString, time) {
  return new Date(`${dateString}T${time}:00+07:00`)
}

// 'YYYY-MM-DD' → 'YYYY-MM'
function monthOf(dateString) {
  return dateString.slice(0, 7)
}

// 'YYYY-MM' ย้อนหลังกี่เดือน
function monthsBack(monthString, months) {
  const [year, month] = monthString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 - months, 1))
  return date.toISOString().slice(0, 7)
}

function minutesLater(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function earlier(a, b) {
  return a < b ? a : b
}

// สุ่มแบบตายตัว: ลำดับเดิมทุกครั้งที่รัน → ข้อมูล seed ออกมาเหมือนเดิม ตรวจตัวเลขซ้ำได้
function makeRandom(seedNumber) {
  let value = seedNumber
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648
    return value / 2147483648
  }
}

// ===================================================================
// 3) วางแผนข้อมูลทั้งหมดในหน่วยความจำก่อน (ยังไม่แตะฐานข้อมูล)
// ===================================================================

function buildPlan(now) {
  const today = bangkokDateOf(now)
  const thisMonth = monthOf(today)
  const firstDay = `${monthsBack(thisMonth, 5)}-01`
  const lastDay = addDays(today, 14)

  // ---------- คิวทุกวันเปิด ----------
  const slots = [] // { date, time, status, createdAt }
  const slotByKey = {} // 'YYYY-MM-DD HH:MM' → slot
  for (let date = firstDay; date <= lastDay; date = addDays(date, 1)) {
    if (!isOpenDay(date)) continue
    for (const time of START_TIMES) {
      // ระบบจริงสร้างคิวล่วงหน้า 14 วัน → created_at = 14 วันก่อนวันนั้น (แต่ไม่เกินตอนนี้)
      const createdAt = earlier(bangkokTime(addDays(date, -14), '00:00'), now)
      const slot = { date, time, status: 'available', createdAt }
      slots.push(slot)
      slotByKey[`${date} ${time}`] = slot
    }
  }

  const appointments = [] // { patientIndex, slot, status, createdAt, updatedAt, noShowAt }

  // นัดในอดีต: จองไว้ 2 วันก่อนนัด · ยกเลิก 1 วันก่อนนัด · ไม่มา = staff กด 10 นาทีหลังเวลานัด
  function addPastAppointment(patientIndex, slot, kind) {
    const appointmentTime = bangkokTime(slot.date, slot.time)
    const createdAt = new Date(appointmentTime.getTime() - 2 * DAY_MS)
    let status = 'booked'
    let updatedAt = createdAt
    let noShowAt = null
    if (kind === 'cancelled') {
      status = 'cancelled'
      updatedAt = new Date(appointmentTime.getTime() - DAY_MS)
    } else if (kind === 'noShow') {
      status = 'no_show'
      noShowAt = minutesLater(appointmentTime, 10)
      updatedAt = noShowAt
    }
    slot.status = statusOfSlotFor(status)
    appointments.push({ patientIndex, slot, status, createdAt, updatedAt, noShowAt })
  }

  // ---------- 5 เดือนก่อน: ตัวเลขเท่ากับ mock ----------
  for (const [monthsAgo, counts] of Object.entries(pastMonthCounts)) {
    const month = monthsBack(thisMonth, Number(monthsAgo))
    const days = [...new Set(slots.filter((s) => monthOf(s.date) === month).map((s) => s.date))]

    // รายการสถานะของเดือนนี้ แล้วสลับลำดับแบบตายตัว ให้ "ไม่มา"/"ยกเลิก" กระจายทั้งเดือน
    const kinds = [
      ...Array(counts.attended).fill('attended'),
      ...Array(counts.noShow).fill('noShow'),
      ...Array(counts.cancelled).fill('cancelled'),
    ]
    const random = makeRandom(Number(monthsAgo))
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
    }

    // เติมคิวเช้าก่อน วนทีละวัน: นัดที่ 1 → วันที่ 1 07:00, นัดที่ 2 → วันที่ 2 07:00, ...
    kinds.forEach((kind, index) => {
      const date = days[index % days.length]
      const time = START_TIMES[Math.floor(index / days.length)]
      const patientIndex = (index * 5 + Number(monthsAgo)) % patients.length
      addPastAppointment(patientIndex, slotByKey[`${date} ${time}`], kind)
    })
  }

  // ---------- เดือนนี้ (วันเปิดที่ผ่านมาแล้ว): วันละ 5 นัด มา 4 ยกเลิก 1 ----------
  // วันล่าสุด 1 นัดเป็น "ไม่มา" → 4 วัน = มา 15 ไม่มา 1 ยกเลิก 4 (เท่ากับ mock)
  const pastDaysThisMonth = [...new Set(
    slots.filter((s) => monthOf(s.date) === thisMonth && s.date < today).map((s) => s.date)
  )]
  pastDaysThisMonth.forEach((date, dayIndex) => {
    const isLatestDay = dayIndex === pastDaysThisMonth.length - 1
    const kinds = ['attended', isLatestDay ? 'noShow' : 'attended', 'attended', 'attended', 'cancelled']
    kinds.forEach((kind, index) => {
      const patientIndex = (dayIndex * 5 + index) % patients.length
      addPastAppointment(patientIndex, slotByKey[`${date} ${START_TIMES[index]}`], kind)
    })
  })

  // ---------- นัดล่วงหน้า (วันนี้เป็นต้นไป) ----------
  // จองไว้ก่อนตอนนี้อย่างน้อย 1 วัน และก่อนนัดอย่างน้อย 2 วัน → ไม่เป็นนัดกระชั้น
  const futureDays = [...new Set(slots.filter((s) => s.date >= today).map((s) => s.date))]
  let nextPatient = 0
  const oneDayBeforeNow = new Date(Math.floor((now.getTime() - DAY_MS) / 60000) * 60000)
  futureDayPatterns.forEach((pattern, dayIndex) => {
    const date = futureDays[dayIndex]
    if (!date) return
    for (const [time, mark] of Object.entries(pattern)) {
      const slot = slotByKey[`${date} ${time}`]
      const appointmentTime = bangkokTime(date, time)
      // คิวที่ถึงเวลาแล้ว (รัน seed เช้าวันเสาร์) ข้ามไป ไม่ใส่นัด
      if (appointmentTime.getTime() <= now.getTime() + 60 * 60 * 1000) continue

      if (mark === 'X') {
        slot.status = 'closed'
        continue
      }
      // ปัดเป็นนาทีเต็ม (ดูใน Table Editor ง่ายกว่า) และให้แต่ละนัดห่างกัน 7 นาที
      const createdAt = earlier(
        new Date(appointmentTime.getTime() - 2 * DAY_MS),
        minutesLater(oneDayBeforeNow, -7 * appointments.length % (24 * 60))
      )
      if (mark === 'B') {
        slot.status = 'booked'
        appointments.push({ patientIndex: nextPatient++ % patients.length, slot, status: 'booked', createdAt, updatedAt: createdAt, noShowAt: null })
      } else {
        // ยกเลิกหลังจอง 1 ชั่วโมง → คิวกลับเป็นว่าง · ผู้ป่วยที่ยกเลิกไม่นับเป็นนัด active
        appointments.push({ patientIndex: (appointments.length * 7) % patients.length, slot, status: 'cancelled', createdAt, updatedAt: minutesLater(createdAt, 60), noShowAt: null })
      }
    }
  })

  // ผู้ป่วยกดยินยอม + กรอกประวัติ 7 วันก่อนวันแรกของข้อมูล (ห่างกันคนละ 1 ชั่วโมง)
  const users = patients.map((patient, index) => {
    const createdAt = minutesLater(bangkokTime(addDays(firstDay, -7), '09:00'), index * 60)
    return { ...patient, lineUserId: `seed-${String(index + 1).padStart(2, '0')}`, createdAt }
  })

  return { today, firstDay, lastDay, users, slots, appointments }
}

// สถานะคิวที่คู่กับสถานะนัด (ต้องตรงกับ check.sql ข้อ 3–4)
// ไม่มา → คิวคง booked (ตกลง 12 ต.ค.): เวลาผ่านแล้วไม่มีใครจองต่อได้ + กด [ไม่มา]/[แก้คืน] แก้แค่ตารางนัด
function statusOfSlotFor(appointmentStatus) {
  if (appointmentStatus === 'booked' || appointmentStatus === 'no_show') return 'booked'
  return 'available' // ยกเลิก → คิวว่าง
}

// ===================================================================
// 4) ตัวช่วย INSERT หลายแถวในคำสั่งเดียว (เร็วกว่ายิงทีละแถวมาก)
//    rows = [[ค่าคอลัมน์1, ค่าคอลัมน์2, ...], ...] → VALUES ($1,$2),($3,$4),... (ยังใช้ $n ไม่ต่อข้อความ)
// ===================================================================

async function insertMany(client, table, columns, rows, returning = '') {
  if (rows.length === 0) return []
  const params = []
  const valueGroups = rows.map((row) => {
    const placeholders = row.map((value) => {
      params.push(value)
      return `$${params.length}`
    })
    return `(${placeholders.join(', ')})`
  })
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueGroups.join(', ')}${returning ? ` RETURNING ${returning}` : ''}`
  const { rows: inserted } = await client.query(sql, params)
  return inserted
}

// ===================================================================
// 5) เริ่มทำงาน
// ===================================================================

const password = process.env.SEED_STAFF_PASSWORD
if (!password || !password.trim()) {
  console.error('❌ ยังไม่ได้ตั้งรหัส staff — เพิ่มบรรทัด SEED_STAFF_PASSWORD=รหัสที่ต้องการ ใน server/.env แล้วรันใหม่')
  await pool.end()
  process.exit(1)
}

const client = await pool.connect()
try {
  // ---------- ตารางต้องว่างก่อน (คำสั่งที่ลบข้อมูลมีแค่ db:reset ตัวเดียว) ----------
  const { rows: countRows } = await client.query(`
    SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM staff)
         + (SELECT count(*) FROM time_slots) + (SELECT count(*) FROM appointments)
         + (SELECT count(*) FROM notifications) AS total
  `)
  if (countRows[0].total > 0) {
    console.error('❌ ตารางมีข้อมูลอยู่แล้ว — ไม่ได้ใส่อะไรเพิ่ม')
    console.error('   ถ้าต้องการเริ่มใหม่: npm run db:reset แล้วค่อย npm run db:seed')
    process.exitCode = 1
  } else {
    const now = getNow()
    const plan = buildPlan(now)
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    // ทุกตารางใน transaction เดียว: ผ่านหมด หรือไม่เปลี่ยนอะไรเลย
    await client.query('BEGIN')

    await insertMany(client, 'staff', ['username', 'password', 'name'], [[STAFF_USERNAME, passwordHash, STAFF_NAME]])

    const insertedUsers = await insertMany(
      client,
      'users',
      ['line_user_id', 'first_name', 'last_name', 'gender', 'birth_date', 'phone', 'pdpa_accepted_at', 'created_at', 'updated_at'],
      plan.users.map((u) => [u.lineUserId, u.firstName, u.lastName, u.gender, u.birthDate, u.phone, u.createdAt, u.createdAt, u.createdAt]),
      'user_id, line_user_id'
    )
    const userIdOfLine = Object.fromEntries(insertedUsers.map((r) => [r.line_user_id, r.user_id]))

    const insertedSlots = await insertMany(
      client,
      'time_slots',
      ['slot_date', 'start_time', 'end_time', 'slot_status', 'created_at'],
      plan.slots.map((s) => [s.date, s.time, endTimeOf(s.time), s.status, s.createdAt]),
      'slot_id, slot_date, start_time'
    )
    // start_time จาก pg เป็น 'HH:MM:SS' → ตัดเหลือ 'HH:MM'
    const slotIdOfKey = Object.fromEntries(insertedSlots.map((r) => [`${r.slot_date} ${r.start_time.slice(0, 5)}`, r.slot_id]))

    await insertMany(
      client,
      'appointments',
      ['user_id', 'slot_id', 'status', 'no_show_at', 'created_at', 'updated_at'],
      plan.appointments.map((a) => [
        userIdOfLine[plan.users[a.patientIndex].lineUserId],
        slotIdOfKey[`${a.slot.date} ${a.slot.time}`],
        a.status,
        a.noShowAt,
        a.createdAt,
        a.updatedAt,
      ])
    )

    await client.query('COMMIT')
    printSummary(plan)
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('❌ ใส่ข้อมูลไม่สำเร็จ — ย้อนกลับแล้ว ตารางยังว่างเหมือนเดิม')
  console.error('   สาเหตุ:', err.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

// เวลาจบคิว = เวลาเริ่ม + 15 นาที ('07:45' → '08:00')
function endTimeOf(time) {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + 15
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// สรุปผลใน Terminal — ตัวเลขรายเดือนไว้เทียบกับหน้าสถิติตอนขั้น J
function printSummary(plan) {
  const nowMs = getNow().getTime()
  console.log(`✅ ใส่ข้อมูลตัวอย่างเรียบร้อย (ข้อมูลวันที่ ${plan.firstDay} ถึง ${plan.lastDay})`)
  console.log(`   staff 1 · ผู้ป่วย ${plan.users.length} · คิว ${plan.slots.length} · นัด ${plan.appointments.length} · แจ้งเตือน 0`)
  console.log('   นัดแยกตามเดือนของวันนัด (ใช้เทียบหน้าสถิติ):')
  const byMonth = {}
  for (const a of plan.appointments) {
    const month = monthOf(a.slot.date)
    byMonth[month] ??= { total: 0, attended: 0, noShow: 0, cancelled: 0, upcoming: 0 }
    const row = byMonth[month]
    row.total++
    if (a.status === 'cancelled') row.cancelled++
    else if (a.status === 'no_show') row.noShow++
    else if (bangkokTime(a.slot.date, a.slot.time).getTime() <= nowMs) row.attended++
    else row.upcoming++
  }
  for (const [month, r] of Object.entries(byMonth).sort()) {
    console.log(`   ${month}  ทั้งหมด ${r.total} · มา ${r.attended} · ไม่มา ${r.noShow} · ยกเลิก ${r.cancelled} · ยังไม่ถึงเวลา ${r.upcoming}`)
  }
  console.log('   ขั้นต่อไป: เปิด check.sql ใน SQL Editor ของ Supabase → Run → ต้องได้ 0 แถว')
}

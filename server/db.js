// ตัวเชื่อมฐานข้อมูล (Supabase / PostgreSQL) — ทุกไฟล์ที่ต้องคุยกับฐานข้อมูลให้ import จากที่นี่ที่เดียว
// ใช้แพ็กเกจ pg (node-postgres) ต่อผ่าน Session pooler ของ Supabase
// ที่อยู่ + รหัสผ่านอยู่ใน server/.env (DATABASE_URL) — ห้ามเขียนลงในโค้ด

import pg from 'pg'

const { Pool, types } = pg

// ---------- เช็กว่าตั้ง DATABASE_URL แล้ว ----------
// ถ้าลืมสร้าง .env หรือลืมใส่ค่า pg จะไปต่อเครื่องตัวเองแทน แล้วขึ้น error ที่อ่านยาก
// จึงหยุดตั้งแต่ตอนเปิด server พร้อมบอกวิธีแก้เป็นภาษาไทย
if (!process.env.DATABASE_URL) {
  throw new Error(
    'ยังไม่ได้ตั้ง DATABASE_URL → ก๊อป server/.env.example เป็น server/.env แล้วใส่ค่าจาก Supabase (ปุ่ม Connect → Session pooler)'
  )
}

// ---------- แปลงชนิดข้อมูลที่ได้จากฐานข้อมูล (ทำที่จุดเดียว ทุก query ได้ผลเหมือนกัน) ----------
// ปกติ pg ส่งบางชนิดกลับมาเป็นข้อความ หรือเป็นแบบที่ทำให้เวลาเพี้ยน จึงตั้งใหม่ตรงนี้
// (ตัวเลขด้านซ้ายคือรหัสชนิดข้อมูลของ PostgreSQL)

// BIGINT (20) เช่นผลของ COUNT(*) → ปกติได้ "12" (ข้อความ) → แปลงเป็นเลข 12
types.setTypeParser(20, (value) => parseInt(value, 10))

// NUMERIC (1700) เช่นผลหาร / ROUND ในสถิติ → ปกติได้ "12.5" (ข้อความ) → แปลงเป็นเลข 12.5
types.setTypeParser(1700, (value) => parseFloat(value))

// DATE (1082) เช่น slot_date → ปกติ pg แปลงเป็น Date ตอนเที่ยงคืน "ตามโซนเวลาของเครื่อง"
// ซึ่งพอส่งเป็น JSON อาจกลายเป็นวันก่อนหน้า → เก็บเป็นข้อความ "2026-10-17" ตามที่ API contract ใช้
types.setTypeParser(1082, (value) => value)

// (TIME เช่น start_time ได้เป็นข้อความ "07:00:00" อยู่แล้ว · TIMESTAMPTZ ได้เป็น Date ซึ่งถูกต้อง)

// ---------- สร้าง pool ----------
// pool = เก็บการเชื่อมต่อไว้ใช้ซ้ำ ไม่ต้องต่อใหม่ทุกคำขอ (เหมือนร้านมีโทรศัพท์ไว้ไม่กี่เครื่อง ใช้เสร็จวางคืน)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // เข้ารหัสการเชื่อมต่อเสมอ (Supabase แนะนำ) — แบบ require: เข้ารหัสแต่ไม่ตรวจใบรับรอง
  // ถ้าต่อแบบไม่เข้ารหัสไม่ได้ pg จะไม่ยอมส่งข้อมูล
  ssl: { rejectUnauthorized: false },

  // ต่อพร้อมกันได้สูงสุด 5 สาย — คลินิกมี staff 1 คน + ผู้ป่วยไม่กี่คนพร้อมกัน 5 ก็เหลือ
  // และ Session pooler แพ็กเกจฟรีมีช่องจำกัด จึงไม่ตั้งเยอะ
  max: 5,

  // สายที่ว่างเกิน 30 วินาทีให้ปิดไป (คืนช่องให้ Supabase)
  idleTimeoutMillis: 30_000,

  // ต่อไม่ติดภายใน 10 วินาที → ถือว่าล้มเหลว (ไม่ให้คำขอค้างนาน เช่น ตอนเน็ตหลุด)
  connectionTimeoutMillis: 10_000,
})

// ถ้าสายที่ว่างอยู่หลุดเอง (เช่น Supabase ตัดสาย / เน็ตหลุด) ให้แค่บันทึกไว้
// ถ้าไม่มีบรรทัดนี้ server จะดับทั้งตัว
pool.on('error', (err) => {
  console.error('การเชื่อมต่อฐานข้อมูลหลุด (pool จะต่อใหม่เองเมื่อมีคำขอถัดไป):', err.message)
})

// ---------- ฟังก์ชันส่งคำสั่ง SQL ----------
// วิธีใช้: const result = await query('SELECT * FROM users WHERE user_id = $1', [userId])
//   - $1, $2 … คือช่องใส่ค่า ค่าจริงอยู่ในอาร์เรย์ตัวที่ 2 (กันการโจมตี SQL injection — ห้ามต่อข้อความเอง)
//   - result.rows = แถวที่ได้ (อาร์เรย์ของ object ชื่อคอลัมน์เป็น snake_case ตามฐานข้อมูล)
export function query(text, params) {
  return pool.query(text, params)
}

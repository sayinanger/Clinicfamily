// สร้างตารางใหม่ทั้งหมดจาก schema.sql (⚠️ ข้อมูลเดิมหายทุกแถว)
// วิธีรัน: ในโฟลเดอร์ server/ พิมพ์  npm run db:reset
//   (ต้องรันผ่าน npm เพราะ script ใส่ --env-file-if-exists=.env ให้ ถึงจะอ่าน DATABASE_URL ได้)

import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { pool } from '../db.js'

// ---------- 1) บอกว่ากำลังจะลบฐานข้อมูลไหน (ไม่แสดงรหัสผ่าน) ----------
let target = '(อ่านที่อยู่ไม่ได้)'
try {
  const url = new URL(process.env.DATABASE_URL)
  target = `${url.hostname} / ${url.pathname.slice(1)}`
} catch {
  // อ่านไม่ได้ก็แค่แสดงข้อความด้านบน ไม่ต้องหยุด
}

// ---------- 2) ถามยืนยันก่อน (กันกด Enter พลาด) ----------
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question(
  `⚠️  จะลบตารางทั้งหมดใน ${target} แล้วสร้างใหม่ (ข้อมูลหายทุกแถว)\n   พิมพ์ yes เพื่อยืนยัน: `
)
rl.close()

if (answer.trim().toLowerCase() !== 'yes') {
  console.log('ยกเลิกแล้ว — ไม่ได้เปลี่ยนอะไรในฐานข้อมูล')
  await pool.end()
  process.exit(0)
}

// ---------- 3) อ่าน schema.sql แล้วส่งทั้งไฟล์ใน transaction เดียว ----------
// transaction = ผ่านหมดทุกคำสั่ง หรือถ้ามีคำสั่งไหนผิด ย้อนกลับทั้งหมด (ไม่มีตารางสร้างค้างครึ่ง ๆ)
const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
const client = await pool.connect() // ยืมสายจาก pool มา 1 สาย (transaction ต้องใช้สายเดียวตลอด)

try {
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')

  // นับตารางที่ได้ เพื่อให้เห็นผลใน Terminal ทันที
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'staff', 'time_slots', 'appointments', 'notifications')
    ORDER BY table_name
  `)
  console.log(`✅ สร้างตารางใหม่เรียบร้อย ${rows.length} ตาราง: ${rows.map((r) => r.table_name).join(', ')}`)
} catch (err) {
  await client.query('ROLLBACK')
  console.error('❌ สร้างตารางไม่สำเร็จ — ย้อนกลับแล้ว ฐานข้อมูลยังเหมือนเดิม')
  console.error('   สาเหตุ:', err.message)
  process.exitCode = 1
} finally {
  client.release() // คืนสายให้ pool
  await pool.end() // ปิด pool เพื่อให้โปรแกรมจบ (ไม่ค้างใน Terminal)
}

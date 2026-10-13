// สร้าง Rich Menu (เมนูด้านล่างแชท LINE) ด้วย Messaging API — O9ก
// รัน: npm run richmenu (ในโฟลเดอร์ server/) · ต้องตั้ง LINE_CHANNEL_ACCESS_TOKEN และ LIFF_ID ใน server/.env ก่อน
// รันซ้ำได้ทุกเมื่อ (เช่น เปลี่ยนรูป / เปลี่ยน LIFF ID): สคริปต์ลบเมนูเดิมที่ชื่อเดียวกันแล้วสร้างใหม่
//
// รูป: server/assets/richmenu.jpg (หรือ .png) — ผู้ใช้ออกแบบเอง (O8) กว้าง 800–2500 px, กว้าง÷สูง ≥ 1.45, ไม่เกิน 1 MB
// พื้นที่กด 5 ปุ่ม (O6) วัดจากรูป 1527×1030 แล้วเก็บเป็น "สัดส่วน" → ถ้าเปลี่ยนรูปขนาดอื่นแต่หน้าตาเดิมก็ยังตรง
//   ┌──────────────┬──────────────┬─────────────┐
//   │ ประวัติส่วนตัว   │ ดูสถานะคิว     │             │
//   ├──────────────┼──────────────┤   จองคิว     │
//   │ ยกเลิก/เลื่อนนัด │ ติดต่อคลินิก    │             │
//   └──────────────┴──────────────┴─────────────┘
// ปุ่มลิงก์ (uri) เปิดหน้า LIFF · ปุ่ม postback ส่งรหัสไปที่ webhook (ไม่มีข้อความขึ้นในแชทฝั่งผู้ป่วย)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MENU_NAME = 'Clinicfamily main'
const API = 'https://api.line.me/v2/bot'
const DATA_API = 'https://api-data.line.me/v2/bot' // อัปโหลดรูปใช้คนละโดเมน
const MAX_IMAGE_BYTES = 1024 * 1024

// เส้นแบ่งในรูป (สัดส่วนของความกว้าง/สูง) — วัดจากรูปจริง: x 508 และ 965 จาก 1527, y 537 จาก 1030
const COLUMN_SPLIT = 508 / 1527 // ระหว่างคอลัมน์ซ้าย กับ คอลัมน์กลาง
const RIGHT_PANEL = 965 / 1527 // เริ่มปุ่ม "จองคิว"
const ROW_SPLIT = 537 / 1030 // ระหว่างแถวบน กับ แถวล่าง

const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
const liffId = (process.env.LIFF_ID || '').trim()

function stop(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

if (!token) stop('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน server/.env')
if (!liffId) stop('ยังไม่ได้ตั้ง LIFF_ID ใน server/.env (LINE Developers → Clinicfamily Login → แท็บ LIFF)')

// ---------- หาไฟล์รูป ----------
const assetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const imageName = ['richmenu.jpg', 'richmenu.jpeg', 'richmenu.png'].find((name) => fs.existsSync(path.join(assetsDir, name)))
if (!imageName) stop('ไม่พบรูป server/assets/richmenu.jpg หรือ richmenu.png')
const image = fs.readFileSync(path.join(assetsDir, imageName))
const contentType = imageName.endsWith('.png') ? 'image/png' : 'image/jpeg'
if (image.length > MAX_IMAGE_BYTES) stop(`รูปใหญ่ ${(image.length / 1024).toFixed(0)} KB — LINE รับไม่เกิน 1024 KB (บีบไฟล์ให้เล็กลงก่อน)`)

// อ่านกว้าง×สูงจากหัวไฟล์ (ไม่ต้องลงไลบรารีเพิ่ม)
function imageSize(buffer) {
  if (contentType === 'image/png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  // JPEG: ไล่หา marker SOF (0xC0–0xCF ยกเว้น C4, C8, CC) ที่เก็บขนาดรูป
  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  stop('อ่านขนาดรูป JPEG ไม่ได้')
}

const { width, height } = imageSize(image)
if (width < 800 || width > 2500 || height < 250 || width / height < 1.45) {
  stop(`ขนาดรูป ${width}×${height} ใช้ไม่ได้ — กว้าง 800–2500 px, สูง ≥ 250 px, กว้าง÷สูง ≥ 1.45`)
}

// ---------- พื้นที่กด ----------
const x1 = Math.round(width * COLUMN_SPLIT)
const x2 = Math.round(width * RIGHT_PANEL)
const y1 = Math.round(height * ROW_SPLIT)
const liff = (page) => ({ type: 'uri', uri: `https://liff.line.me/${liffId}${page}` })
const postback = (action, label) => ({ type: 'postback', data: `action=${action}`, label })

const areas = [
  { bounds: { x: 0, y: 0, width: x1, height: y1 }, action: liff('/profile') }, // ประวัติส่วนตัว
  { bounds: { x: x1, y: 0, width: x2 - x1, height: y1 }, action: postback('status', 'ดูสถานะคิว') },
  { bounds: { x: 0, y: y1, width: x1, height: height - y1 }, action: liff('/appointment') }, // ยกเลิก/เลื่อนนัด
  { bounds: { x: x1, y: y1, width: x2 - x1, height: height - y1 }, action: postback('contact', 'ติดต่อคลินิก') },
  { bounds: { x: x2, y: 0, width: width - x2, height }, action: liff('/booking') }, // จองคิว
]

// ---------- เรียก LINE ----------
async function line(method, url, body, headers = { 'Content-Type': 'application/json' }) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : headers['Content-Type'] === 'application/json' ? JSON.stringify(body) : body,
  })
  const text = await response.text()
  if (!response.ok) stop(`LINE ตอบ ${response.status} ที่ ${url}\n${text}`)
  return text ? JSON.parse(text) : {}
}

// 1) ลบเมนูเดิมของสคริปต์นี้ (ชื่อเดียวกัน) — กันเมนูค้างสะสม
const { richmenus = [] } = await line('GET', `${API}/richmenu/list`)
for (const menu of richmenus.filter((m) => m.name === MENU_NAME)) {
  await line('DELETE', `${API}/richmenu/${menu.richMenuId}`)
  console.log(`ลบเมนูเดิม ${menu.richMenuId}`)
}

// 2) สร้างเมนู (selected: true = เปิดเมนูค้างไว้ตอนเข้าแชท)
const { richMenuId } = await line('POST', `${API}/richmenu`, {
  size: { width, height },
  selected: true,
  name: MENU_NAME,
  chatBarText: 'เมนู',
  areas,
})

// 3) อัปโหลดรูป
await line('POST', `${DATA_API}/richmenu/${richMenuId}/content`, image, { 'Content-Type': contentType })

// 4) ตั้งเป็นเมนูหลักของทุกคน
await line('POST', `${API}/user/all/richmenu/${richMenuId}`)

console.log(`✅ ตั้ง Rich Menu แล้ว (${richMenuId}) รูป ${imageName} ${width}×${height}`)
console.log('   เปิดแชท LINE OA ใหม่ (ปิดแล้วเปิด) จะเห็นเมนูด้านล่าง')

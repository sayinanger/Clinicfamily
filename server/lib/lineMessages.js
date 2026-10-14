// ข้อความ LINE ถึงผู้ป่วย — ขั้น N (ยืนยันจอง/ยกเลิก/เลื่อน) + รอบ LINE ชุด O (ส่งจริง + ข้อความตอบปุ่มเมนู)
//
// ส่งได้ 2 แบบ (Messaging API ของ LINE Official Account "คลินิกครอบครัว"):
//   push  = server ส่งเองเมื่อไหร่ก็ได้ (ยืนยันจอง/ยกเลิก/เลื่อน, เตือนก่อนนัดในชุด P) → นับโควตาข้อความของ OA
//   reply = ตอบกลับทันทีเมื่อผู้ป่วยแอดเพื่อน/กดปุ่มเมนู (ใช้ replyToken จาก webhook) → ไม่นับโควตา
// O1ค: ข้อความเกี่ยวกับนัดเป็นการ์ด (Flex Message) · ข้อความต้อนรับ/ติดต่อคลินิก/ไม่มีนัด เป็นข้อความธรรมดา
// O5ก: LINE_PUSH_ENABLED=false → push แค่พิมพ์ลง Terminal เหมือนขั้น N (ทดสอบ Postman/บัตรทดสอบไม่เสียโควตา)
// N2ก: ส่งไม่สำเร็จ → การจอง/ยกเลิก/เลื่อนยังสำเร็จตามปกติ แค่พิมพ์ error ไว้ (notifyPatient จัดการ)

import { now, toThaiIso } from './clock.js'
import { CLINIC_PHONE } from './rules.js'

// ---------- ค่าตั้งจาก server/.env ----------
// Channel access token (long-lived — O14ก) ของ Messaging API channel "คลินิกครอบครัว" (ค่าลับ)
const ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
// O5ก: true = push ส่งเข้า LINE จริง · อื่น ๆ = พิมพ์ลง Terminal
export const PUSH_ENABLED = process.env.LINE_PUSH_ENABLED === 'true'
// LIFF ID (ใช้สร้างลิงก์ https://liff.line.me/<LIFF ID>/booking ในข้อความ และในสคริปต์ Rich Menu)
export const LIFF_ID = (process.env.LIFF_ID || '').trim()

// ชื่อคลินิกในข้อความ (ชื่อเดียวกับ LINE OA และ VITE_CLINIC_NAME ฝั่งหน้าเว็บ)
const CLINIC_NAME = 'คลินิกครอบครัว'

// ที่อยู่ API ของ LINE (เอกสาร Messaging API: Send push message / Send reply message)
const PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply'
const PROFILE_URL = 'https://api.line.me/v2/bot/profile/' // + userId → ชื่อที่แสดงใน LINE (เฉพาะคนที่เป็นเพื่อน OA)

// เตือนตอนเปิด server ถ้ายังตั้งค่าไม่ครบ (server ยังเปิดได้)
export function warnLineMessagingSettings() {
  if (!ACCESS_TOKEN) {
    console.warn('⚠️  ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน server/.env → ส่ง/ตอบข้อความ LINE ไม่ได้ (พิมพ์ลง Terminal แทน)')
  }
  if (!process.env.LINE_CHANNEL_SECRET) {
    console.warn('⚠️  ยังไม่ได้ตั้ง LINE_CHANNEL_SECRET ใน server/.env → รับ webhook จาก LINE ไม่ได้')
  }
  if (!LIFF_ID) {
    console.warn('⚠️  ยังไม่ได้ตั้ง LIFF_ID ใน server/.env → ข้อความที่ต้องมีลิงก์หน้าจองจะไม่มีลิงก์')
  }
  if (!PUSH_ENABLED) {
    console.log('ℹ️  LINE_PUSH_ENABLED ไม่ใช่ true → ข้อความยืนยันจอง/ยกเลิก/เลื่อน และการ์ดเตือน พิมพ์ลง Terminal (ไม่ส่งเข้า LINE)')
  }
}

// ลิงก์เปิดหน้า LIFF เช่น liffLink('/booking') → https://liff.line.me/<LIFF ID>/booking
export function liffLink(path) {
  return LIFF_ID ? `https://liff.line.me/${LIFF_ID}${path}` : ''
}

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const GENDER_TEXT = { male: 'ชาย', female: 'หญิง', unspecified: 'ไม่ระบุ' }

// '2026-10-17' → 'วันเสาร์ที่ 17 ต.ค. 2569'
export function thaiDateText(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `วัน${THAI_DAYS[weekday]}ที่ ${day} ${THAI_MONTHS[month - 1]} ${year + 543}`
}

// ---------- การ์ดนัดหมาย (Flex Message — O1ค, C1ก ตามภาพตัวอย่าง flex-card-mock.png, C2ก ไม่มีปุ่ม) ----------
// ข้อความเกี่ยวกับนัด (ยืนยันจอง/ยกเลิก/เลื่อน/ดูสถานะ + เตือนในชุด P) ส่งเป็น "การ์ด"
// ข้อความต้อนรับ/ติดต่อคลินิก/ไม่มีนัด ยังเป็นข้อความธรรมดา
// การ์ด = JSON ตามรูปแบบ Flex Message ของ LINE (กล่อง box ซ้อนกัน มี text อยู่ข้างใน)
//   altText = ข้อความสั้นที่ขึ้นในแจ้งเตือนบนหน้าจอล็อก / รายการแชท (การ์ดแสดงที่นั่นไม่ได้)
//   ฟอนต์เป็นของมือถือแต่ละเครื่อง (ใช้ Sarabun ไม่ได้)

// สีเดียวกับหน้าเว็บ (client/src/index.css) และ Rich Menu
const COLOR = {
  green: '#2B552F', // หัวการ์ด / เวลานัด
  greenLight: '#BAD5A8',
  greenSoft: '#EFF4EB',
  greenSub: '#CFEBBC', // ตัวหนังสือรองบนหัวเขียว
  gray: '#6B6B6B', // หัวการ์ดยกเลิก
  orange: '#B5651D', // หัวการ์ดเตือน (ชุด P)
  muted: '#868686',
  text: '#111111',
  note: '#333333',
  red: '#C62828',
  line: '#E5E5E5',
}

// '2026-10-18' → '18 ต.ค.' (ใช้ใน altText)
function shortDateText(dateString) {
  const [, month, day] = dateString.split('-').map(Number)
  return `${day} ${THAI_MONTHS[month - 1]}`
}

// ข้อความ 1 บรรทัดในการ์ด
function cardText(text, options = {}) {
  return { type: 'text', text, size: 'sm', color: COLOR.note, wrap: true, ...options }
}

// แถว "หัวข้อ  ค่า" เช่น ชื่อ  ตัน บิน
function cardRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [cardText(label, { color: COLOR.muted, flex: 2 }), cardText(value, { color: COLOR.text, flex: 5 })],
  }
}

// แถวสถานะ + ป้ายมุมมน (ยืนยันแล้ว = เขียว · ยกเลิก = เทา)
function statusRow(label, cancelled = false) {
  const badge = {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    backgroundColor: cancelled ? '#F1F1F1' : COLOR.greenSoft,
    borderColor: cancelled ? '#CCCCCC' : COLOR.greenLight,
    borderWidth: '1px',
    cornerRadius: 'xl',
    paddingStart: '8px',
    paddingEnd: '8px',
    paddingTop: '1px',
    paddingBottom: '1px',
    contents: [cardText(label, { size: 'xs', color: cancelled ? '#666666' : COLOR.green, wrap: false })],
  }
  return {
    type: 'box',
    layout: 'horizontal',
    alignItems: 'center',
    contents: [
      cardText('สถานะ', { color: COLOR.muted, flex: 2 }),
      // justifyContent flex-start + ป้าย flex 0 = ป้ายกว้างเท่าตัวหนังสือ ชิดซ้าย
      { type: 'box', layout: 'horizontal', flex: 5, justifyContent: 'flex-start', contents: [badge] },
    ],
  }
}

// บรรทัดหมายเหตุใต้เส้นคั่น: เส้นตาย (เลยแล้ว = สีแดง) + มาถึงก่อน + มาช้า 5 นาที
function changeRuleTexts(appointment) {
  const deadlineText = appointment.changeDeadline.slice(11, 16) // '2026-10-17T07:15:00+07:00' → '07:15'
  return [
    appointment.canChange
      ? cardText(`ยกเลิกหรือเลื่อนได้ก่อน ${deadlineText} น.`)
      : cardText('นัดนี้ยกเลิกหรือเลื่อนผ่านระบบไม่ได้ หากมาไม่ได้ กรุณาโทรแจ้งคลินิก', { color: COLOR.red }),
    cardText('กรุณามาถึงก่อนเวลานัด'), // O2-1ข
    cardText('หากมาช้าเกิน 5 นาที อาจถือว่าไม่มาตามนัด'),
  ]
}

// โครงการ์ด: หัวสี (ชื่อเรื่อง + ชื่อคลินิก) + เนื้อหา
// export ให้ชุด P ใช้ทำการ์ดเตือน (headerColor: COLOR.orange)
export function appointmentCard({ title, subtitle = CLINIC_NAME, headerColor = COLOR.green, altText, body }) {
  const subColor = headerColor === COLOR.green ? COLOR.greenSub : '#EEEEEE'
  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerColor,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: subtitle, color: subColor, size: 'xs', margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm', contents: body },
    },
  }
}
export const CARD_COLOR = COLOR

// วันที่ + เวลานัดตัวใหญ่ (ยกเลิก = สีเทาขีดฆ่า) · datePrefix เช่น 'นัดใหม่ · '
export function appointmentTimeTexts(appointment, { cancelled = false, datePrefix = '' } = {}) {
  return [
    cardText(`${datePrefix}${thaiDateText(appointment.date)}`, { color: '#555555' }),
    {
      type: 'text',
      text: `${appointment.startTime}–${appointment.endTime} น.`,
      size: 'xxl',
      weight: 'bold',
      color: cancelled ? '#888888' : COLOR.green,
      ...(cancelled ? { decoration: 'line-through' } : {}),
    },
  ]
}

const SEPARATOR = { type: 'separator', margin: 'md', color: COLOR.line }

// U9 — การ์ดยืนยันการจอง (ชื่อ เพศ อายุ วันที่ เวลา สถานะ ตามภาพ 3.14 ในรายงาน)
// profile = แบบ U1 (firstName, lastName, gender, age) · appointment = แบบ U8
export function bookingConfirmedMessage(profile, appointment) {
  return appointmentCard({
    title: 'จองคิวสำเร็จ',
    altText: `จองคิวสำเร็จ ${shortDateText(appointment.date)} ${appointment.startTime} น.`,
    body: [
      ...appointmentTimeTexts(appointment),
      cardRow('ชื่อ', `${profile.firstName} ${profile.lastName}`),
      cardRow('เพศ/อายุ', `${GENDER_TEXT[profile.gender] || '-'} · ${profile.age} ปี`),
      statusRow('ยืนยันแล้ว'),
      SEPARATOR,
      ...changeRuleTexts(appointment),
    ],
  })
}

// U10 — การ์ดยืนยันการยกเลิก (หัวเทา เวลาขีดฆ่า)
export function appointmentCancelledMessage(appointment) {
  return appointmentCard({
    title: 'ยกเลิกนัดแล้ว',
    headerColor: COLOR.gray,
    altText: `ยกเลิกนัด ${shortDateText(appointment.date)} ${appointment.startTime} น. แล้ว`,
    body: [
      ...appointmentTimeTexts(appointment, { cancelled: true }),
      statusRow('ยกเลิก', true),
      SEPARATOR,
      cardText('จองใหม่ได้ที่เมนู "จองคิว"'),
    ],
  })
}

// U11 — การ์ดยืนยันการเลื่อน · previous = { date, startTime } ของนัดเดิม (แสดงขีดฆ่า)
export function appointmentRescheduledMessage(appointment, previous) {
  const previousText = `${thaiDateText(previous.date)} ${previous.startTime} น.`
  return appointmentCard({
    title: 'เลื่อนนัดสำเร็จ',
    altText: `เลื่อนนัดสำเร็จ ${shortDateText(appointment.date)} ${appointment.startTime} น.`,
    body: [
      {
        type: 'text',
        size: 'xs',
        color: '#888888',
        wrap: true,
        contents: [
          { type: 'span', text: 'นัดเดิม ' },
          { type: 'span', text: previousText, decoration: 'line-through' },
        ],
      },
      ...appointmentTimeTexts(appointment, { datePrefix: 'นัดใหม่ · ' }),
      statusRow('ยืนยันแล้ว'),
      SEPARATOR,
      ...changeRuleTexts(appointment),
    ],
  })
}

// O3ก: ปุ่ม "ดูสถานะคิว" — มีนัด active (แบบ U8) → การ์ดนัดของคุณ
export function appointmentStatusMessage(appointment) {
  return appointmentCard({
    title: 'นัดของคุณ',
    altText: `นัดของคุณ ${shortDateText(appointment.date)} ${appointment.startTime} น.`,
    body: [...appointmentTimeTexts(appointment), statusRow('ยืนยันแล้ว'), SEPARATOR, ...changeRuleTexts(appointment)],
  })
}

// ---------- การ์ดเตือนก่อนนัด (ชุด P — cron + ปุ่มเดโม D1) ----------
// type = 'day_before' (07:00 วันก่อนนัด) | 'before_2h' (2 ชม.ก่อนนัด) · หัวการ์ดสีส้ม
const REMINDER_TITLES = {
  day_before: 'พรุ่งนี้มีนัด',
  before_2h: 'อีก 2 ชั่วโมงถึงเวลานัด',
}
export const REMINDER_TYPES = Object.keys(REMINDER_TITLES)

// profile = { firstName, lastName } · appointment = แบบ U8 (date, startTime, endTime, canChange, changeDeadline)
export function reminderMessage(type, profile, appointment) {
  const title = REMINDER_TITLES[type]
  const name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
  return appointmentCard({
    title,
    headerColor: COLOR.orange,
    altText: `${title} ${shortDateText(appointment.date)} ${appointment.startTime} น.`,
    body: [
      ...appointmentTimeTexts(appointment),
      ...(name ? [cardRow('ชื่อ', name)] : []),
      statusRow('ยืนยันแล้ว'),
      SEPARATOR,
      ...changeRuleTexts(appointment),
      // ยังยกเลิก/เลื่อนเองได้ → บอกทางโทรด้วย · เลยเส้นตายแล้ว บรรทัดแดงด้านบนบอก "โทรแจ้งคลินิก" แล้ว เติมแค่เบอร์
      cardText(appointment.canChange ? `หากมาไม่ได้ กรุณาโทรแจ้งคลินิก ${CLINIC_PHONE}` : `โทร ${CLINIC_PHONE}`),
    ],
  })
}

// ---------- ข้อความตอบปุ่มเมนู / แอดเพื่อน (ชุด O — ตอบด้วย reply) ----------

// O4ก: แอดเพื่อน (follow) — แทน Greeting message ของ OA Manager (ต้องปิดที่นั่น ไม่งั้นได้ 2 ข้อความ)
// O4-1ข: มีชื่อ LINE → ขึ้นต้น "สวัสดีคุณ <ชื่อ>" · ไม่มี (ถามชื่อไม่สำเร็จ) → ไม่มีบรรทัดนี้
export function welcomeText(displayName) {
  return [
    ...(displayName ? [`สวัสดีคุณ ${displayName}`] : []),
    `ยินดีต้อนรับสู่${CLINIC_NAME}`,
    'จองคิว ดูสถานะ ยกเลิกหรือเลื่อนนัดได้จากเมนูด้านล่าง',
    `คลินิกเปิดเสาร์–อาทิตย์ 07:00–10:00 น. โทร ${CLINIC_PHONE}`,
  ].join('\n')
}

// O7ข: ปุ่ม "ติดต่อคลินิก" — เจ้าหน้าที่ตอบแชทในแอป LINE Official Account (เปิดโหมดแชทใน OA Manager)
export function contactText() {
  return [`ติดต่อ${CLINIC_NAME}`, `พิมพ์คำถามไว้ในแชทนี้และรอเจ้าหน้าที่ตอบกลับ หรือ โทร ${CLINIC_PHONE}`].join('\n')
}

// O3ก: ไม่มีนัด active
export function noAppointmentText() {
  return 'ตอนนี้คุณไม่มีนัด\nกดเมนู "จองคิว" เพื่อจอง'
}

// ยังไม่ยินยอม PDPA / ยังไม่กรอกประวัติ → แนบลิงก์หน้าจองคิว (หน้าเว็บพาไปหน้ายินยอม/กรอกประวัติก่อนเอง)
export function setupRequiredText(pdpaAccepted) {
  const firstLine = pdpaAccepted
    ? 'คุณยังไม่ได้กรอกประวัติส่วนตัว จึงยังไม่มีนัด'
    : 'คุณยังไม่ได้เริ่มใช้งาน (ยินยอมการใช้ข้อมูลส่วนบุคคล และกรอกประวัติส่วนตัว)'
  const link = liffLink('/booking')
  return [firstLine, link ? `เริ่มได้ที่: ${link}` : 'กดเมนู "จองคิว" เพื่อเริ่ม'].join('\n')
}

// ---------- ส่งข้อความ ----------

// เรียก Messaging API (รอไม่เกิน 10 วินาที) · LINE ตอบไม่ใช่ 2xx → throw พร้อมเหตุผลจาก LINE
async function callLineApi(url, body) {
  if (!ACCESS_TOKEN) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน server/.env')
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`LINE ตอบ ${response.status} ${detail}`)
  }
}

// O4-1ข: ถามชื่อที่แสดงใน LINE ของผู้ใช้ (ใช้ในข้อความต้อนรับเท่านั้น — ไม่เก็บลงฐานข้อมูล)
// ไม่มี token / LINE ตอบไม่ได้ / ช้าเกิน 5 วินาที → null (ส่งข้อความต้อนรับแบบไม่มีชื่อแทน)
export async function getLineDisplayName(lineUserId) {
  if (!ACCESS_TOKEN || !lineUserId) return null
  try {
    const response = await fetch(PROFILE_URL + encodeURIComponent(lineUserId), {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const profile = await response.json()
    return (profile.displayName || '').trim() || null
  } catch {
    return null
  }
}

// ข้อความ = ข้อความธรรมดา (string) หรือการ์ด ({ type: 'flex', altText, contents }) → รูปแบบที่ LINE รับ
function toLineMessage(message) {
  return typeof message === 'string' ? { type: 'text', text: message } : message
}

// สรุปไว้พิมพ์ลง Terminal (การ์ดพิมพ์แค่ altText)
function logText(message) {
  return typeof message === 'string' ? message : `[การ์ด] ${message.altText}`
}

// push ข้อความหา 1 คน (lineUserId = รหัส LINE ของผู้ป่วย เช่น U1234... / seed-01)
// ส่งไม่สำเร็จ → throw (ผู้ป่วย seed ที่รหัสปลอม LINE จะปฏิเสธ — O16ก)
export async function sendLineMessage(lineUserId, message) {
  if (!PUSH_ENABLED) {
    console.log(`\n📨 [LINE → ${lineUserId}] (ไม่ส่งจริง: LINE_PUSH_ENABLED=false) ${toThaiIso(now())}\n${logText(message)}\n`)
    return
  }
  await callLineApi(PUSH_URL, { to: lineUserId, messages: [toLineMessage(message)] })
  console.log(`📨 ส่ง LINE ถึง ${lineUserId} แล้ว (${toThaiIso(now()).slice(11, 19)})`)
}

// ตอบกลับด้วย replyToken (ใช้ได้ครั้งเดียว ภายในไม่กี่นาทีหลังได้ webhook) — ไม่นับโควตา
// ไม่มี token → พิมพ์ลง Terminal แทน (ทดสอบ webhook ในเครื่องได้)
export async function replyLineMessage(replyToken, message) {
  if (!ACCESS_TOKEN) {
    console.log(`\n💬 [ตอบกลับ] (ไม่ส่งจริง: ยังไม่มี token)\n${logText(message)}\n`)
    return
  }
  await callLineApi(REPLY_URL, { replyToken, messages: [toLineMessage(message)] })
}

// ส่งข้อความโดยไม่ให้ความผิดพลาดกระทบงานหลัก (N2ก) — ใช้หลังบันทึกฐานข้อมูลเสร็จแล้ว (หลัง COMMIT)
export async function notifyPatient(lineUserId, message) {
  try {
    await sendLineMessage(lineUserId, message)
  } catch (error) {
    console.error(`ส่งข้อความ LINE ไม่สำเร็จ (ผู้ป่วย ${lineUserId}) — การทำรายการยังสำเร็จ:`, error.message)
  }
}

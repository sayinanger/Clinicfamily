// Webhook ของ LINE (รอบ LINE ชุด O) — LINE ส่งเหตุการณ์มาที่ POST /webhook ทุกครั้งที่ผู้ป่วยทำอะไรกับ OA
//
// ตั้งใน LINE Developers → Messaging API channel → Webhook URL: https://<โดเมน ngrok>/webhook (O10ก: ngrok → Vite 5173 → ส่งต่อมา 3000)
// เหตุการณ์ที่ใช้:
//   follow   = แอดเพื่อน (หรือเลิกบล็อก) → ตอบข้อความต้อนรับ (O4ก) + ชื่อ LINE (O4-1ข)
//   postback = กดปุ่ม Rich Menu แบบ postback:
//              action=status  → "ดูสถานะคิว" (O3ก: เฉพาะนัด active)
//              action=contact → "ติดต่อคลินิก" (O7ข)
//   message  = ผู้ป่วยพิมพ์ในแชท → ไม่ตอบ (เจ้าหน้าที่ตอบเองในแอป LINE Official Account — O7ข)
//   อื่น ๆ (unfollow ฯลฯ) → ไม่ทำอะไร
//
// ความปลอดภัย: ทุกคำขอต้องมีลายเซ็น x-line-signature ที่ LINE สร้างจาก Channel secret
//   (ใครรู้ URL ngrok ก็ยิงมาได้ — ลายเซ็นไม่ตรง = ไม่ใช่ LINE → 401)
//   ลายเซ็นคำนวณจาก "ข้อความดิบ" ของ body จึงต้องอ่าน body แบบดิบ (express.raw) ไม่ใช่ express.json

import crypto from 'node:crypto'
import express, { Router } from 'express'
import { findUserByLineId, toProfile } from '../services/users.js'
import { getMyAppointment } from '../services/appointments.js'
import {
  replyLineMessage,
  getLineDisplayName,
  welcomeText,
  contactText,
  appointmentStatusMessage,
  noAppointmentText,
  setupRequiredText,
} from '../lib/lineMessages.js'

const router = Router()

// ตรวจลายเซ็น: HMAC-SHA256(Channel secret, body ดิบ) แปลงเป็น base64 ต้องตรงกับ header x-line-signature
export function isValidSignature(rawBody, signature, channelSecret) {
  if (!channelSecret || !signature) return false
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest()
  let received
  try {
    received = Buffer.from(signature, 'base64')
  } catch {
    return false
  }
  // timingSafeEqual = เทียบแบบใช้เวลาเท่ากันเสมอ (กันการเดาลายเซ็นจากเวลาที่ตอบ) · ความยาวต้องเท่ากันก่อน
  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

// คำตอบปุ่ม "ดูสถานะคิว" ของผู้ป่วยคนนี้ (มีนัด = การ์ด · อื่น ๆ = ข้อความธรรมดา)
export async function statusReply(lineUserId) {
  const user = await findUserByLineId(lineUserId)
  if (!user?.pdpa_accepted_at) return setupRequiredText(false)
  if (!toProfile(user)) return setupRequiredText(true)
  const { appointment } = await getMyAppointment(user.user_id)
  return appointment ? appointmentStatusMessage(appointment) : noAppointmentText()
}

// เหตุการณ์ 1 รายการ → ข้อความ/การ์ดที่จะตอบ (null = ไม่ตอบ)
export async function replyForEvent(event) {
  const lineUserId = event.source?.userId
  if (event.type === 'follow') return welcomeText(await getLineDisplayName(lineUserId))
  if (event.type === 'postback' && lineUserId) {
    const action = new URLSearchParams(event.postback?.data || '').get('action')
    if (action === 'status') return statusReply(lineUserId)
    if (action === 'contact') return contactText()
  }
  return null
}

// ทำทีละเหตุการณ์ · พังเหตุการณ์เดียว → พิมพ์ error แล้วทำรายการถัดไป
export async function handleEvents(events) {
  for (const event of events) {
    try {
      const message = await replyForEvent(event)
      if (message && event.replyToken) await replyLineMessage(event.replyToken, message)
    } catch (error) {
      console.error(`ตอบเหตุการณ์ LINE (${event.type}) ไม่สำเร็จ:`, error.message)
    }
  }
}

// POST /webhook — express.raw = เก็บ body เป็น Buffer ดิบ (ใช้ตรวจลายเซ็น)
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const channelSecret = (process.env.LINE_CHANNEL_SECRET || '').trim()
  if (!channelSecret) {
    throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_SECRET ใน server/.env → รับ webhook จาก LINE ไม่ได้')
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
  if (!isValidSignature(rawBody, req.get('x-line-signature'), channelSecret)) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'ลายเซ็นไม่ถูกต้อง' })
  }

  let events = []
  try {
    events = JSON.parse(rawBody.toString('utf8')).events || []
  } catch {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง' })
  }

  // ตอบ LINE ว่า "ได้รับแล้ว" ทันที (ปุ่ม Verify ใน Console ส่ง events ว่าง ก็ได้ 200)
  // แล้วค่อยตอบผู้ป่วยทีหลัง (replyToken ใช้ได้อีกหลายนาที) — LINE ไม่ต้องรอฐานข้อมูล
  res.status(200).json({ ok: true })
  await handleEvents(events)
})

export default router

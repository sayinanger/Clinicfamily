# API Contract — Clinicfamily

> "เมนู" ที่ตกลงกันระหว่างหน้าเว็บ (`client/`) กับ server (`server/`)
> ข้อมูลปลอม (mock) ใน `client/src/lib/mock.js` ต้องตอบกลับหน้าตาเดียวกับเอกสารนี้ทุกข้อ
> ถ้าจะเปลี่ยน API ให้แก้เอกสารนี้ก่อน แล้วค่อยแก้ mock / server ให้ตรง

อ้างอิงกฎ: `project-snapshot.md` หมวด 5 · หน้าจอ: Figma `9NgGd2D5abKPrwCtitWf9C`

**ข้อตกลงที่ผู้ใช้ยืนยันแล้ว (2026-09-30)**
1. ผู้ป่วยยืนยันตัวด้วย LINE ID token (server ตรวจกับ LINE เอง) — ไม่ส่ง lineUserId ตรง
2. `GET /api/me` และ `POST /api/me/pdpa` ไม่เช็ก PDPA (ไม่งั้นผู้ใช้ใหม่กดยินยอมไม่ได้)
3. ต้องกรอกประวัติก่อนถือคิว/จอง/ยกเลิก/เลื่อน (`PROFILE_REQUIRED`)
4. สถิติ `total` = นัดทุกสถานะในเดือน รวมนัดที่ยังไม่ถึงเวลา
5. คงกฎจองล่วงหน้า ≥ 3 ชม. (คิวที่ถูกยกเลิกในช่วง 1–3 ชม.ก่อนนัด จองผ่านระบบไม่ได้ — เขียนเป็นข้อจำกัดในบท 5)
6. เส้นตายยกเลิก/เลื่อน: ทำได้เมื่อเวลาปัจจุบัน **ยังไม่ถึง** 1 ชม.ก่อนนัด (นัด 09:00 → ทำได้ถึง 07:59, 08:00 ทำไม่ได้) ข้อความบนจอใช้คำว่า **"ก่อน"**

---

## 0. กติกากลาง (ใช้กับทุก API)

**รูปแบบข้อมูล**
- ส่งและรับเป็น JSON · ชื่อฟิลด์เป็น camelCase (เช่น `firstName`)
- วันที่ = `"YYYY-MM-DD"` ปี ค.ศ. (เช่น `"2026-10-03"`) — หน้าเว็บแปลงเป็น พ.ศ. ตอนแสดง
- เวลา = `"HH:MM"` (เช่น `"07:30"`) เวลาไทย
- วันเวลาเต็ม = ISO 8601 พร้อมเขตเวลาไทย (เช่น `"2026-10-03T07:30:00+07:00"`)
- เดือน = `"YYYY-MM"` (เช่น `"2026-10"`)

**เมื่อเกิดข้อผิดพลาด** server ตอบ HTTP status ที่ไม่ใช่ 2xx พร้อม

```json
{ "code": "SLOT_TAKEN", "message": "คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น" }
```

- `code` = รหัสภาษาอังกฤษ ให้หน้าเว็บใช้ตัดสินใจว่าจะแสดง popup แบบไหน
- `message` = ข้อความภาษาไทยที่แสดงให้ผู้ใช้เห็นได้เลย

**Error ที่ใช้ร่วมกัน**

| HTTP | code | ความหมาย |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ข้อมูลที่ส่งมาไม่ครบ/ไม่ถูกต้อง (มี `fields` บอกช่องที่ผิด) |
| 401 | `UNAUTHORIZED` | ยังไม่ได้ login (staff) หรือยืนยันตัวตน LINE ไม่ผ่าน (ผู้ป่วย) |
| 403 | `PDPA_REQUIRED` | ผู้ป่วยยังไม่กดยินยอม PDPA |
| 403 | `PROFILE_REQUIRED` | ผู้ป่วยยังไม่กรอกประวัติ |
| 404 | `NOT_FOUND` | ไม่พบข้อมูล |
| 500 | `SERVER_ERROR` | server ผิดพลาด — "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" |

**การยืนยันตัวตน**
- **ผู้ป่วย (LIFF):** ทุก API ที่ขึ้นต้น `/api/me`, `/api/slots`, `/api/booking-days`, `/api/holds`, `/api/appointments` ต้องส่ง header
  `Authorization: Bearer <LINE ID token>` (ได้จาก `liff.getIDToken()`) → server ส่ง token ไปตรวจกับ LINE แล้วได้ `line_user_id` ของจริง
  (ไม่ให้หน้าเว็บส่ง lineUserId มาเอง เพราะปลอมได้)
- **Staff:** login แล้ว server ตั้ง session cookie — ทุก API `/api/admin/...` (ยกเว้น login) ต้องมี cookie นี้
- **โหมด mock:** ไม่มีการตรวจจริง — ใช้ผู้ป่วยจำลอง 1 คน และ staff login ด้วย `staff` / `1234`

**ลำดับการเช็กฝั่งผู้ป่วย** (server เช็กทุกครั้ง)
1. ตัวตน LINE → ไม่ผ่าน `401 UNAUTHORIZED`
2. ยินยอม PDPA → ยัง `403 PDPA_REQUIRED` (ยกเว้น `GET /api/me`, `POST /api/me/pdpa`)
3. กรอกประวัติ → ยัง `403 PROFILE_REQUIRED` (เฉพาะ API จอง/ถือคิว/ยกเลิก/เลื่อน)

---

## 1. ภาพรวม API ทั้งหมด

| # | Method | Path | ใช้ในหน้า | ขั้นที่ทำ mock |
|---|---|---|---|---|
| S1 | POST | `/api/admin/login` | Staff Login | 3 |
| S2 | POST | `/api/admin/logout` | ทุกหน้า staff (ปุ่มออกจากระบบ) | 4 |
| S3 | GET | `/api/admin/me` | ทุกหน้า staff (เช็กว่า login อยู่ไหม + ชื่อมุมขวาบน) | 4 |
| S4 | GET | `/api/admin/appointments?date=` | ดูรายการนัดหมาย | 4 |
| S5 | POST | `/api/admin/appointments/:id/no-show` | ดูรายการนัดหมาย (ปุ่มไม่มา) | 4 |
| S6 | DELETE | `/api/admin/appointments/:id/no-show` | ดูรายการนัดหมาย (ปุ่มแก้คืน) | 4 |
| S7 | GET | `/api/admin/slots?date=` | จัดการเวลา | 5 |
| S8 | POST | `/api/admin/slots/:id/close` | จัดการเวลา (ปุ่มปิด) | 5 |
| S9 | POST | `/api/admin/slots/:id/open` | จัดการเวลา (ปุ่มเปิด) | 5 |
| S10 | GET | `/api/admin/stats?month=` | สถิติ | 6 |
| S11 | GET | `/api/admin/stats/trend?months=6` | สถิติ (กราฟ) | 6 |
| U1 | GET | `/api/me` | ทุกหน้า LIFF (ดูว่ายินยอม/กรอกประวัติหรือยัง) | 7 |
| U2 | POST | `/api/me/pdpa` | ยินยอม PDPA | 7 |
| U3 | PUT | `/api/me/profile` | ประวัติส่วนตัว | 7 |
| U4 | GET | `/api/booking-days` | จองคิว / เลื่อนนัด (แถบเลือกวัน) | 7 |
| U5 | GET | `/api/slots?date=` | จองคิว / เลื่อนนัด (ตารางเวลา) | 7 |
| U6 | POST | `/api/holds` | จองคิว / เลื่อนนัด (กดเลือกเวลา) | 7 |
| U7 | DELETE | `/api/holds/current` | popup ยืนยัน (กด "ยกเลิก") | 7 |
| U8 | GET | `/api/me/appointment` | ยกเลิก/เลื่อนนัด, จองคิว | 7 |
| U9 | POST | `/api/appointments` | popup ยืนยันการจอง (กด "ยืนยัน") | 7 |
| U10 | POST | `/api/me/appointment/cancel` | ยกเลิก/เลื่อนนัด | 7 |
| U11 | POST | `/api/me/appointment/reschedule` | popup ยืนยันการเลื่อน | 7 |
| D1 | POST | `/api/demo/send-reminders` | ปุ่มเดโม (เฉพาะ `DEMO_MODE=true`) | — |

ที่ไม่ได้เรียกจากหน้าเว็บ: `POST /webhook` (LINE ส่ง follow/postback มา), cron ส่งเตือน/เคลียร์ hold/สร้าง slot

---

## 2. API ฝั่ง Staff

### S1. POST `/api/admin/login` — เข้าสู่ระบบ
ส่ง:
```json
{ "username": "staff", "password": "1234" }
```
ได้ `200` + ตั้ง session cookie:
```json
{ "staff": { "staffId": 1, "name": "Staff User" } }
```
Error: `400 VALIDATION_ERROR` "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" · `401 INVALID_LOGIN` "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"

### S2. POST `/api/admin/logout` — ออกจากระบบ
ได้ `200` `{ "ok": true }` (ลบ session)

### S3. GET `/api/admin/me` — staff ที่ login อยู่
ได้ `200` `{ "staff": { "staffId": 1, "name": "Staff User" } }` · ยังไม่ login → `401 UNAUTHORIZED` (หน้าเว็บพาไป `/admin/login`)

### S4. GET `/api/admin/appointments?date=2026-10-03` — รายการนัดของวันที่เลือก
- ไม่ส่ง `date` → server ใช้ **วันเปิดทำการถัดไป** (เสาร์/อาทิตย์ที่ใกล้ที่สุด นับวันนี้ด้วยถ้าวันนี้เปิด)
- แสดงเฉพาะ slot ที่มีนัด (รวมนัดที่ยกเลิก) เรียงตามเวลา

ได้ `200`:
```json
{
  "date": "2026-10-03",
  "appointments": [
    {
      "appointmentId": 12,
      "firstName": "สมหญิง",
      "lastName": "ใจดี",
      "phone": "0812345678",
      "date": "2026-10-03",
      "startTime": "07:00",
      "status": "booked",
      "canMarkNoShow": true,
      "canUndoNoShow": false,
      "undoNoShowUntil": null
    }
  ]
}
```
- `status`: `booked` (แสดง "ยืนยันแล้ว") · `no_show` ("ไม่มา") · `cancelled` ("ยกเลิก")
- `canMarkNoShow` = `status` เป็น `booked` และถึงเวลานัดแล้ว → ปุ่ม [ไม่มา] กรอบแดง; ถ้า `false` และ `booked` → ปุ่ม [ไม่มา] สีเทา
- `canUndoNoShow` = `status` เป็น `no_show` และยังไม่เกิน 5 นาทีหลังกด → ปุ่ม [แก้คืน]; `undoNoShowUntil` = เวลาหมดสิทธิ์แก้คืน
- `cancelled` → แสดง "—"

### S5. POST `/api/admin/appointments/:id/no-show` — กด [ไม่มา]
ได้ `200` = นัดตัวเดียวแบบเดียวกับใน S4 (status เป็น `no_show`)
Error: `409 NOT_YET_TIME` "ยังไม่ถึงเวลานัด" · `409 INVALID_STATUS` "นัดนี้ไม่อยู่ในสถานะยืนยันแล้ว"

### S6. DELETE `/api/admin/appointments/:id/no-show` — กด [แก้คืน]
ได้ `200` = นัดตัวเดียว (status กลับเป็น `booked`)
Error: `409 UNDO_EXPIRED` "เกิน 5 นาทีแล้ว แก้คืนไม่ได้" · `409 INVALID_STATUS`

### S7. GET `/api/admin/slots?date=2026-10-03` — เวลาทั้งหมดของวัน (12 คิว)
- ไม่ส่ง `date` → วันเปิดทำการถัดไป · วันที่ไม่ใช่เสาร์–อาทิตย์ → `slots: []`

ได้ `200`:
```json
{
  "date": "2026-10-03",
  "slots": [
    { "slotId": 101, "startTime": "07:00", "endTime": "07:15", "status": "available" }
  ]
}
```
- `status`: `available` ("เปิดรับการจอง" + ปุ่ม [ปิด]) · `closed` ("ปิดรับการจอง" + ปุ่ม [เปิด]) · `booked` ("มีผู้จองแล้ว" + "ปิดไม่ได้") · `held` ("กำลังถูกจอง" + "ปิดไม่ได้")

### S8. POST `/api/admin/slots/:id/close` — ปิด slot
ได้ `200` = slot ตัวเดียว (status `closed`) · Error: `409 SLOT_NOT_AVAILABLE` "ปิดได้เฉพาะเวลาที่ยังว่าง"

### S9. POST `/api/admin/slots/:id/open` — เปิด slot
ได้ `200` = slot ตัวเดียว (status `available`) · Error: `409 SLOT_NOT_CLOSED` "เวลานี้ไม่ได้ถูกปิดอยู่"

### S10. GET `/api/admin/stats?month=2026-10` — สถิติรายเดือน
- นับตาม **เดือนของวันนัด** · ไม่ส่ง `month` → เดือนปัจจุบัน

ได้ `200`:
```json
{
  "month": "2026-10",
  "workingDays": 9,
  "totalSlots": 108,
  "total": 40,
  "attended": 30,
  "noShow": 2,
  "cancelled": 5,
  "noShowRate": 6.3,
  "prevMonth": "2026-09",
  "prevNoShowRate": 7.2,
  "diffPoints": -0.9,
  "referenceRate": 22.0
}
```
- `total` = นัดทุกสถานะในเดือนนั้น · `attended` = `booked` ที่เวลาผ่านแล้ว · `noShow` = `no_show` · `cancelled` = `cancelled`
  (นัด `booked` ที่ยังไม่ถึงเวลา นับใน `total` อย่างเดียว)
- `noShowRate` = noShow ÷ (attended + noShow) × 100 ทศนิยม 1 · ตัวหารเป็น 0 → `null` (หน้าเว็บแสดง "—")
- `diffPoints` = noShowRate − prevNoShowRate (หน่วย "จุด") · ค่าใดเป็น `null` → `null`
- % ของแต่ละการ์ด (เช่น "85.6% ของนัดทั้งหมด") หน้าเว็บคำนวณเองจาก `total`

### S11. GET `/api/admin/stats/trend?months=6` — อัตราไม่มาย้อนหลัง
ได้ `200` (เรียงจากเก่าไปใหม่ เดือนสุดท้าย = เดือนปัจจุบัน):
```json
{ "referenceRate": 22.0, "months": [ { "month": "2026-05", "noShowRate": 12.5 } ] }
```

---

## 3. API ฝั่งผู้ป่วย (LIFF)

### U1. GET `/api/me` — ข้อมูลของฉัน
ได้ `200`:
```json
{
  "lineDisplayName": "Somying",
  "pdpaAccepted": true,
  "profileCompleted": true,
  "profile": {
    "firstName": "สมหญิง",
    "lastName": "ใจดี",
    "gender": "female",
    "birthDate": "1966-05-20",
    "age": 60,
    "phone": "0812345678"
  }
}
```
- ผู้ใช้ใหม่ (ยังไม่เคยมีในระบบ) → `pdpaAccepted: false`, `profileCompleted: false`, `profile: null`
- `gender`: `male` (ชาย) · `female` (หญิง) · `unspecified` (ไม่ระบุ)
- `age` server คำนวณจากวันเกิด (ใช้ในการ์ดยืนยันการจอง)

### U2. POST `/api/me/pdpa` — กดยินยอม PDPA
ได้ `200` `{ "pdpaAcceptedAt": "2026-10-01T09:00:00+07:00" }`

### U3. PUT `/api/me/profile` — บันทึกประวัติ (ใช้ทั้งกรอกครั้งแรกและแก้ไข)
ส่ง:
```json
{ "firstName": "สมหญิง", "lastName": "ใจดี", "gender": "female", "birthDate": "1966-05-20", "phone": "0812345678" }
```
ได้ `200` `{ "profile": { ...เหมือนใน U1 } }`
Error `400 VALIDATION_ERROR`:
```json
{ "code": "VALIDATION_ERROR", "message": "กรุณากรอกข้อมูลให้ครบถ้วน", "fields": { "phone": "เบอร์โทรต้องเป็นตัวเลข 10 หลัก" } }
```
เงื่อนไข: ทุกช่องบังคับ · เบอร์โทร 10 หลักขึ้นต้น 0 · วันเกิดต้องไม่เป็นวันในอนาคต

### U4. GET `/api/booking-days` — วันที่เลือกได้ (แถบ "เลือกวันที่")
ได้ `200` = วันเสาร์–อาทิตย์ภายใน 14 วันนับจากวันนี้:
```json
{ "days": [ { "date": "2026-10-03", "availableCount": 5 } ] }
```

### U5. GET `/api/slots?date=2026-10-03` — ตารางเวลาของวัน
ได้ `200`:
```json
{
  "date": "2026-10-03",
  "slots": [
    { "slotId": 101, "startTime": "07:00", "endTime": "07:15", "status": "too_late" },
    { "slotId": 102, "startTime": "07:15", "endTime": "07:30", "status": "available" },
    { "slotId": 103, "startTime": "07:30", "endTime": "07:45", "status": "unavailable" },
    { "slotId": 104, "startTime": "07:45", "endTime": "08:00", "status": "held_by_me" }
  ]
}
```
- จองได้เมื่อ เวลานัด − เวลาปัจจุบัน ≥ 3 ชม. (คิว 09:00 → จองได้ถึง 06:00 พอดี)
- `available` = "ว่าง" (กดได้) · `unavailable` = "ไม่ว่าง" (มีคนจอง/กำลังถูกจอง/ปิด — ผู้ป่วยไม่ต้องรู้ว่าแบบไหน) · `too_late` = "หมดเวลาจอง" (เหลือ < 3 ชม.) · `held_by_me` = ฉันถือคิวนี้อยู่
- `date` เกิน 14 วันหรือไม่ใช่วันเปิด → `400 INVALID_DATE`

### U6. POST `/api/holds` — ถือคิวไว้ 5 นาที (กดเลือกเวลา)
ส่ง:
```json
{ "slotId": 102, "purpose": "book" }
```
- `purpose`: `book` (จองใหม่) · `reschedule` (เลื่อนนัด — ข้ามกฎ "มีนัดอยู่แล้ว")
- ถ้าถือคิวอื่นอยู่ → server ปล่อยคิวเดิมให้อัตโนมัติ (ถือได้ครั้งละ 1)

ได้ `200`:
```json
{ "hold": { "slotId": 102, "date": "2026-10-03", "startTime": "07:15", "holdExpiresAt": "2026-10-01T09:05:00+07:00" } }
```
- หน้าเว็บใช้ `holdExpiresAt` นับถอยหลัง "เวลาที่เหลือในการจอง"

Error:

| HTTP | code | message |
|---|---|---|
| 409 | `SLOT_TAKEN` | คิวนี้มีผู้จองแล้ว กรุณาเลือกเวลาอื่น |
| 409 | `HAS_ACTIVE_APPOINTMENT` | คุณมีนัดอยู่แล้ว (มี `appointment` แบบ U8 แนบมาด้วย → popup "คุณมีนัดอยู่แล้ว" + [เลื่อนนัด] [ยกเลิกนัด]) |
| 400 | `TOO_LATE_TO_BOOK` | ต้องจองก่อนเวลานัดอย่างน้อย 3 ชั่วโมง |
| 400 | `TOO_FAR_TO_BOOK` | จองล่วงหน้าได้ไม่เกิน 14 วัน |
| 409 | `NO_APPOINTMENT_TO_RESCHEDULE` | ไม่มีนัดที่จะเลื่อน (`purpose: reschedule` แต่ไม่มีนัด) |
| 409 | `TOO_LATE_TO_CHANGE` | (`purpose: reschedule`) นัดเดิมเลยเส้นตายแล้ว — ดู U8/U10 |

เลื่อนนัดเช็ก 2 ข้อแยกกัน: นัดเดิมต้องยังไม่ถึง `changeDeadline` และเวลาใหม่ต้องผ่านกฎ 3 ชม. + 14 วันเหมือนการจองปกติ (เลื่อนในวันนัดได้ถ้าเวลาใหม่ห่าง ≥ 3 ชม.)

### U7. DELETE `/api/holds/current` — ปล่อยคิวที่ถืออยู่ (กด "ยกเลิก" ใน popup ยืนยัน)
ได้ `200` `{ "ok": true }` (ไม่มีคิวที่ถืออยู่ก็ตอบ ok)

### U8. GET `/api/me/appointment` — นัดที่ยังใช้งานอยู่ของฉัน
ได้ `200`:
```json
{
  "appointment": {
    "appointmentId": 12,
    "date": "2026-10-03",
    "startTime": "07:30",
    "endTime": "07:45",
    "status": "booked",
    "canChange": true,
    "changeDeadline": "2026-10-03T06:30:00+07:00"
  },
  "clinicPhone": "012-345-6789"
}
```
- ไม่มีนัด active → `{ "appointment": null, "clinicPhone": "..." }`
- `changeDeadline` = 1 ชม.ก่อนนัด · `canChange` = เวลาปัจจุบัน **ยังไม่ถึง** `changeDeadline` (นัด 07:30 → deadline 06:30 → ทำได้ถึง 06:29, ตั้งแต่ 06:30 ทำไม่ได้)
- ถ้า `canChange: false` หน้าเว็บแสดง "ยกเลิกหรือเลื่อนนัดได้ก่อน 06:30 น. เท่านั้น กรุณาติดต่อคลินิก โทร ..."
- `clinicPhone` มาจาก `.env` ของ server

### U9. POST `/api/appointments` — ยืนยันการจอง
ส่ง `{ "slotId": 102 }` (ต้องเป็นคิวที่ตัวเองถืออยู่)
ได้ `201` `{ "appointment": { ...แบบ U8 } }` → server ส่ง LINE ยืนยัน
Error: `410 HOLD_EXPIRED` "หมดเวลายืนยันการจอง คิวถูกปล่อยให้ผู้อื่นจองได้แล้ว" · `409 HAS_ACTIVE_APPOINTMENT`

### U10. POST `/api/me/appointment/cancel` — ยกเลิกนัด
ได้ `200` `{ "appointment": { ...status: "cancelled" } }` → slot กลับเป็นว่าง + LINE ยืนยันการยกเลิก
Error: `409 TOO_LATE_TO_CHANGE` "ยกเลิกหรือเลื่อนนัดได้ก่อน HH:MM น. เท่านั้น กรุณาติดต่อคลินิก" · `404 NOT_FOUND` ไม่มีนัด

### U11. POST `/api/me/appointment/reschedule` — ยืนยันการเลื่อนนัด
ส่ง `{ "slotId": 110 }` (ต้องถือคิวใหม่ไว้ด้วย U6 `purpose: reschedule`)
ได้ `200` `{ "appointment": { ...เวลาใหม่ }, "previous": { "date": "2026-10-03", "startTime": "07:30" } }`
→ แก้แถวนัดเดิม, slot เดิมว่าง, ล้างการแจ้งเตือนของนัดนี้, LINE ยืนยันการเลื่อน
Error: `410 HOLD_EXPIRED` · `409 TOO_LATE_TO_CHANGE` · `404 NOT_FOUND`

---

## 4. API โหมดเดโม (มีเฉพาะ `DEMO_MODE=true`)

### D1. POST `/api/demo/send-reminders` — ส่งแจ้งเตือนทันที
ส่ง `{ "appointmentId": 12, "type": "before_2h" }` (`type`: `day_before` | `before_2h`)
ได้ `200` `{ "sent": true }` · ปิดโหมดเดโม → `404 NOT_FOUND`

---

## 5. ข้อมูลจำลอง (mock) — ข้อตกลง
- ชื่อ/เบอร์ทั้งหมดเป็นคนสมมติ (ห้ามใช้ชื่อคนจริง) — ชุดเดียวกันนี้ใช้ต่อเป็น seed ใน Supabase สัปดาห์ 3
- mock เก็บข้อมูลในหน่วยความจำ → กดปุ่มแล้วเปลี่ยนได้ แต่รีเฟรชหน้าแล้วกลับเป็นค่าเริ่มต้น (ยกเว้นสถานะ login ของ staff จำไว้ใน sessionStorage — รีเฟรชแล้วยัง login อยู่จนกว่าจะปิดแท็บ)
- mock หน่วงเวลา ~300 ms ให้เหมือนเรียก server จริง
- mock ต้องมีตัวอย่างครบทุกสถานะที่หน้าจอต้องแสดง (เช่น ยืนยันแล้ว-ยังไม่ถึงเวลา, ยืนยันแล้ว-ถึงเวลา, ไม่มา, ไม่มา-แก้คืนได้, ยกเลิก)
- mock ไม่เช็กกฎจริง — กฎทั้งหมดทำที่ server สัปดาห์ 3–4

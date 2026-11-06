# Clinicfamily

ระบบนัดหมายคลินิกผ่าน LINE Official Account (โครงงาน CS303)

- ผู้ใช้งาน (ผู้ป่วย) จองคิว ดูสถานะ ยกเลิก และเลื่อนนัดผ่านแอป LINE — หน้าเว็บ `/liff/...` เปิดใน LINE ผ่าน LIFF
- เจ้าหน้าที่ดูรายการนัดหมาย ปิด/เปิดช่วงเวลา และดูสถิติผ่าน Web Admin — หน้าเว็บ `/admin/...`
- ระบบส่งการ์ดยืนยันและการ์ดแจ้งเตือนนัดผ่าน LINE (07:00 น. วันก่อนนัด และ 2 ชั่วโมงก่อนนัด)

## โครงสร้าง

```
client/   หน้าเว็บ (React) ทั้งฝั่งผู้ใช้งานและเจ้าหน้าที่
server/   API, webhook ของ LINE, ตัวตั้งเวลาส่งแจ้งเตือน และสคริปต์ฐานข้อมูล
docs/     api-contract.md — รายการ API ที่หน้าเว็บกับ server ตกลงกัน
package.json   คำสั่ง build / start สำหรับ Render
```

```
client/src/
  App.jsx          กำหนดเส้นทางทั้งหมด
  lib/api.js       ฟังก์ชันเรียก API (fetch)
  lib/liff.js      เริ่ม LIFF + ขอ ID token ของ LINE
  layouts/         โครงหน้า LIFF / Admin
  pages/liff/      หน้าของผู้ใช้งาน
  pages/admin/     หน้าของเจ้าหน้าที่
  components/      ชิ้นส่วนที่ใช้ซ้ำ (ป๊อปอัป, ปฏิทิน)

server/
  index.js         จุดเริ่ม server (Express)
  routes/          API ฝั่งเจ้าหน้าที่ (admin.js), ฝั่งผู้ใช้งาน (user.js), webhook.js, demo.js, health.js
  services/        ตรรกะหลัก: ช่วงเวลา/ถือคิว (slots.js), นัดหมาย, สถิติ, ผู้ใช้งาน
  lib/             กฎเวลา (rules.js), นาฬิกากลาง (clock.js), ข้อความ LINE, ตัวตั้งเวลา (reminders.js)
  db/              schema.sql, reset.js, seed.js, check.sql
  scripts/         richmenu.js — สร้างเมนูในแชท LINE
```

## Tech stack

| ส่วน | ใช้ |
| --- | --- |
| หน้าเว็บ | React, Vite, Tailwind CSS, React Router, @line/liff |
| Server | Node.js 24, Express 5, pg, bcryptjs, cookie-session, node-cron |
| ฐานข้อมูล | PostgreSQL บน Supabase |
| LINE | Messaging API (ส่งข้อความ + webhook), LIFF, Rich Menu |
| Hosting | Render |

JavaScript (ไม่ใช้ TypeScript)

## ฐานข้อมูล (5 ตาราง)

| ตาราง | เก็บอะไร |
| --- | --- |
| users | ผู้ใช้งานที่ยินยอม PDPA แล้ว + ข้อมูลส่วนตัว |
| staff | บัญชีเจ้าหน้าที่ (รหัสผ่านเก็บเป็น bcrypt) |
| appointments | นัดที่เกิดขึ้นจริง: held / booked / completed / no_show / cancelled |
| closed_slots | ช่วงเวลาที่เจ้าหน้าที่ปิด |
| notifications | การ์ดแจ้งเตือนที่ส่งแล้ว (day_before / before_2h) |

ระบบไม่สร้างช่วงเวลาไว้ล่วงหน้า ช่วงเวลาที่เปิด (เสาร์–อาทิตย์ 07:00–10:00 น. ทีละ 15 นาที) คำนวณจากกฎในโค้ด · รายละเอียดคอลัมน์และกฎดู `server/db/schema.sql`

## รันบนเครื่อง

ต้องมี Node.js 24 และฐานข้อมูล PostgreSQL (Supabase)

**1) server**

```bash
cd server
cp .env.example .env    # แล้วเติมค่าใน .env (คำอธิบายแต่ละค่าอยู่ในไฟล์)
npm install
npm run db:reset        # ⚠️ ลบตารางเดิมทั้งหมดแล้วสร้างใหม่
npm run db:seed         # ใส่บัญชีเจ้าหน้าที่ + ข้อมูลตัวอย่าง
npm run dev             # เปิด server ที่ http://localhost:3000
```

**2) client** (เปิด Terminal อีกหน้าต่าง)

```bash
cd client
cp .env.example .env    # แล้วเติมค่าใน .env
npm install
npm run dev             # เปิดหน้าเว็บที่ http://localhost:5173
```

เปิด http://localhost:5173/admin · Vite ส่งคำขอ `/api` และ `/webhook` ต่อไปที่ server พอร์ต 3000

### คำสั่งของ server

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | เปิด server แบบรีสตาร์ทเองเมื่อแก้โค้ด |
| `npm start` | เปิด server (ใช้บน Render) |
| `npm run db:reset` | ลบตารางทั้งหมดแล้วสร้างใหม่ตาม `schema.sql` |
| `npm run db:seed` | ใส่บัญชีเจ้าหน้าที่ + ผู้ใช้งานสมมติ + นัดตัวอย่าง |
| `npm run db:seed -- --staff-only` | ใส่แค่บัญชีเจ้าหน้าที่ (ใช้กับฐานข้อมูลจริง) |
| `npm run richmenu` | สร้าง Rich Menu ในแชท LINE |

## ขึ้น Render (ระบบเปิดตลอด)

Render รันโปรแกรมเดียว: server (Express) เสิร์ฟทั้ง API, webhook และหน้าเว็บที่ build แล้ว (`client/dist`) → โดเมนเดียว cookie ของ staff ใช้ได้

| ช่องในหน้า Render | ค่า |
| --- | --- |
| Root Directory | (เว้นว่าง) |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

- Node 24 กำหนดใน `package.json` ที่โฟลเดอร์บนสุด (`engines`)
- ค่าทั้งหมดใส่ในแท็บ Environment ของ Render (ไม่มีไฟล์ `.env` บน Render) — ค่า `VITE_...` ต้องมีตอน build ด้วย
- เปลี่ยนค่าใน Environment → Save → Render รีสตาร์ทเอง (~1–2 นาที) · push โค้ดใหม่ → Render build ใหม่เอง (~2–5 นาที)
- LINE Developers: Webhook URL = `https://<โดเมน Render>/webhook` · LIFF Endpoint URL = `https://<โดเมน Render>/liff` · Rich Menu ใช้ลิงก์ `liff.line.me` จึงไม่ต้องตั้งใหม่

## ข้อควรระวัง

- ไฟล์ `.env` มีค่าลับ ห้ามขึ้น GitHub (อยู่ใน `.gitignore` แล้ว) — ขึ้น GitHub ได้เฉพาะ `.env.example`
- อย่าเปิด server บน Mac ค้างไว้ระหว่างที่ระบบบน Render ทำงาน เพราะตัวตั้งเวลาจะส่งแจ้งเตือนซ้อนกัน
- `npm run db:reset` ลบข้อมูลทุกแถว ตรวจให้แน่ใจว่า `DATABASE_URL` ชี้ฐานข้อมูลที่ตั้งใจก่อนรัน

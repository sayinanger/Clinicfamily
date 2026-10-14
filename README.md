# Clinicfamily

ระบบนัดหมายคลินิกผ่าน LINE OA — ส่วน Frontend

- `/liff/...` หน้าของผู้ป่วย (เปิดใน LINE ผ่าน LIFF)
- `/admin/...` หน้า Web Admin ของ staff

## Tech stack

| ตัว | หน้าที่ |
| --- | --- |
| React | สร้างหน้าเว็บเป็นชิ้น ๆ (component) |
| Vite | สร้างและรันโปรเจกต์ React |
| Tailwind CSS | แต่งหน้าตาให้ตรงกับ Figma |
| React Router | แยกเส้นทาง `/liff/...` และ `/admin/...` |
| @line/liff | เปิดหน้าเว็บใน LINE และดึง LINE User ID |

JavaScript (ไม่ใช้ TypeScript) · ไม่ใช้ไลบรารีจัดการ state (ใช้ `useState` / `useEffect`)

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env   # แล้วใส่ VITE_LIFF_ID
npm run dev
```

เปิด http://localhost:5173/admin

## โครงสร้าง

```
src/
  main.jsx          จุดเริ่มแอป
  App.jsx           กำหนดเส้นทางทั้งหมด
  index.css         Tailwind + สีหลัก (@theme)
  lib/liff.js       เริ่ม LIFF + ดึง LINE User ID
  lib/api.js        ฟังก์ชันเรียก API (fetch)
  layouts/          โครงหน้า LIFF / Admin
  pages/liff/       หน้าของผู้ป่วย
  pages/admin/      หน้าของ staff
  components/       ชิ้นส่วนที่ใช้ซ้ำ (ปุ่ม, การ์ด, popup)
```

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
- บน Mac ยังพัฒนาแบบเดิมได้ (`npm run dev` ใน `server/` และ `client/`) แต่อย่าเปิด server บน Mac ค้างไว้ เพราะ cron จะทำงานซ้อนกับ Render

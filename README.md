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

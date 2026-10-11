-- =====================================================================
-- schema.sql — โครงฐานข้อมูล Clinicfamily (5 ตาราง 35 คอลัมน์)
-- ยึดตาม Excel "ER-Clinicfamily สมบูรณ์ล่าสุด.xlsx" ชีต ER-ตาราง + ภาพ ER 3.8
--
-- วิธีใช้: ในโฟลเดอร์ server/ พิมพ์  npm run db:reset
--   ⚠️ ไฟล์นี้ "ลบตารางเดิมทั้งหมด" แล้วสร้างใหม่ → ข้อมูลทุกแถวหาย
--   reset.js ส่งทั้งไฟล์ใน transaction เดียว: ผ่านหมด หรือไม่เปลี่ยนอะไรเลย
--
-- ข้อตกลงที่ต่างจาก Excel เดิม (ตัดสินใจ 12 ต.ค. 2569):
--   appointments.created_at / updated_at ไม่มี DEFAULT now()
--   เพราะใช้ในกฎเวลา (นัดกระชั้น, ข้ามเตือน) → server ต้องส่งเวลาจาก
--   server/lib/clock.js ทุกครั้ง (รองรับ DEMO_NOW) ถ้าลืมส่ง = error ทันที
-- =====================================================================


-- ---------- 1) ลบตารางเดิม ----------
-- ลบพร้อมกันในคำสั่งเดียว PostgreSQL จัดลำดับ FK ให้เอง (ไม่ใช้ CASCADE
-- เพื่อไม่ให้ไปลบอย่างอื่นที่ไม่ได้ตั้งใจ) · IF EXISTS = ครั้งแรกยังไม่มีตารางก็ไม่ error
DROP TABLE IF EXISTS notifications, appointments, time_slots, staff, users;


-- ---------- 2) users — ผู้ป่วย (10 คอลัมน์) ----------
-- สร้างแถวตอนกดยินยอม PDPA → ข้อมูลส่วนตัวยังไม่มี จึง null ได้ทุกช่อง
-- คำขอลบข้อมูล PDPA = ล้างค่าเป็น null (anonymize) ไม่ลบแถว
CREATE TABLE users (
  user_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- เลขรันอัตโนมัติ
  line_user_id     VARCHAR(100) UNIQUE,            -- จาก ID token ที่ server ตรวจแล้ว
  first_name       VARCHAR(100),
  last_name        VARCHAR(100),
  gender           VARCHAR(12)
                   CHECK (gender IN ('male', 'female', 'unspecified')),
  birth_date       DATE,                           -- อายุคำนวณจากช่องนี้ (ไม่เก็บอายุ)
  phone            VARCHAR(10),                    -- 10 หลักขึ้นต้น 0 (ตรวจที่ server)
  pdpa_accepted_at TIMESTAMPTZ,                    -- null = ยังไม่ยินยอม
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now() -- server ตั้งใหม่ทุกครั้งที่แก้ประวัติ
);


-- ---------- 3) staff — เจ้าหน้าที่ (4 คอลัมน์) ----------
-- ใช้ login อย่างเดียว ไม่เชื่อมกับตารางอื่น
CREATE TABLE staff (
  staff_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username  VARCHAR(100) NOT NULL UNIQUE,
  password  VARCHAR(100) NOT NULL,   -- bcrypt hash (60 ตัวอักษร) ไม่ใช่รหัสจริง
  name      VARCHAR(100) NOT NULL    -- ชื่อที่แสดงมุมขวาบน
);


-- ---------- 4) time_slots — ช่วงเวลา (8 คอลัมน์) ----------
-- 12 คิวต่อวันเปิด (07:00–09:45 ทุก 15 นาที) ระบบสร้างเองในขั้น F
-- held = มีคนกำลังถือคิว (≤ 5 นาที) → held_by_user_id + hold_expires_at มีค่าคู่กัน
--   จองสำเร็จ / ปล่อย / หมดเวลา → ล้างทั้งสองช่องเป็น null (server ทำ)
CREATE TABLE time_slots (
  slot_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_date        DATE NOT NULL,
  start_time       TIME NOT NULL,                  -- เวลาไทย
  end_time         TIME NOT NULL,                  -- start_time + 15 นาที (เก็บซ้ำโดยตั้งใจ)
  slot_status      VARCHAR(10) NOT NULL DEFAULT 'available'
                   CHECK (slot_status IN ('available', 'held', 'booked', 'closed')),
  held_by_user_id  INTEGER REFERENCES users (user_id),  -- FK null ได้
  hold_expires_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_date, start_time)                   -- กันสร้างคิวซ้ำ
);


-- ---------- 5) appointments — การนัดหมาย (7 คอลัมน์) ----------
-- ไม่มี appointment_date: วันนัดอ่านจาก time_slots.slot_date
-- เลื่อนนัด = แก้ slot_id ในแถวเดิม · ยกเลิก = status cancelled (ไม่ลบแถว)
-- มาตามนัด = booked ที่เลยเวลาแล้ว (ไม่มีสถานะแยก)
CREATE TABLE appointments (
  appointment_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users (user_id),
  slot_id         INTEGER NOT NULL REFERENCES time_slots (slot_id),
  status          VARCHAR(10) NOT NULL
                  CHECK (status IN ('booked', 'cancelled', 'no_show')),
  no_show_at      TIMESTAMPTZ,                     -- มีค่าเฉพาะ no_show · แก้คืน → null
  created_at      TIMESTAMPTZ NOT NULL,            -- เวลาจองครั้งแรก (ไม่มี DEFAULT — ดูหัวไฟล์)
  updated_at      TIMESTAMPTZ NOT NULL             -- เวลาแก้ล่าสุด (ไม่มี DEFAULT — ดูหัวไฟล์)
);

-- ด่านที่ 2 กันจองซ้ำ: 1 ช่วงเวลามีนัด booked ได้แค่ 1 นัด
-- (นัดที่ cancelled / no_show ในช่วงเวลาเดียวกันมีได้หลายแถว)
CREATE UNIQUE INDEX one_booking_per_slot
  ON appointments (slot_id)
  WHERE status = 'booked';


-- ---------- 6) notifications — การแจ้งเตือน (6 คอลัมน์) ----------
-- 1 นัดเตือนได้สูงสุด 2 แบบ แบบละครั้ง · failed แล้วไม่ส่งซ้ำ
-- เลื่อนนัด = ลบแถวของนัดนั้นทิ้ง (server ทำ)
CREATE TABLE notifications (
  notification_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id   INTEGER NOT NULL REFERENCES appointments (appointment_id),
  type             VARCHAR(12) NOT NULL
                   CHECK (type IN ('day_before', 'before_2h')),
  message          TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(), -- แถว failed = เวลาที่พยายามส่ง
  status           VARCHAR(10) NOT NULL
                   CHECK (status IN ('sent', 'failed')),
  UNIQUE (appointment_id, type)                    -- กันส่งแบบเดียวกันซ้ำ
);


-- ---------- 7) เปิด RLS (กันชนชั้นที่ 2) ----------
-- server ต่อด้วย user postgres ซึ่งเป็นเจ้าของตาราง → ผ่าน RLS ได้ ใช้งานปกติ
-- ถ้าวันหนึ่งเผลอเปิด Data API ของ Supabase คนนอกจะอ่าน/เขียนไม่ได้
-- (ไม่มี policy = ไม่อนุญาตใครเลยนอกจากเจ้าของตาราง)
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff         ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- schema.sql — โครงฐานข้อมูล Clinicfamily (5 ตาราง 33 คอลัมน์)
-- ยึดตาม EER แบบใหม่ (4 พ.ย. 2569 — claude/snapshot-update-nov4.md) เก็บเฉพาะรายการที่เกิดขึ้นจริง
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
-- (time_slots = ตารางของโครงเดิม · ใส่ไว้เพื่อให้ reset ฐานข้อมูลเดิมแล้วตารางเก่าหายด้วย)
DROP TABLE IF EXISTS notifications, appointments, closed_slots, time_slots, staff, users;


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
-- ใช้ login + closed_slots ชี้มาที่ staff_id (ใครปิดช่วงเวลา)
CREATE TABLE staff (
  staff_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username  VARCHAR(100) NOT NULL UNIQUE,
  password  VARCHAR(100) NOT NULL,   -- bcrypt hash (60 ตัวอักษร) ไม่ใช่รหัสจริง
  name      VARCHAR(100) NOT NULL    -- ชื่อที่แสดงมุมขวาบน
);


-- ---------- 4) appointments — การนัดหมาย (9 คอลัมน์) ----------
-- เก็บเฉพาะนัดที่เกิดขึ้นจริง ไม่มีตารางช่วงเวลา (ช่วงเวลาที่เปิด = โค้ดคำนวณจากกฎ ส–อา 07:00–10:00 ทีละ 15 นาที)
-- แถวเกิดตอนผู้ป่วยกดเลือกเวลา (held ≤ 5 นาที):
--   ยืนยัน → แถวเดิมเป็น booked · กด [ยกเลิก] ในป๊อปอัป / หมดเวลา → ลบแถว (cron ลบทุก 1 นาที)
--   ถึงเวลานัด → completed (cron) · staff กด [ไม่มา] → no_show · [แก้คืน] → completed
--   ยกเลิกนัด → cancelled (ไม่ลบแถว สถิติใช้) · เลื่อนนัด = แก้วัน/เวลาในแถวเดิม
CREATE TABLE appointments (
  appointment_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users (user_id),
  appointment_date  DATE NOT NULL,
  slot_time         TIME NOT NULL,                  -- เวลาเริ่มของช่วง (เวลาไทย) · ช่วงละ 15 นาที
  status            VARCHAR(10) NOT NULL
                    CHECK (status IN ('held', 'booked', 'completed', 'no_show', 'cancelled')),
  hold_expires_at   TIMESTAMPTZ,                    -- มีค่าเฉพาะ held
  no_show_at        TIMESTAMPTZ,                    -- มีค่าเฉพาะ no_show
  created_at        TIMESTAMPTZ NOT NULL,           -- เวลากดเลือกเวลา (ไม่มี DEFAULT — ดูหัวไฟล์)
  updated_at        TIMESTAMPTZ NOT NULL,           -- เวลาแก้ล่าสุด เช่น ยืนยัน/เลื่อน (ไม่มี DEFAULT)
  -- ค่าเวลาต้องตรงกับสถานะ (327ก)
  CONSTRAINT hold_expires_only_when_held CHECK ((status = 'held') = (hold_expires_at IS NOT NULL)),
  CONSTRAINT no_show_at_only_when_no_show CHECK ((status = 'no_show') = (no_show_at IS NOT NULL))
);

-- กฎ 1: 1 วัน-เวลา มีนัด held หรือ booked ได้ 1 นัด (ยกเลิกแล้วมีได้หลายแถว)
CREATE UNIQUE INDEX one_active_per_slot
  ON appointments (appointment_date, slot_time)
  WHERE status IN ('held', 'booked');

-- กฎ 2: 1 คน มีนัด booked ได้ 1 นัด (user กับนัดที่ยืนยันแล้ว = One-to-One)
CREATE UNIQUE INDEX one_booked_per_user
  ON appointments (user_id)
  WHERE status = 'booked';

-- กฎ 3: 1 คน ถือคิว (held) ได้ 1 คิว
CREATE UNIQUE INDEX one_held_per_user
  ON appointments (user_id)
  WHERE status = 'held';


-- ---------- 5) closed_slots — ช่วงเวลาที่ staff ปิด (4 คอลัมน์) ----------
-- กด [ปิด] = เพิ่มแถว · กด [เปิด] = ลบแถว
-- ไม่มี FK ถึง appointments: อ้างถึงช่วงเวลาเดียวกันด้วยวัน + เวลา
CREATE TABLE closed_slots (
  closed_slot_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_date       DATE NOT NULL,
  slot_time       TIME NOT NULL,
  staff_id        INTEGER NOT NULL REFERENCES staff (staff_id),
  -- กฎ 4: 1 วัน-เวลา มีรายการปิดได้ 1 รายการ
  CONSTRAINT one_closure_per_slot UNIQUE (slot_date, slot_time)
);


-- ---------- 6) notifications — การแจ้งเตือน (6 คอลัมน์) ----------
-- กฎ 5: 1 นัดเตือนได้สูงสุด 2 แบบ แบบละครั้ง · failed แล้วไม่ส่งซ้ำ
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
ALTER TABLE closed_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

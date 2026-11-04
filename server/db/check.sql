-- =====================================================================
-- check.sql — ตรวจหา "ข้อมูลที่เป็นไปไม่ได้" (บั๊กที่ไม่ขึ้น error)
-- วิธีใช้: ก๊อปทั้งไฟล์ → Supabase → SQL Editor → วาง → Run
--   ได้ 0 แถว ("Success. No rows returned") = ปกติ
--   มีแถวขึ้นมา = มีบั๊ก → ดูคอลัมน์ problem ว่าผิดแบบไหน, row_id = รหัสแถว
-- ควรรัน: หลัง db:seed, หลังทดสอบแต่ละขั้น, ก่อนซ้อมเดโม, เช้าวันสอบ
-- (เป็นคำสั่ง SELECT อย่างเดียว ไม่แก้ข้อมูล รันกี่ครั้งก็ได้)
--
-- กฎที่ฐานข้อมูลบังคับเองอยู่แล้ว (เกิดไม่ได้ จึงไม่ต้องตรวจที่นี่):
--   1 วัน-เวลา มี held/booked ได้ 1 · 1 คน booked ได้ 1 · 1 คน held ได้ 1
--   1 วัน-เวลา ปิดได้ 1 รายการ · 1 นัด เตือนแต่ละแบบ 1 ครั้ง
--   hold_expires_at มีค่าเฉพาะ held · no_show_at มีค่าเฉพาะ no_show
--
-- ข้อจำกัด: จับได้เฉพาะค่าที่ผิดจนเป็นไปไม่ได้ เช่น ถ้าเลื่อนนัดแล้วลืมแก้
-- updated_at แต่ค่าเก่ายังดูสมเหตุสมผล ไฟล์นี้จับไม่ได้ ต้องทดสอบด้วย DEMO_NOW
-- =====================================================================

-- 1) นัดที่ถูกสร้าง "หลัง" เวลานัด (created_at ไม่ได้มาจาก clock.js?)
SELECT 'จองหลังเวลานัด' AS problem, appointment_id AS row_id,
       'created_at ' || (created_at AT TIME ZONE 'Asia/Bangkok')
       || ' > นัด ' || appointment_date || ' ' || slot_time AS detail
FROM appointments
WHERE created_at > (appointment_date + slot_time) AT TIME ZONE 'Asia/Bangkok'

UNION ALL
-- 2) แก้ไขล่าสุด "ก่อน" สร้าง
SELECT 'updated_at ก่อน created_at', appointment_id,
       (created_at AT TIME ZONE 'Asia/Bangkok') || ' / ' || (updated_at AT TIME ZONE 'Asia/Bangkok')
FROM appointments
WHERE updated_at < created_at

UNION ALL
-- 3) เวลานัด / เวลาที่ปิด ไม่ใช่ 1 ใน 12 ช่วง (07:00–09:45 ทีละ 15 นาที) หรือไม่ใช่วันเสาร์–อาทิตย์
SELECT 'นัดไม่ตรงช่วงเวลาของคลินิก', appointment_id,
       appointment_date || ' ' || slot_time
FROM appointments
WHERE slot_time NOT BETWEEN '07:00' AND '09:45'
   OR EXTRACT(MINUTE FROM slot_time)::int % 15 <> 0
   OR EXTRACT(SECOND FROM slot_time) <> 0
   OR EXTRACT(ISODOW FROM appointment_date) NOT IN (6, 7)

UNION ALL
SELECT 'ช่วงที่ปิดไม่ตรงช่วงเวลาของคลินิก', closed_slot_id,
       slot_date || ' ' || slot_time
FROM closed_slots
WHERE slot_time NOT BETWEEN '07:00' AND '09:45'
   OR EXTRACT(MINUTE FROM slot_time)::int % 15 <> 0
   OR EXTRACT(SECOND FROM slot_time) <> 0
   OR EXTRACT(ISODOW FROM slot_date) NOT IN (6, 7)

UNION ALL
-- 4) ช่วงที่ปิดอยู่ แต่มีนัด held / booked ในวัน-เวลาเดียวกัน (การปิดกับการจองชนกัน)
SELECT 'ช่วงที่ปิดมีนัดอยู่', c.closed_slot_id,
       c.slot_date || ' ' || c.slot_time || ' นัด #' || a.appointment_id || ' ' || a.status
FROM closed_slots c
JOIN appointments a ON a.appointment_date = c.slot_date AND a.slot_time = c.slot_time
WHERE a.status IN ('held', 'booked')

UNION ALL
-- 5) วัน-เวลาเดียวกันมีนัดที่ยังไม่ยกเลิกเกิน 1 นัด (booked / completed / no_show) — ช่วงละ 1 คน
SELECT 'ช่วงเดียวกันมีนัดเกิน 1', NULL,
       appointment_date || ' ' || slot_time || ' = ' || count(*) || ' นัด'
FROM appointments
WHERE status IN ('booked', 'completed', 'no_show')
GROUP BY appointment_date, slot_time
HAVING count(*) > 1

UNION ALL
-- 6) completed / no_show แต่ยังไม่ถึงเวลานัด (ใช้เวลาจริงของฐานข้อมูล — ถ้าตั้ง DEMO_NOW ไว้ ข้อนี้อาจคลาดได้)
SELECT 'จบนัดก่อนถึงเวลานัด', appointment_id,
       status || ' / นัด ' || appointment_date || ' ' || slot_time
FROM appointments
WHERE status IN ('completed', 'no_show')
  AND (appointment_date + slot_time) AT TIME ZONE 'Asia/Bangkok' > now()

UNION ALL
-- 7) มีการแจ้งเตือนของแถวที่เป็นแค่การถือคิว (held ยังไม่ใช่นัด ไม่ควรมีการ์ดเตือน)
SELECT 'แจ้งเตือนของ held', n.notification_id,
       'นัด #' || a.appointment_id
FROM notifications n
JOIN appointments a ON a.appointment_id = n.appointment_id
WHERE a.status = 'held'

ORDER BY problem, row_id;

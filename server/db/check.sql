-- =====================================================================
-- check.sql — ตรวจหา "ข้อมูลที่เป็นไปไม่ได้" (บั๊กที่ไม่ขึ้น error)
-- วิธีใช้: ก๊อปทั้งไฟล์ → Supabase → SQL Editor → วาง → Run
--   ได้ 0 แถว ("Success. No rows returned") = ปกติ
--   มีแถวขึ้นมา = มีบั๊ก → ดูคอลัมน์ problem ว่าผิดแบบไหน, row_id = รหัสแถว
-- ควรรัน: หลัง db:seed, หลังทดสอบแต่ละขั้น, ก่อนซ้อมเดโม, เช้าวันสอบ
-- (เป็นคำสั่ง SELECT อย่างเดียว ไม่แก้ข้อมูล รันกี่ครั้งก็ได้)
--
-- ข้อจำกัด: จับได้เฉพาะค่าที่ผิดจนเป็นไปไม่ได้ เช่น ถ้าเลื่อนนัดแล้วลืมแก้
-- updated_at แต่ค่าเก่ายังดูสมเหตุสมผล ไฟล์นี้จับไม่ได้ ต้องทดสอบด้วย DEMO_NOW
-- =====================================================================

-- 1) นัดที่ถูกสร้าง "หลัง" เวลานัด (created_at ไม่ได้มาจาก clock.js?)
SELECT 'จองหลังเวลานัด' AS problem, a.appointment_id AS row_id,
       'created_at ' || (a.created_at AT TIME ZONE 'Asia/Bangkok')
       || ' > นัด ' || s.slot_date || ' ' || s.start_time AS detail
FROM appointments a
JOIN time_slots s ON s.slot_id = a.slot_id
WHERE a.created_at > (s.slot_date + s.start_time) AT TIME ZONE 'Asia/Bangkok'

UNION ALL
-- 2) แก้ไขล่าสุด "ก่อน" สร้าง
SELECT 'updated_at ก่อน created_at', appointment_id,
       (created_at AT TIME ZONE 'Asia/Bangkok') || ' / ' || (updated_at AT TIME ZONE 'Asia/Bangkok')
FROM appointments
WHERE updated_at < created_at

UNION ALL
-- 3) นัด booked แต่ช่วงเวลาไม่ได้เป็น booked (#13: ต้องแก้ 2 ตารางใน transaction เดียว)
SELECT 'นัด booked แต่ slot ไม่ใช่ booked', a.appointment_id,
       'slot ' || s.slot_id || ' = ' || s.slot_status
FROM appointments a
JOIN time_slots s ON s.slot_id = a.slot_id
WHERE a.status = 'booked' AND s.slot_status <> 'booked'

UNION ALL
-- 4) ช่วงเวลา booked แต่ไม่มีนัด booked / no_show อยู่เลย
--    (นัดไม่มา → คิวคงเป็น booked เพราะเวลาผ่านแล้ว ไม่มีใครจองต่อได้ — ตกลง 12 ต.ค.)
SELECT 'slot booked แต่ไม่มีนัด booked/no_show', s.slot_id,
       s.slot_date || ' ' || s.start_time
FROM time_slots s
WHERE s.slot_status = 'booked'
  AND NOT EXISTS (SELECT 1 FROM appointments a
                  WHERE a.slot_id = s.slot_id AND a.status IN ('booked', 'no_show'))

UNION ALL
-- 5) held ต้องมี held_by_user_id + hold_expires_at คู่กัน · สถานะอื่นต้องเป็น null ทั้งคู่
SELECT 'ค่า hold ไม่ตรงกับสถานะ', slot_id,
       slot_status || ' / held_by=' || COALESCE(held_by_user_id::text, 'null')
       || ' / expires=' || COALESCE(hold_expires_at::text, 'null')
FROM time_slots
WHERE (slot_status = 'held'  AND (held_by_user_id IS NULL OR hold_expires_at IS NULL))
   OR (slot_status <> 'held' AND (held_by_user_id IS NOT NULL OR hold_expires_at IS NOT NULL))

UNION ALL
-- 6) no_show ต้องมี no_show_at · สถานะอื่นต้องเป็น null
SELECT 'ค่า no_show_at ไม่ตรงกับสถานะ', appointment_id,
       status || ' / no_show_at=' || COALESCE(no_show_at::text, 'null')
FROM appointments
WHERE (status = 'no_show'  AND no_show_at IS NULL)
   OR (status <> 'no_show' AND no_show_at IS NOT NULL)

UNION ALL
-- 7) ผู้ป่วย 1 คนมีนัด booked ที่ยังไม่ถึงเวลาเกิน 1 นัด (กฎ: นัด active ได้ 1 นัด)
--    ใช้เวลาจริงของฐานข้อมูล — ถ้าตั้ง DEMO_NOW ไว้ ข้อนี้อาจคลาดได้
SELECT 'มีนัด active เกิน 1 นัด', a.user_id,
       count(*) || ' นัด'
FROM appointments a
JOIN time_slots s ON s.slot_id = a.slot_id
WHERE a.status = 'booked'
  AND (s.slot_date + s.start_time) AT TIME ZONE 'Asia/Bangkok' > now()
GROUP BY a.user_id
HAVING count(*) > 1

UNION ALL
-- 8) ผู้ป่วย 1 คนถือคิวพร้อมกันเกิน 1 ช่อง (กฎ: hold ทีละ 1)
SELECT 'ถือคิวเกิน 1 ช่อง', held_by_user_id,
       count(*) || ' ช่อง'
FROM time_slots
WHERE slot_status = 'held'
GROUP BY held_by_user_id
HAVING count(*) > 1

ORDER BY problem, row_id;

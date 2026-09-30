// ฟังก์ชันกลางสำหรับเรียก API ของ backend ด้วย fetch
// ตัวอย่าง: const data = await apiRequest('/api/slots?date=2026-10-03')
export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // ส่ง session cookie ไปด้วย (ใช้กับ staff)
    ...options,
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || `เกิดข้อผิดพลาด (${response.status})`)
  }
  return data
}

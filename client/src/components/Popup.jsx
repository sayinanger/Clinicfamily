// ป๊อปอัปของหน้าผู้ป่วย — ใช้ร่วมกันหลายหน้า (หน้าจองคิว, หน้าเลื่อนนัด, หน้ายกเลิก/เลื่อนนัด)
// ย้ายมาจาก LiffBooking.jsx ในขั้น 7.5 (หน้าตาเหมือนเดิมทุกอย่าง)

// กรอบป๊อปอัป: พื้นดำจาง 45% เต็มจอ + การ์ดขาวกลางจอ (Figma 278:198 / 278:307 / 278:411)
// children = เนื้อหาข้างในการ์ด
// onClose = ถ้าส่งมา จะมีปุ่มกากบาท ✕ มุมขวาบน (กดแล้วเรียก onClose)
export function Popup({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6">
      <div className="relative flex w-full max-w-[340px] flex-col items-center gap-[10px] rounded-[12px] bg-white px-[28px] pt-[28px] pb-[26px] text-center">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center text-[22px] leading-none text-muted"
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

// หัวข้อในป๊อปอัป (26px ตัวหนา) — color = คลาสสีตัวหนังสือ
export function PopupTitle({ children, color = 'text-black' }) {
  return <p className={`text-[26px] leading-[1.4] font-bold ${color}`}>{children}</p>
}

// บรรทัดข้อความในป๊อปอัป (18px)
export function PopupText({ children }) {
  return <p className="w-full text-[18px] leading-[1.4] font-medium whitespace-pre-wrap text-black">{children}</p>
}

// เวลานัดตัวใหญ่ในป๊อปอัป (34px ตัวหนา สีเขียว) — เด่นที่สุดในการ์ด กันกดผิดเวลา
export function PopupBigTime({ children }) {
  return <p className="text-[34px] leading-[1.2] font-bold text-primary">{children}</p>
}

// สีปุ่มในป๊อปอัป: green = พื้นเขียวอ่อน, red = กรอบแดง, gray = กรอบเทา (ขั้น 7.5)
const POPUP_BUTTON_COLORS = {
  green: 'bg-primary-light text-primary',
  red: 'border-[1.5px] border-liff-red-border bg-white text-liff-red',
  gray: 'border-[1.5px] border-[#CCCCCC] bg-white text-[#555555]',
}

// ปุ่มในป๊อปอัป — variant เลือกสีจาก POPUP_BUTTON_COLORS
export function PopupButton({ children, onClick, disabled, variant = 'green' }) {
  const colors = POPUP_BUTTON_COLORS[variant]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[6px] px-[22px] py-[8px] text-[18px] leading-[1.4] font-semibold disabled:opacity-60 ${colors}`}
    >
      {children}
    </button>
  )
}

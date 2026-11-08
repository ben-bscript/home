import { useEffect, useRef, useState } from 'react'

// Hue around the wheel, saturation from the white centre outwards.
export function hexToHs(hex) {
  const [r, g, b] = (hex ?? '#ffffff').match(/\w\w/g).map((h) => parseInt(h, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const s = max ? d / max : 0
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s }
}

export function hsToHex(h, s, v = 1) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`
}

// A colour wheel the finger can drag over. The colour is sent when the finger
// lifts, so a drag is one command.
export default function ColorWheel({ value, disabled, onChange }) {
  const ref = useRef(null)
  const [draft, setDraft] = useState(() => hexToHs(value))
  const dragging = useRef(false)

  useEffect(() => {
    if (!dragging.current && value) setDraft(hexToHs(value))
  }, [value])

  function pick(e) {
    const rect = ref.current.getBoundingClientRect()
    const radius = rect.width / 2
    const x = e.clientX - rect.left - radius
    const y = e.clientY - rect.top - radius
    // The gradient starts with red at 3 o'clock and runs clockwise, like atan2.
    const h = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
    const s = Math.min(1, Math.hypot(x, y) / radius)
    setDraft({ h, s })
    return { h, s }
  }

  const { h, s } = draft
  const angle = (h * Math.PI) / 180
  const color = hsToHex(h, s)

  return (
    <div
      ref={ref}
      className={`wheel${disabled ? ' disabled' : ''}`}
      role="slider"
      aria-label="Kleur"
      aria-valuetext={color}
      onPointerDown={(e) => {
        if (disabled) return
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        pick(e)
      }}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        const { h: hue, s: sat } = pick(e)
        onChange(hsToHex(hue, sat))
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      <span
        className="wheel-thumb"
        style={{
          left: `${50 + Math.cos(angle) * s * 50}%`,
          top: `${50 + Math.sin(angle) * s * 50}%`,
          background: color,
        }}
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

// Number stepper that commits after a short pause, so repeated clicks
// result in a single command.
export default function Stepper({ value, min, max, step = 1, format = String, disabled, onCommit }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  function change(delta) {
    const next = Math.min(max, Math.max(min, draft + delta))
    setDraft(next)
    clearTimeout(timer.current)
    if (next !== value) timer.current = setTimeout(() => onCommit(next), 800)
  }

  return (
    <div className="stepper">
      <button type="button" aria-label="Decrease" disabled={disabled || draft <= min} onClick={() => change(-step)}>−</button>
      <output>{format(draft)}</output>
      <button type="button" aria-label="Increase" disabled={disabled || draft >= max} onClick={() => change(step)}>+</button>
    </div>
  )
}

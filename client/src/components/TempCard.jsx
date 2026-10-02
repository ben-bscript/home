import { useEffect, useRef, useState } from 'react'
import { formatTemp } from '../format.js'

// Target temperature with −/+ and a slider. Commits after a short pause, so
// repeated taps or a drag result in a single command.
export default function TempCard({ target, disabled, onCommit }) {
  const [draft, setDraft] = useState(target?.value)
  const timer = useRef(null)

  useEffect(() => {
    setDraft(target?.value)
  }, [target?.value])

  useEffect(() => () => clearTimeout(timer.current), [])

  if (!target) {
    return (
      <div className="card temp-card">
        <div className="muted center">Geen doeltemperatuur in deze modus</div>
      </div>
    )
  }

  const { value, min, max, step } = target
  const percent = ((draft - min) / (max - min)) * 100

  function change(next) {
    next = Math.min(max, Math.max(min, next))
    setDraft(next)
    clearTimeout(timer.current)
    if (next !== value) timer.current = setTimeout(() => onCommit(next), 800)
  }

  return (
    <div className="card temp-card">
      <div className="temp-row">
        <button type="button" className="round" aria-label="Lager" disabled={disabled || draft <= min} onClick={() => change(draft - step)}>−</button>
        <output className="temp-value">
          {formatTemp(draft)}
          <span>°C</span>
        </output>
        <button type="button" className="round" aria-label="Hoger" disabled={disabled || draft >= max} onClick={() => change(draft + step)}>+</button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-label="Doeltemperatuur"
        style={{ '--fill': `${percent}%` }}
        onChange={(e) => change(Number(e.target.value))}
      />
    </div>
  )
}

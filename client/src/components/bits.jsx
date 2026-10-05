export function Chips({ options, value, disabled, onChange }) {
  return (
    <div className="chips">
      {options.map(([key, label]) => (
        <button key={key} type="button" className={key === value ? 'active' : ''} disabled={disabled} onClick={() => key !== value && onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ value, unit, label }) {
  return (
    <div className="stat">
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="muted">{label}</div>
    </div>
  )
}

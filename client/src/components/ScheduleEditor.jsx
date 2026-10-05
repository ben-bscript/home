import { useEffect, useState } from 'react'
import { DAY_LABELS, FAN_LABELS, MODE_LABELS } from '../format.js'

// Schedule actions are stored per period as { "HH:MM:SS": action }. The editor
// works on a list of rows per period and converts back on save.
function toRows(actions) {
  return Object.fromEntries(
    Object.entries(actions).map(([period, byTime]) => [
      period,
      Object.entries(byTime)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, action]) => ({ time: time.slice(0, 5), ...action })),
    ]),
  )
}

function toActions(rows) {
  const actions = {}
  for (const [period, list] of Object.entries(rows)) {
    if (!list.length) continue
    actions[period] = Object.fromEntries(list.map(({ time, ...action }) => [`${time}:00`, action]))
  }
  return actions
}

const fanValue = (fanSpeed) => (fanSpeed?.currentMode === 'fixed' ? `fixed:${fanSpeed.modes?.fixed ?? 1}` : (fanSpeed?.currentMode ?? ''))

function fanOptions(fan) {
  if (!fan) return []
  return (fan.currentMode?.values ?? []).flatMap((mode) => {
    if (mode !== 'fixed') return [[mode, FAN_LABELS[mode] ?? mode]]
    const { minValue = 1, maxValue = 5 } = fan.modes?.fixed ?? {}
    return Array.from({ length: maxValue - minValue + 1 }, (_, i) => [`fixed:${minValue + i}`, `Stand ${minValue + i}`])
  })
}

// Keep only the settings that are valid for the action's operation mode.
function withMode(row, operationMode, types) {
  const next = { time: row.time, operationMode }
  const temp = types.roomTemperature?.[operationMode]
  if (temp) next.roomTemperature = Math.min(temp.maxValue, Math.max(temp.minValue, row.roomTemperature ?? 21))
  if (types.fanSpeed?.[operationMode]) next.fanSpeed = { currentMode: 'auto' }
  if (operationMode !== 'off' && types.econoMode) next.econoMode = row.econoMode ?? 'off'
  return next
}

function ActionRow({ row, types, disabled, onChange, onRemove }) {
  const temp = types.roomTemperature?.[row.operationMode]
  const fans = fanOptions(types.fanSpeed?.[row.operationMode])
  return (
    <div className="action">
      <input type="time" value={row.time} disabled={disabled} aria-label="Starttijd" onChange={(e) => onChange({ ...row, time: e.target.value })} />
      <select value={row.operationMode} disabled={disabled} aria-label="Modus" onChange={(e) => onChange(withMode(row, e.target.value, types))}>
        {(types.operationMode?.values ?? []).map((m) => <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>)}
      </select>
      {temp && (
        <input
          type="number"
          value={row.roomTemperature}
          min={temp.minValue}
          max={temp.maxValue}
          step={temp.stepValue}
          disabled={disabled}
          aria-label="Temperatuur"
          onChange={(e) => onChange({ ...row, roomTemperature: Number(e.target.value) })}
        />
      )}
      {fans.length > 0 && (
        <select
          value={fanValue(row.fanSpeed)}
          disabled={disabled}
          aria-label="Ventilator"
          onChange={(e) => {
            const [mode, speed] = e.target.value.split(':')
            onChange({ ...row, fanSpeed: speed ? { currentMode: mode, modes: { fixed: Number(speed) } } : { currentMode: mode } })
          }}
        >
          {fans.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      )}
      {row.econoMode != null && (
        <label className="check">
          <input type="checkbox" checked={row.econoMode === 'on'} disabled={disabled} onChange={(e) => onChange({ ...row, econoMode: e.target.checked ? 'on' : 'off' })} />
          Econo
        </label>
      )}
      <button type="button" disabled={disabled} aria-label="Actie verwijderen" onClick={onRemove}>✕</button>
    </div>
  )
}

export default function ScheduleEditor({ schedule, disabled, onSave }) {
  const [rows, setRows] = useState(() => toRows(schedule.actions))
  const types = schedule.actionTypes
  const dirty = JSON.stringify(toActions(rows)) !== JSON.stringify(toActions(toRows(schedule.actions)))
  const duplicate = Object.values(rows).some((list) => new Set(list.map((r) => r.time)).size !== list.length)

  // Devices are refetched regularly; only reset the draft when the saved schedule changed.
  const saved = JSON.stringify(schedule.actions)
  useEffect(() => {
    setRows(toRows(JSON.parse(saved)))
  }, [saved])

  const update = (period, list) => setRows({ ...rows, [period]: list })

  return (
    <div className="schedule">
      {schedule.periods.map((period) => {
        const list = rows[period] ?? []
        return (
          <div key={period} className="period">
            <div className="period-head">
              <strong>{DAY_LABELS[period] ?? period}</strong>
              {!schedule.readOnly && (
                <button
                  type="button"
                  disabled={disabled || (schedule.maxActions != null && list.length >= schedule.maxActions)}
                  onClick={() => update(period, [...list, withMode({ time: '08:00' }, types.operationMode?.values?.[0] ?? 'off', types)])}
                >
                  Actie toevoegen
                </button>
              )}
            </div>
            {list.map((row, i) => (
              <ActionRow
                key={i}
                row={row}
                types={types}
                disabled={disabled || schedule.readOnly}
                onChange={(next) => update(period, list.map((r, j) => (j === i ? next : r)))}
                onRemove={() => update(period, list.filter((_, j) => j !== i))}
              />
            ))}
            {!list.length && <div className="muted">Geen acties</div>}
          </div>
        )
      })}
      {duplicate && <p className="error">Twee acties op dezelfde dag hebben dezelfde starttijd.</p>}
      {!schedule.readOnly && (
        <button type="button" className="primary" disabled={disabled || !dirty || duplicate} onClick={() => onSave(toActions(rows))}>
          Planning opslaan
        </button>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { formatTemp } from '../format.js'

const RANGES = [
  ['day', 'Dag'],
  ['week', 'Week'],
]

// One small chart per measure: they have different units, so they never share an axis.
const SERIES = [
  { key: 'level', label: 'Luchtstroom', unit: '%', zero: true },
  { key: 'humidity', label: 'Luchtvochtigheid', unit: '%' },
  { key: 'temperature', label: 'Temperatuur', unit: '°C' },
]

const WIDTH = 300
const HEIGHT = 64

const formatValue = (value, unit) => (value == null ? '–' : `${formatTemp(value)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`)

function formatTime(t, range) {
  const date = new Date(t)
  const time = date.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
  return range === 'week' ? `${date.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric' })} ${time}` : time
}

function Chart({ series, history, hover, onHover }) {
  const { points, from, to, bucket } = history
  const values = points.map((p) => p[series.key]).filter((v) => v != null)
  if (!values.length) return null
  const latest = values.at(-1)
  const shown = hover ? hover[series.key] : latest

  let min = series.zero ? 0 : Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 1) {
    min -= 0.5
    max += 0.5
  }
  const x = (t) => ((t - from) / (to - from)) * WIDTH
  const y = (v) => HEIGHT - 3 - ((v - min) / (max - min)) * (HEIGHT - 6)

  // Break the line where readings are missing (server was off) instead of bridging the gap.
  const segments = []
  let previous = null
  for (const p of points) {
    if (p[series.key] == null) continue
    if (!previous || p.t - previous.t > bucket * 2.5) segments.push([])
    segments.at(-1).push(p)
    previous = p
  }
  const line = (segment) => segment.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[series.key]).toFixed(1)}`).join('')

  function track(event) {
    const box = event.currentTarget.getBoundingClientRect()
    const t = from + ((event.clientX - box.left) / box.width) * (to - from)
    let nearest = null
    for (const p of points) if (!nearest || Math.abs(p.t - t) < Math.abs(nearest.t - t)) nearest = p
    onHover(nearest)
  }

  return (
    <div className="chart">
      <div className="chart-head">
        <span>{series.label}</span>
        <strong>{formatValue(shown, series.unit)}</strong>
      </div>
      <div className="chart-body">
        <div className="chart-plot" onPointerMove={track} onPointerDown={track} onPointerLeave={() => onHover(null)}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${series.label}: nu ${formatValue(latest, series.unit)}`}>
            <line className="chart-grid" x1="0" x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
            {segments.map((segment, i) => (
              <g key={i}>
                <path className="chart-area" d={`${line(segment)}L${x(segment.at(-1).t).toFixed(1)},${HEIGHT}L${x(segment[0].t).toFixed(1)},${HEIGHT}Z`} />
                <path className="chart-line" d={line(segment)} />
              </g>
            ))}
          </svg>
          {hover && hover[series.key] != null && (
            <>
              <span className="chart-cross" style={{ left: `${(x(hover.t) / WIDTH) * 100}%` }} />
              <span className="chart-dot" style={{ left: `${(x(hover.t) / WIDTH) * 100}%`, top: `${(y(hover[series.key]) / HEIGHT) * 100}%` }} />
            </>
          )}
        </div>
        <div className="chart-range">
          <span>{formatValue(Math.round(max * 10) / 10, series.unit)}</span>
          <span>{formatValue(Math.round(min * 10) / 10, series.unit)}</span>
        </div>
      </div>
    </div>
  )
}

export default function History({ deviceId }) {
  const [range, setRange] = useState('day')
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(null)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    let active = true
    const load = () =>
      api.history(deviceId, range).then(
        (data) => active && (setHistory(data), setError(null)),
        (err) => active && setError(err.message),
      )
    setHover(null)
    load()
    const timer = setInterval(load, 60000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [deviceId, range])

  // Hourly rows for the table view.
  const rows = useMemo(() => {
    if (!history) return []
    const step = range === 'week' ? 6 * 3600000 : 3600000
    const seen = new Set()
    return history.points.filter((p) => {
      const key = Math.floor(p.t / step)
      return seen.has(key) ? false : seen.add(key)
    })
  }, [history, range])

  const current = history?.range === range ? history : null

  return (
    <div className="card">
      <div className="card-head">
        <h2>Historiek</h2>
        <div className="tabs small" role="tablist">
          {RANGES.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={key === range} onClick={() => setRange(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {current && !current.points.length && (
        <p className="muted">Nog geen metingen. De server bewaart elke minuut een meting zolang hij draait.</p>
      )}
      {current && current.points.length > 0 && (
        <>
          <div className="chart-time muted">{hover ? formatTime(hover.t, range) : 'Nu'}</div>
          {SERIES.map((series) => (
            <Chart key={series.key} series={series} history={current} hover={hover} onHover={setHover} />
          ))}
          <div className="chart-axis muted">
            <span>{formatTime(current.from, range)}</span>
            <span>{formatTime((current.from + current.to) / 2, range)}</span>
            <span>nu</span>
          </div>
          <details className="chart-table">
            <summary>Als tabel</summary>
            <table>
              <thead>
                <tr>
                  <th />
                  {SERIES.map((s) => <th key={s.key}>{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.t}>
                    <th>{formatTime(p.t, range)}</th>
                    {SERIES.map((s) => <td key={s.key}>{formatValue(p[s.key], s.unit)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  )
}

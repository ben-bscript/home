import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatTemp } from '../format.js'
import { useDevices } from '../store.js'
import { Chips, Stat } from './bits.jsx'
import History from './History.jsx'
import { FanIcon, PowerIcon } from './icons.jsx'
import Toggle from './Toggle.jsx'

const DURATIONS = [
  [900, '15 min'],
  [1800, '30 min'],
  [3600, '1 uur'],
  [7200, '2 uur'],
]

const ROOM_TYPES = { BathRoom: 'Badkamer', Toilet: 'Toilet', Kitchen: 'Keuken', LaundryRoom: 'Wasplaats' }
const TRIGGERS = { None: null, RH: 'vochtigheid', AH: 'vochtigheid', VOC: 'luchtkwaliteit', Boost: 'boost' }

function formatRemaining(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return days ? `${days} d ${hours} u` : `${hours} u ${Math.floor((seconds % 3600) / 60)} min`
}

// Counts the boost down locally between refreshes.
function useCountdown(remaining, running) {
  const [left, setLeft] = useState(remaining)

  useEffect(() => {
    setLeft(remaining)
    if (!running) return
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [remaining, running])

  return left
}

function Slider({ value, min, max, step, unit, label, disabled, onChange }) {
  return (
    <label className="slider">
      <span>
        {label}
        <strong>
          {value}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Boost({ boost, left, disabled, onChange }) {
  const [level, setLevel] = useState(boost.defaultLevel)
  const [timeout, setTimeout_] = useState(boost.defaultTimeout)
  const durations = DURATIONS.some(([seconds]) => seconds === timeout) ? DURATIONS : [[timeout, `${Math.round(timeout / 60)} min`], ...DURATIONS]

  return (
    <div className="card">
      <div className="card-head">
        <h2>Boost</h2>
        {boost.enabled && <span className="badge ok">{Math.round(boost.level)}% · nog {formatRemaining(left)}</span>}
      </div>
      <div className="stack">
        <Slider label="Niveau" unit="%" min={10} max={200} step={10} value={level} disabled={disabled} onChange={setLevel} />
        <Chips options={durations} value={timeout} disabled={disabled} onChange={setTimeout_} />
        <button type="button" className="primary wide" disabled={disabled} onClick={() => onChange({ enable: true, level, timeout })}>
          {boost.enabled ? 'Boost opnieuw starten' : 'Boost starten'}
        </button>
        {boost.enabled && (
          <button type="button" className="wide" disabled={disabled} onClick={() => onChange({ enable: false })}>
            Boost stoppen
          </button>
        )}
      </div>
    </div>
  )
}

function Silent({ silent, disabled, onChange }) {
  const [reduction, setReduction] = useState(silent.reduction)

  useEffect(() => {
    setReduction(silent.reduction)
  }, [silent.reduction])

  return (
    <div className="card">
      <div className="card-head">
        <h2>Stille modus</h2>
        <Toggle checked={silent.enabled} disabled={disabled} label="Stille modus" onChange={(enable) => onChange({ enable })} />
      </div>
      <div className="stack">
        <Slider label="Reductie" unit="%" min={0} max={100} step={1} value={Math.round(reduction)} disabled={disabled} onChange={setReduction} />
        <button type="button" className="wide" disabled={disabled || reduction === silent.reduction} onClick={() => onChange({ reduction })}>
          Reductie opslaan
        </button>
      </div>
    </div>
  )
}

function Breeze({ breeze, disabled, onChange }) {
  const [threshold, setThreshold] = useState(breeze.tempThreshold)

  useEffect(() => {
    setThreshold(breeze.tempThreshold)
  }, [breeze.tempThreshold])

  return (
    <div className="card">
      <div className="card-head">
        <h2>Breeze (zomerkoeling)</h2>
        <Toggle checked={breeze.enabled} disabled={disabled} label="Breeze" onChange={(enable) => onChange({ enable })} />
      </div>
      <div className="dates">
        <label>
          Vanaf
          <input type="number" min={10} max={40} step={0.5} value={threshold} disabled={disabled} onChange={(e) => setThreshold(Number(e.target.value))} />
          °C
        </label>
        <button type="button" disabled={disabled || threshold === breeze.tempThreshold} onClick={() => onChange({ tempThreshold: threshold })}>
          Opslaan
        </button>
      </div>
    </div>
  )
}

export default function Ventilation({ device, dockSlot }) {
  const command = useDevices((s) => s.command)
  const offline = device.online === false
  const pending = useDevices((s) => s.pending[device.id]) || offline
  const { ventilation: v, info } = device
  const send = (name) => (value) => command(device.id, name, value)
  const boosting = Boolean(v.boost?.enabled)
  const left = useCountdown(v.boost?.remaining ?? 0, boosting && !offline)
  const running = !offline && ((v.rpm ?? 0) > 0 || (v.flowRate ?? 0) > 0)
  const trigger = TRIGGERS[v.trigger] ?? (v.trigger && v.trigger !== 'None' ? v.trigger : null)

  let status = trigger ? `Automatisch · ${trigger}` : 'Automatisch'
  if (offline) status = 'Offline'
  else if (boosting) status = `Boost · ${formatRemaining(left)}`
  else if (v.silent?.enabled) status = 'Stille modus'

  const details = [
    ['Absolute vochtigheid', v.absoluteHumidity != null && `${formatTemp(v.absoluteHumidity)} g/kg`],
    ['Druk', v.pressure != null && `${formatTemp(v.pressure)} Pa`],
    ['Type ruimte', v.roomType && (ROOM_TYPES[v.roomType] ?? v.roomType)],
    ['Debiet', v.flowRate != null && `${formatTemp(v.flowRate)} m³/u`],
    ['Toerental', v.rpm != null && `${Math.round(v.rpm)} tpm`],
    ['Minimum debiet', v.minimum != null && `${formatTemp(v.minimum)} m³/u`],
    ['Nominaal debiet', v.nominal != null && `${formatTemp(v.nominal)} m³/u`],
    ['Sturing op vocht', v.demand && (v.demand.relativeHumidity || v.demand.absoluteHumidity ? 'Aan' : 'Uit')],
    ['Sturing op VOC', v.demand && (v.demand.voc ? 'Aan' : 'Uit')],
    ['Serienummer', info.serial],
    ['IP-adres', info.ipAddress ?? info.host],
    ['MAC-adres', info.macAddress],
    ['Wifi', info.ssid && `${info.ssid}${info.rssi != null ? ` (${Math.round(info.rssi)} dBm)` : ''}`],
    ['Actief sinds', info.uptime != null && formatUptime(info.uptime)],
    ['Firmware', info.firmware],
    ['Type', [info.product, info.subtype].filter(Boolean).join(' ')],
    ['Printplaat', info.pcbVersion],
    ['Motor', info.motorType],
  ].filter(([, value]) => value)

  return (
    <>
      <div className="status-pill">
        <span className={`dot${running ? ' on' : ''}`} />
        {status}
      </div>

      <div className="vent" aria-hidden="true">
        <div className={`vent-fan${running ? ' on' : ''}${boosting ? ' fast' : ''}`}>
          <FanIcon size={64} strokeWidth={1.2} />
        </div>
      </div>

      <div className="stats">
        {v.level != null ? <Stat value={v.level} unit="%" label="Luchtstroom" /> : v.flowRate != null && <Stat value={formatTemp(v.flowRate)} unit=" m³/u" label="Debiet" />}
        {v.temperature != null && <Stat value={formatTemp(v.temperature)} unit="°C" label="Binnen" />}
        {v.humidity != null && <Stat value={Math.round(v.humidity)} unit="%" label="Vochtigheid" />}
      </div>

      <div className="stack">
        {offline && <p className="error">De Renson Waves is niet bereikbaar op het netwerk. Er wordt automatisch opnieuw gezocht.</p>}
        {v.boost && <Boost boost={v.boost} left={left} disabled={pending} onChange={send('boost')} />}
        {v.silent && <Silent silent={v.silent} disabled={pending} onChange={send('silent')} />}
        {v.breeze && <Breeze breeze={v.breeze} disabled={pending} onChange={send('breeze')} />}
        <History deviceId={device.id} />

        <div className="card">
          <div className="card-head">
            <h2>Toestel</h2>
          </div>
          <dl className="info">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {v.boost && dockSlot && createPortal(
        <footer className="dock">
          <button type="button" disabled={pending} onClick={() => command(device.id, 'boost', { enable: !boosting })}>
            <span className={`dock-icon${boosting ? ' on' : ''}`}><PowerIcon /></span>
            {boosting ? 'Boost stoppen' : 'Boost'}
          </button>
        </footer>,
        dockSlot,
      )}
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import Consumption from '../components/Consumption.jsx'
import { BackIcon, FanIcon, PowerIcon, SnowIcon, TimerIcon } from '../components/icons.jsx'
import ScheduleEditor from '../components/ScheduleEditor.jsx'
import TempCard from '../components/TempCard.jsx'
import Toggle from '../components/Toggle.jsx'
import { fanLabel, FAN_LABELS, formatTemp, MODE_LABELS, SWING_LABELS, TOGGLE_GLYPHS, TOGGLE_LABELS } from '../format.js'
import { displayName, roomOfDevice } from '../rooms.js'
import { useDevices } from '../store.js'

function Chips({ options, value, disabled, onChange }) {
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

function Stat({ value, unit, label }) {
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

function Rename({ device, disabled, onRename }) {
  const [name, setName] = useState(device.name)

  useEffect(() => {
    setName(device.name)
  }, [device.name])

  return (
    <form
      className="rename"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && name.trim() !== device.name) onRename(name)
      }}
    >
      <input value={name} maxLength={device.climate.nameMaxLength} onChange={(e) => setName(e.target.value)} aria-label="Naam van het toestel" />
      <button type="submit" disabled={disabled || !name.trim() || name.trim() === device.name}>Naam wijzigen</button>
    </form>
  )
}

function Holiday({ holiday, disabled, onChange }) {
  const today = new Date().toLocaleDateString('sv')
  const [startDate, setStartDate] = useState(holiday.startDate ?? today)
  const [endDate, setEndDate] = useState(holiday.endDate ?? today)

  return (
    <div className="card">
      <div className="card-head">
        <h2>Vakantiemodus</h2>
        <Toggle
          checked={holiday.enabled}
          disabled={disabled || (!holiday.enabled && endDate < startDate)}
          label="Vakantiemodus"
          onChange={(enabled) => onChange(enabled ? { enabled, startDate, endDate } : { enabled })}
        />
      </div>
      <div className="dates">
        <label>
          Van
          <input type="date" value={startDate} min={today} disabled={disabled || holiday.enabled} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Tot
          <input type="date" value={endDate} min={startDate} disabled={disabled || holiday.enabled} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

const INFO_FIELDS = [
  ['indoorModel', 'Binnenunit'],
  ['indoorSerial', 'Serienummer binnen'],
  ['indoorSoftware', 'Software binnen'],
  ['outdoorModel', 'Buitenunit'],
  ['outdoorSerial', 'Serienummer buiten'],
  ['outdoorSoftware', 'Software buiten'],
  ['gatewayModel', 'Wifi-adapter'],
  ['firmware', 'Firmware adapter'],
  ['ipAddress', 'IP-adres'],
  ['macAddress', 'MAC-adres'],
  ['ssid', 'SSID'],
  ['timeZone', 'Tijdzone'],
  ['errorCode', 'Foutcode'],
  ['outdoorErrorCode', 'Foutcode buiten'],
]

function problems(info) {
  return [
    info.inError && 'Fout',
    info.inWarning && 'Waarschuwing',
    info.inCaution && 'Let op',
    info.modeConflict && 'Modusconflict met een andere binnenunit',
  ].filter(Boolean)
}

function Climate({ device }) {
  const command = useDevices((s) => s.command)
  const offline = device.online === false
  const pending = useDevices((s) => s.pending[device.id]) || offline
  const [picker, setPicker] = useState(null)
  const { climate, info } = device
  const on = climate.power
  const send = (name) => (value) => command(device.id, name, value)

  const fanOptions = (climate.fan?.modes ?? []).flatMap((mode) => {
    if (mode !== 'fixed' || !climate.fan.speed) return [[mode, FAN_LABELS[mode] ?? mode]]
    const { min, max } = climate.fan.speed
    return Array.from({ length: max - min + 1 }, (_, i) => [`fixed:${min + i}`, String(min + i)])
  })
  const fanValue = climate.fan?.mode === 'fixed' && climate.fan.speed ? `fixed:${climate.fan.speed.value}` : climate.fan?.mode

  async function setFan(key) {
    const [mode, speed] = key.split(':')
    if (mode !== climate.fan.mode) await command(device.id, 'fanMode', mode)
    if (speed) await command(device.id, 'fanSpeed', Number(speed))
  }

  const cycle = (swing, name) => () => {
    const next = swing.modes[(swing.modes.indexOf(swing.mode) + 1) % swing.modes.length]
    command(device.id, name, next)
  }

  const warnings = problems(info)

  return (
    <>
      <div className="status-pill">
        <span className={`dot${on ? ' on' : ''}`} />
        {offline ? 'Offline' : on ? (MODE_LABELS[climate.mode] ?? climate.mode) : 'Stand-by'}
      </div>

      <div className="unit" aria-hidden="true">
        <div className="unit-body">
          <span className={`dot${on ? ' on' : ''}`} />
        </div>
        <div className={`unit-air${on ? ' on' : ''}`} />
      </div>

      <div className="stats">
        {climate.outdoorTemperature != null && <Stat value={formatTemp(climate.outdoorTemperature)} unit="°C" label="Buiten" />}
        <Stat value={formatTemp(climate.roomTemperature)} unit="°C" label="Binnen" />
        {climate.roomHumidity != null && <Stat value={climate.roomHumidity} unit="%" label="Vochtigheid" />}
      </div>

      <div className="stack">
        {offline && <p className="error">De airco heeft geen verbinding met de Daikin-cloud en kan nu niet bediend worden. Controleer de wifi van de unit en vernieuw daarna.</p>}
        {warnings.length > 0 && <p className="error">{warnings.join(' · ')}</p>}

        <TempCard target={climate.targetTemperature} disabled={pending} onCommit={send('targetTemperature')} />

        <div className="tiles">
          <button type="button" className={`card tile${picker === 'mode' ? ' open' : ''}`} aria-expanded={picker === 'mode'} onClick={() => setPicker(picker === 'mode' ? null : 'mode')}>
            <span>
              <span className="muted">Modus</span>
              <strong>{MODE_LABELS[climate.mode] ?? climate.mode}</strong>
            </span>
            <SnowIcon size={24} />
          </button>
          <button type="button" className={`card tile${picker === 'fan' ? ' open' : ''}`} aria-expanded={picker === 'fan'} disabled={!climate.fan} onClick={() => setPicker(picker === 'fan' ? null : 'fan')}>
            <span>
              <span className="muted">Ventilator</span>
              <strong>{fanLabel(climate.fan)}</strong>
            </span>
            <FanIcon size={24} />
          </button>
        </div>
        {picker === 'mode' && (
          <Chips options={climate.modes.map((m) => [m, MODE_LABELS[m] ?? m])} value={climate.mode} disabled={pending} onChange={send('mode')} />
        )}
        {picker === 'fan' && climate.fan && <Chips options={fanOptions} value={fanValue} disabled={pending} onChange={setFan} />}

        <div className="card">
          <div className="card-head">
            <h2>Mijn functies</h2>
          </div>
          <div className="functions">
            {climate.toggles.map((t) => (
              <button key={t.id} type="button" className={`function${t.on ? ' on' : ''}`} aria-pressed={t.on} disabled={pending} onClick={() => command(device.id, 'toggle', { id: t.id, on: !t.on })}>
                <span>{TOGGLE_GLYPHS[t.id] ?? t.id.slice(0, 3).toUpperCase()}</span>
                {TOGGLE_LABELS[t.id] ?? t.id}
              </button>
            ))}
            {climate.swing.vertical && (
              <button type="button" className={`function${climate.swing.vertical.mode !== 'stop' ? ' on' : ''}`} disabled={pending} onClick={cycle(climate.swing.vertical, 'swingVertical')}>
                <span>⇅</span>
                {SWING_LABELS[climate.swing.vertical.mode] ?? climate.swing.vertical.mode}
              </button>
            )}
            {climate.swing.horizontal && (
              <button type="button" className={`function${climate.swing.horizontal.mode !== 'stop' ? ' on' : ''}`} disabled={pending} onClick={cycle(climate.swing.horizontal, 'swingHorizontal')}>
                <span>⇄</span>
                {SWING_LABELS[climate.swing.horizontal.mode] ?? climate.swing.horizontal.mode}
              </button>
            )}
          </div>
        </div>

        {climate.schedule && (
          <div className="card" id="planning">
            <div className="card-head">
              <h2>Planning</h2>
              <Toggle checked={climate.schedule.enabled} disabled={pending || !climate.schedule.settable} label="Planning" onChange={send('scheduleEnabled')} />
            </div>
            <ScheduleEditor schedule={climate.schedule} disabled={pending} onSave={send('scheduleActions')} />
          </div>
        )}

        {climate.holiday && <Holiday holiday={climate.holiday} disabled={pending} onChange={send('holiday')} />}

        {climate.consumption && (
          <div className="card">
            <div className="card-head">
              <h2>Verbruik</h2>
            </div>
            <Consumption data={climate.consumption} />
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Toestel</h2>
          </div>
          {climate.nameMaxLength && <Rename device={device} disabled={pending} onRename={send('name')} />}
          <dl className="info">
            {INFO_FIELDS.filter(([key]) => info[key]).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{info[key]}</dd>
              </div>
            ))}
            {info.updatedAt && (
              <div>
                <dt>Laatste update</dt>
                <dd>{new Date(info.updatedAt).toLocaleString('nl-BE')}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <footer className="dock">
        <button type="button" disabled={pending} onClick={() => command(device.id, 'power', !on)}>
          <span className={`dock-icon${on ? ' on' : ''}`}><PowerIcon /></span>
          {on ? 'Uit' : 'Aan'}
        </button>
        {climate.schedule && (
          <button type="button" onClick={() => document.getElementById('planning')?.scrollIntoView({ behavior: 'smooth' })}>
            <span className="dock-icon"><TimerIcon /></span>
            Planning
          </button>
        )}
      </footer>
    </>
  )
}

export default function Device() {
  const { id } = useParams()
  const { devices, loaded, error, fetch } = useDevices()
  const device = devices.find((d) => d.id === id)
  const room = roomOfDevice(id)

  useEffect(() => {
    if (!loaded) fetch()
  }, [loaded, fetch])

  return (
    <div className="screen detail">
      <header className="bar">
        <Link to="/" aria-label="Terug"><BackIcon /></Link>
        <h1>{device ? displayName(device) : 'Toestel'}</h1>
        <span className="bar-room">{room.name}</span>
      </header>
      {error && <p className="error">{error}</p>}
      {!device && !error && <p className="muted center">{loaded ? 'Toestel niet gevonden.' : 'Laden…'}</p>}
      {device?.climate && <Climate device={device} />}
      {device && !device.climate && <p className="muted center">Dit toestel wordt nog niet ondersteund.</p>}
    </div>
  )
}

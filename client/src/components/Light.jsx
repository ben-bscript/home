import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { allRooms, roomOfDevice } from '../rooms.js'
import { useDevices } from '../store.js'
import ColorWheel from './ColorWheel.jsx'
import { BulbIcon, PowerIcon } from './icons.jsx'

const COLORS = ['#ff4d4d', '#ff9f43', '#ffd84d', '#7bed9f', '#4dd2ff', '#5f6bff', '#b46bff', '#ff6bd5']

// Presets in the style of Hue's scenes. White scenes use a colour temperature
// (mired, warm is high); colour scenes a colour. Both set the brightness.
const SCENES = [
  { id: 'relax', name: 'Ontspannen', brightness: 56, colorTemp: 447, swatch: '#ffb35c' },
  { id: 'read', name: 'Lezen', brightness: 100, colorTemp: 346, swatch: '#ffd9a0' },
  { id: 'focus', name: 'Concentreren', brightness: 100, colorTemp: 233, swatch: '#f4f1e6' },
  { id: 'energy', name: 'Energie', brightness: 100, colorTemp: 156, swatch: '#dcebff' },
  { id: 'night', name: 'Nachtlampje', brightness: 1, colorTemp: 454, swatch: '#b8742b' },
  { id: 'sunset', name: 'Zonsondergang', brightness: 70, color: '#ff6a1f', swatch: '#ff6a1f' },
  { id: 'tropic', name: 'Tropisch', brightness: 80, color: '#ff3d8b', swatch: '#ff3d8b' },
  { id: 'forest', name: 'Bos', brightness: 60, color: '#2fbf71', swatch: '#2fbf71' },
  { id: 'ocean', name: 'Oceaan', brightness: 70, color: '#1f8fff', swatch: '#1f8fff' },
  { id: 'aurora', name: 'Noorderlicht', brightness: 50, color: '#5ce0c6', swatch: '#5ce0c6' },
]

// Power-on behaviour: generic Zigbee values and Hue's own.
const POWER_ON_LABELS = {
  on_previous: 'Aan, met laatste kleur',
  previous: 'Vorige toestand',
  recover: 'Vorige toestand',
  on: 'Aan',
  default: 'Aan (warm wit)',
  off: 'Uit',
  toggle: 'Omgekeerd',
}

const EFFECT_LABELS = {
  candle: 'Kaars',
  fireplace: 'Haardvuur',
  colorloop: 'Kleurenlus',
  color_loop: 'Kleurenlus',
  sunrise: 'Zonsopgang',
  sunset: 'Zonsondergang',
  sparkle: 'Fonkelen',
  opal: 'Opaal',
  glisten: 'Glinsteren',
  prism: 'Prisma',
  cosmos: 'Kosmos',
  sunbeam: 'Zonnestraal',
  enchant: 'Betoveren',
  drops: 'Druppels',
  underwater: 'Onderwater',
  breathe: 'Ademen',
  blink: 'Knipperen',
}
const WARM = '#ffb35c'
const COOL = '#e6f0ff'

// Commits after a short pause, so a drag sends one command instead of dozens.
function useDraft(value, onCommit, delay = 400) {
  const [draft, setDraft] = useState(value)
  const timer = useRef(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  function change(next) {
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onCommit(next), delay)
  }

  return [draft, change]
}

function Range({ label, value, min, max, step = 1, display, disabled, track, onChange }) {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <label className="slider">
      <span>
        {label}
        <strong>{display}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className={track ? 'tinted' : undefined}
        style={{ '--fill': `${percent}%`, ...(track ? { '--track-bg': track } : {}) }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

const mix = (a, b, t) => {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16))
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

// The colour the bulb on screen glows in.
export function lightColor(light) {
  if (!light.on) return null
  if (light.color?.value) return light.color.value
  if (light.colorTemp?.value != null) {
    const { value, min, max } = light.colorTemp
    return mix(COOL, WARM, (value - min) / (max - min || 1))
  }
  return '#ffd27a'
}

function RoomPicker({ device, disabled, onChange }) {
  const devices = useDevices((s) => s.devices)
  const current = roomOfDevice(device)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  if (adding) {
    return (
      <form
        className="rename"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onChange(name.trim())
          setAdding(false)
          setName('')
        }}
      >
        <input autoFocus value={name} placeholder="Bv. Woonkamer" maxLength={30} onChange={(e) => setName(e.target.value)} aria-label="Nieuwe kamer" />
        <button type="submit" disabled={disabled || !name.trim()}>Toevoegen</button>
        <button type="button" onClick={() => setAdding(false)}>Annuleren</button>
      </form>
    )
  }

  return (
    <select
      className="wide"
      value={current?.name ?? ''}
      disabled={disabled}
      aria-label="Kamer"
      onChange={(e) => (e.target.value === '+' ? setAdding(true) : onChange(e.target.value))}
    >
      <option value="">Geen kamer</option>
      {allRooms(devices).map((r) => (
        <option key={r.id} value={r.name}>{r.name}</option>
      ))}
      <option value="+">Nieuwe kamer…</option>
    </select>
  )
}

function Rename({ device, disabled, onRename }) {
  const [name, setName] = useState(device.name)

  useEffect(() => {
    setName(device.name)
  }, [device.name])

  const changed = name.trim() && name.trim() !== device.name
  return (
    <form
      className="rename"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) onRename(name.trim())
      }}
    >
      <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Naam van de lamp" />
      <button type="submit" disabled={disabled || !changed}>Naam wijzigen</button>
    </form>
  )
}

const kelvin = (mired) => Math.round(1e6 / mired / 50) * 50

export default function Light({ device, dockSlot }) {
  const command = useDevices((s) => s.command)
  const offline = device.online === false
  // Zigbee2MQTT can mark a lamp offline while it still listens, so it can
  // always be tried; an answer brings it back online.
  const pending = useDevices((s) => s.pending[device.id])
  const { light, info } = device
  const send = (name) => (value) => command(device.id, name, value)
  const glow = offline ? null : lightColor(light)

  const [brightness, setBrightness] = useDraft(light.brightness?.value ?? 100, send('brightness'))
  const [mired, setMired] = useDraft(light.colorTemp?.value ?? light.colorTemp?.min ?? 250, send('colorTemp'))

  return (
    <>
      <div className="status-pill">
        <span className={`dot${light.on && !offline ? ' on' : ''}`} />
        {offline ? 'Offline' : !light.known ? 'Status onbekend' : light.on ? (light.brightness?.value != null ? `Aan · ${light.brightness.value}%` : 'Aan') : 'Uit'}
      </div>

      <button
        type="button"
        className={`bulb${light.on && !offline ? ' on' : ''}`}
        style={glow ? { '--glow': glow } : undefined}
        disabled={pending}
        aria-label={light.on ? 'Uitzetten' : 'Aanzetten'}
        onClick={() => command(device.id, 'power', !light.on)}
      >
        <BulbIcon size={64} strokeWidth={1.2} />
      </button>

      <div className="stack">
        {offline && <p className="error">Zigbee2MQTT kreeg geen antwoord meer van deze lamp. Staat de schakelaar aan? Je kunt hem toch proberen te bedienen.</p>}

        {(light.brightness || light.colorTemp) && (
          <div className="card stack">
            {light.brightness && (
              <Range label="Helderheid" value={brightness} min={1} max={100} display={`${brightness}%`} disabled={pending} onChange={setBrightness} />
            )}
            {light.colorTemp && (
              <Range
                label="Wit licht"
                // Warm on the left: high mired is warm.
                value={light.colorTemp.max + light.colorTemp.min - mired}
                min={light.colorTemp.min}
                max={light.colorTemp.max}
                display={`${kelvin(mired)} K`}
                disabled={pending}
                track={`linear-gradient(to right, ${WARM}, ${COOL})`}
                onChange={(v) => setMired(light.colorTemp.max + light.colorTemp.min - v)}
              />
            )}
          </div>
        )}

        {(light.colorTemp || light.color) && (
          <div className="card">
            <div className="card-head">
              <h2>Scènes</h2>
            </div>
            <div className="scenes">
              {SCENES.filter((sc) => (sc.color ? light.color : light.colorTemp)).map((sc) => (
                <button key={sc.id} type="button" className="scene" disabled={pending} onClick={() => command(device.id, 'scene', sc)}>
                  <span className="scene-dot" style={{ background: sc.swatch }} />
                  {sc.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {light.color && (
          <div className="card">
            <div className="card-head">
              <h2>Kleur</h2>
              {light.color.value && <span className="scene-dot" style={{ background: light.color.value }} aria-label={`Huidige kleur ${light.color.value}`} />}
            </div>
            <ColorWheel value={light.color.value} disabled={pending} onChange={(hex) => command(device.id, 'color', hex)} />
            <div className="swatches">
              {COLORS.map((c) => (
                <button key={c} type="button" className={`swatch${light.color.value === c ? ' active' : ''}`} style={{ background: c }} aria-label={`Kleur ${c}`} disabled={pending} onClick={() => command(device.id, 'color', c)} />
              ))}
            </div>
          </div>
        )}

        {light.effects && (
          <div className="card">
            <div className="card-head">
              <h2>Effecten</h2>
              {light.effect && (
                <button type="button" className="link-button" disabled={pending} onClick={() => command(device.id, 'effect', null)}>Stoppen</button>
              )}
            </div>
            <div className="chips">
              {light.effects.map((ef) => (
                <button key={ef} type="button" className={light.effect === ef ? 'active' : ''} disabled={pending} onClick={() => command(device.id, 'effect', light.effect === ef ? null : ef)}>
                  {EFFECT_LABELS[ef] ?? ef.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Kamer</h2>
          </div>
          <RoomPicker device={device} disabled={pending} onChange={send('room')} />
        </div>

        {light.powerOn && (
          <div className="card">
            <div className="card-head">
              <h2>Na een stroomonderbreking</h2>
            </div>
            <p className="muted">
              Wat de lamp doet als hij via de schakelaar weer stroom krijgt. "Aan, met laatste kleur" is het handigst bij een muurschakelaar; met "Vorige toestand" blijft
              een lamp die uit stond ook uit.
            </p>
            <div className="chips">
              {light.powerOn.values.map((v) => (
                <button key={v} type="button" className={light.powerOn.value === v ? 'active' : ''} disabled={pending} onClick={() => command(device.id, 'powerOn', v)}>
                  {POWER_ON_LABELS[v] ?? v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Toestel</h2>
          </div>
          <Rename device={device} disabled={pending} onRename={send('name')} />
          <dl className="info">
            {[
              ['Model', [info.vendor, info.model].filter(Boolean).join(' ')],
              ['Omschrijving', info.description],
              ['Kanaal', info.endpoint],
              ['Signaal', info.linkquality != null && `${info.linkquality} / 255`],
              ['Naam in Zigbee2MQTT', info.friendlyName !== device.name && info.friendlyName],
              ['IEEE-adres', info.ieeeAddress],
              ['Laatst gezien', info.lastSeen && new Date(info.lastSeen).toLocaleString('nl-BE')],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      {dockSlot && createPortal(
        <footer className="dock">
          <button type="button" disabled={pending} onClick={() => command(device.id, 'power', !light.on)}>
            <span className={`dock-icon${light.on ? ' on' : ''}`}><PowerIcon /></span>
            {light.on ? 'Uit' : 'Aan'}
          </button>
        </footer>,
        dockSlot,
      )}
    </>
  )
}

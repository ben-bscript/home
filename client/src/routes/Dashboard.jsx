import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BulbIcon, FanIcon, GearIcon, RefreshIcon, SnowIcon } from '../components/icons.jsx'
import { lightColor } from '../components/Light.jsx'
import Toggle from '../components/Toggle.jsx'
import { formatTemp, greeting, MODE_LABELS } from '../format.js'
import { allRooms, devicesInRoom, displayName, unassignedDevices } from '../rooms.js'
import { useDevices, useProviders, useWeather } from '../store.js'

function DeviceRow({ device }) {
  const command = useDevices((s) => s.command)
  const pending = useDevices((s) => s.pending[device.id])
  const { climate, ventilation, light } = device
  const offline = device.online === false
  const on = !offline && Boolean(climate?.power || ventilation?.boost?.enabled || light?.on)

  let sub = device.model ?? 'Niet ondersteund'
  if (offline) sub = 'Offline'
  else if (light) {
    sub = !light.known ? 'Status onbekend' : on ? (light.brightness?.value != null ? `Aan · ${light.brightness.value}%` : 'Aan') : 'Uit'
  } else if (ventilation) {
    sub = [
      on ? 'Boost' : ventilation.level != null && `${ventilation.level}%`,
      ventilation.temperature != null && `${formatTemp(ventilation.temperature)}°C`,
      ventilation.humidity != null && `${Math.round(ventilation.humidity)}% vocht`,
    ].filter(Boolean).join(' · ')
  } else if (climate) {
    sub = on
      ? [climate.targetTemperature && `${formatTemp(climate.targetTemperature.value)}°C`, MODE_LABELS[climate.mode] ?? climate.mode].filter(Boolean).join(' · ')
      : 'Stand-by'
  }

  return (
    <div className="device-row">
      <Link to={`/devices/${encodeURIComponent(device.id)}`} className="device-link">
        {light ? (
          <span className={`icon-circle${on ? ' lit' : ''}`} style={on ? { '--glow': lightColor(light) } : undefined}><BulbIcon /></span>
        ) : (
          <span className={`icon-circle${on ? ' on' : ''}`}>{ventilation ? <FanIcon /> : <SnowIcon />}</span>
        )}
        <span>
          <span className="device-name">{displayName(device)}</span>
          <span className="device-sub">{sub}</span>
        </span>
      </Link>
      {climate && <Toggle checked={on} disabled={pending || offline} label={`${device.name} aan/uit`} onChange={(value) => command(device.id, 'power', value)} />}
      {light && <Toggle checked={on} disabled={pending || offline} label={`${device.name} aan/uit`} onChange={(value) => command(device.id, 'power', value)} />}
      {ventilation?.boost && <Toggle checked={on} disabled={pending || offline} label={`${device.name} boost`} onChange={(enable) => command(device.id, 'boost', { enable })} />}
    </div>
  )
}

const isLight = (d) => d.type === 'light' && d.online !== false

// "Alles aan" / "Alles uit" for the lights in a list of devices.
function LightsSwitch({ devices }) {
  const commandAll = useDevices((s) => s.commandAll)
  const lights = devices.filter(isLight)
  if (!lights.length) return null
  const anyOn = lights.some((d) => d.light.on)
  const targets = lights.filter((d) => d.light.on === anyOn)
  return (
    <button type="button" className="link-button" onClick={() => commandAll(targets.map((d) => d.id), 'power', !anyOn)}>
      {anyOn ? 'Alles uit' : 'Alles aan'}
    </button>
  )
}

function LightsSummary({ devices }) {
  const lights = devices.filter((d) => d.type === 'light')
  if (!lights.length) return null
  const on = lights.filter((d) => d.online !== false && d.light.on).length
  return (
    <div className="card lights-summary">
      <span className={`icon-circle${on ? ' lit' : ''}`}><BulbIcon /></span>
      <span>
        <span className="device-name">{on ? `${on} ${on === 1 ? 'lamp' : 'lampen'} aan` : 'Alle lampen uit'}</span>
        <span className="device-sub">{lights.length} {lights.length === 1 ? 'lamp' : 'lampen'} in huis</span>
      </span>
      <LightsSwitch devices={devices} />
    </div>
  )
}

function Room({ title, devices }) {
  return (
    <section className="room">
      <div className="room-head">
        <h2>{title}</h2>
        {devices.filter((d) => d.type === 'light').length > 1 && <LightsSwitch devices={devices} />}
      </div>
      <div className="card list">
        {devices.map((device) => <DeviceRow key={device.id} device={device} />)}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { devices, loaded, loading, error, fetch } = useDevices()
  const providers = useProviders((s) => s.providers)
  const providersLoaded = useProviders((s) => s.loaded)
  const connected = providers.some((p) => p.connected)
  const [params, setParams] = useSearchParams()
  // The tabs filter the overview; without a selection every room is shown.
  const roomList = allRooms(devices)
  const filter = roomList.find((r) => r.id === params.get('kamer'))
  const rooms = filter ? [filter] : roomList
  const unassigned = filter ? [] : unassignedDevices(devices)
  const otherLights = unassigned.filter((d) => d.type === 'light')
  const other = unassigned.filter((d) => d.type !== 'light')
  const weather = useWeather((s) => s.weather)
  const fetchWeather = useWeather((s) => s.fetch)

  useEffect(() => {
    fetchWeather()
  }, [fetchWeather])

  useEffect(() => {
    if (connected && !loaded) fetch()
  }, [connected, loaded, fetch])

  return (
    <div className="screen">
      <header className="home-head">
        <div>
          <div className="muted">{greeting()}</div>
          <h1>Mijn huis</h1>
        </div>
        <div className="home-side">
          {weather && (
            <div>
              <div className="outdoor">{formatTemp(weather.temperature)}°C</div>
              <div className="muted">{weather.location}</div>
            </div>
          )}
          <button type="button" className="icon-button" aria-label="Vernieuwen" disabled={loading || !connected} onClick={() => { fetch({ refresh: true }); fetchWeather() }}>
            <RefreshIcon />
          </button>
          <Link to="/settings" className="icon-button" aria-label="Instellingen"><GearIcon /></Link>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!filter} onClick={() => setParams({}, { replace: true })}>
          Alles
        </button>
        {roomList.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === filter?.id} onClick={() => setParams({ kamer: r.id }, { replace: true })}>
            {r.name}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {providersLoaded && !connected ? (
        <div className="card empty">
          <p>Nog geen account gekoppeld.</p>
          <Link className="button primary" to="/settings">Naar instellingen</Link>
        </div>
      ) : (
        <>
          {!filter && <LightsSummary devices={devices} />}
          {rooms.map((room) => {
            const roomDevices = devicesInRoom(room, devices)
            return roomDevices.length ? (
              <Room key={room.id} title={room.name} devices={roomDevices} />
            ) : (
              <section key={room.id} className="room">
                <h2>{room.name}</h2>
                <div className="card empty">
                  <p>{loaded ? `Nog geen toestellen in ${room.name}.` : 'Laden…'}</p>
                </div>
              </section>
            )
          })}
          {otherLights.length > 0 && <Room title="Lampen" devices={otherLights} />}
          {other.length > 0 && <Room title="Overige" devices={other} />}
        </>
      )}
    </div>
  )
}

import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FanIcon, GearIcon, RefreshIcon, SnowIcon } from '../components/icons.jsx'
import Toggle from '../components/Toggle.jsx'
import { formatTemp, greeting, MODE_LABELS } from '../format.js'
import { devicesInRoom, displayName, ROOMS, unassignedDevices } from '../rooms.js'
import { useDevices, useProviders, useWeather } from '../store.js'

function DeviceRow({ device }) {
  const command = useDevices((s) => s.command)
  const pending = useDevices((s) => s.pending[device.id])
  const { climate, ventilation } = device
  const offline = device.online === false
  const on = !offline && Boolean(climate?.power || ventilation?.boost?.enabled)

  let sub = device.model ?? 'Niet ondersteund'
  if (offline) sub = 'Offline'
  else if (ventilation) {
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
        <span className={`icon-circle${on ? ' on' : ''}`}>{ventilation ? <FanIcon /> : <SnowIcon />}</span>
        <span>
          <span className="device-name">{displayName(device)}</span>
          <span className="device-sub">{sub}</span>
        </span>
      </Link>
      {climate && <Toggle checked={on} disabled={pending || offline} label={`${device.name} aan/uit`} onChange={(value) => command(device.id, 'power', value)} />}
      {ventilation?.boost && <Toggle checked={on} disabled={pending || offline} label={`${device.name} boost`} onChange={(enable) => command(device.id, 'boost', { enable })} />}
    </div>
  )
}

export default function Dashboard() {
  const { devices, loaded, loading, error, fetch } = useDevices()
  const providers = useProviders((s) => s.providers)
  const providersLoaded = useProviders((s) => s.loaded)
  const connected = providers.some((p) => p.connected)
  const [params, setParams] = useSearchParams()
  // The tabs filter the overview; without a selection every room is shown.
  const filter = ROOMS.find((r) => r.id === params.get('kamer'))
  const rooms = filter ? [filter] : ROOMS
  const other = filter ? [] : unassignedDevices(devices)
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
        {ROOMS.map((r) => (
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
        rooms.map((room) => {
          const roomDevices = devicesInRoom(room, devices)
          return (
            <section key={room.id} className="room">
              <h2>{room.name}</h2>
              {roomDevices.length ? (
                <div className="card list">
                  {roomDevices.map((device) => <DeviceRow key={device.id} device={device} />)}
                </div>
              ) : (
                <div className="card empty">
                  <p>{loaded ? `Nog geen toestellen in ${room.name}.` : 'Laden…'}</p>
                </div>
              )}
            </section>
          )
        }).concat(
          other.length ? (
            <section key="other" className="room">
              <h2>Overige</h2>
              <div className="card list">
                {other.map((device) => <DeviceRow key={device.id} device={device} />)}
              </div>
            </section>
          ) : [],
        )
      )}
    </div>
  )
}

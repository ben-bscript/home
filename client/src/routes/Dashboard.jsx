import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { GearIcon, RefreshIcon, SnowIcon } from '../components/icons.jsx'
import Toggle from '../components/Toggle.jsx'
import { formatTemp, greeting, MODE_LABELS } from '../format.js'
import { devicesInRoom, ROOMS } from '../rooms.js'
import { useDevices, useProviders } from '../store.js'

function DeviceRow({ device }) {
  const command = useDevices((s) => s.command)
  const pending = useDevices((s) => s.pending[device.id])
  const { climate } = device
  const on = Boolean(climate?.power)

  let sub = device.model ?? 'Niet ondersteund'
  if (device.online === false) sub = 'Offline'
  else if (climate) {
    sub = on
      ? [climate.targetTemperature && `${formatTemp(climate.targetTemperature.value)}°C`, MODE_LABELS[climate.mode] ?? climate.mode].filter(Boolean).join(' · ')
      : 'Stand-by'
  }

  return (
    <div className="device-row">
      <Link to={`/devices/${encodeURIComponent(device.id)}`} className="device-link">
        <span className={`icon-circle${on ? ' on' : ''}`}><SnowIcon /></span>
        <span>
          <span className="device-name">{device.name}</span>
          <span className="device-sub">{sub}</span>
        </span>
      </Link>
      {climate && <Toggle checked={on} disabled={pending || device.online === false} label={`${device.name} aan/uit`} onChange={(value) => command(device.id, 'power', value)} />}
    </div>
  )
}

export default function Dashboard() {
  const { devices, loaded, loading, error, fetch } = useDevices()
  const providers = useProviders((s) => s.providers)
  const providersLoaded = useProviders((s) => s.loaded)
  const connected = providers.some((p) => p.connected)
  const [params, setParams] = useSearchParams()
  const room = ROOMS.find((r) => r.id === params.get('kamer')) ?? ROOMS[0]
  const roomDevices = devicesInRoom(room, devices)
  const outdoor = devices.find((d) => d.climate?.outdoorTemperature != null)?.climate.outdoorTemperature

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
          {outdoor != null && (
            <div>
              <div className="outdoor">{formatTemp(outdoor)}°C</div>
              <div className="muted">buiten</div>
            </div>
          )}
          <button type="button" className="icon-button" aria-label="Vernieuwen" disabled={loading || !connected} onClick={() => fetch({ refresh: true })}>
            <RefreshIcon />
          </button>
          <Link to="/settings" className="icon-button" aria-label="Instellingen"><GearIcon /></Link>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {ROOMS.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === room.id} onClick={() => setParams({ kamer: r.id }, { replace: true })}>
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
      ) : roomDevices.length ? (
        <div className="card list">
          {roomDevices.map((device) => <DeviceRow key={device.id} device={device} />)}
        </div>
      ) : (
        <div className="card empty">
          <p>{loaded ? `Nog geen airco gekoppeld in ${room.name}.` : 'Laden…'}</p>
        </div>
      )}
    </div>
  )
}

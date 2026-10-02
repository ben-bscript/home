import { useEffect } from 'react'
import { Link } from 'react-router'
import DeviceCard from '../components/DeviceCard.jsx'
import { useDevices, useProviders } from '../store.js'

export default function Dashboard() {
  const { devices, loaded, loading, error, fetch } = useDevices()
  const providers = useProviders((s) => s.providers)
  const providersLoaded = useProviders((s) => s.loaded)
  const connected = providers.some((p) => p.connected)

  useEffect(() => {
    if (connected && !loaded) fetch()
  }, [connected, loaded, fetch])

  if (providersLoaded && !connected) {
    return (
      <div className="empty">
        <h1>No devices yet</h1>
        <p>Connect an account to start controlling your home.</p>
        <Link className="button primary" to="/settings">Go to settings</Link>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>Devices</h1>
        <button onClick={() => fetch({ refresh: true })} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {loaded && !devices.length && !error && <p className="muted">No devices found on the connected accounts.</p>}
      <div className="grid">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>
    </>
  )
}

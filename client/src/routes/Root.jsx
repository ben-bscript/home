import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useDevices, useProviders } from '../store.js'

export default function Root() {
  const fetchProviders = useProviders((s) => s.fetch)

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  // Devices on the local network are cheap to read, so keep them current.
  const hasLocal = useDevices((s) => s.devices.some((d) => d.provider === 'renson' || d.provider === 'zigbee'))
  const poll = useDevices((s) => s.poll)

  useEffect(() => {
    if (!hasLocal) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') poll()
    }, 10000)
    return () => clearInterval(timer)
  }, [hasLocal, poll])

  // Coming back to the tab (or unlocking the phone) should show current state.
  const refresh = useDevices((s) => s.fetch)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useDevices.getState().loaded) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  return (
    <div className="app">
      <Outlet />
    </div>
  )
}

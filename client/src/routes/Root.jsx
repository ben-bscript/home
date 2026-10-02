import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useProviders } from '../store.js'

export default function Root() {
  const fetchProviders = useProviders((s) => s.fetch)

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  return (
    <div className="app">
      <Outlet />
    </div>
  )
}

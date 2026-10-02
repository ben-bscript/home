import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useProviders } from '../store.js'

export default function Root() {
  const fetchProviders = useProviders((s) => s.fetch)

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">Home</NavLink>
        <nav>
          <NavLink to="/" end>Devices</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}

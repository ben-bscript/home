import { create } from 'zustand'
import { api } from './api.js'

export const useProviders = create((set, get) => ({
  providers: [],
  loaded: false,
  error: null,
  fetch: async () => {
    try {
      set({ providers: await api.providers(), loaded: true, error: null })
    } catch (err) {
      set({ loaded: true, error: err.message })
    }
  },
  discover: async (id) => {
    await api.discover(id)
    await Promise.all([get().fetch(), useDevices.getState().fetch()])
  },
  setProvider: (status) => set((s) => ({ providers: s.providers.map((p) => (p.id === status.id ? status : p)) })),
  pair: async (id, seconds) => {
    try {
      const status = await api.pair(id, seconds)
      set((s) => ({ providers: s.providers.map((p) => (p.id === id ? status : p)), error: null }))
    } catch (err) {
      set({ error: err.message })
    }
  },
  logout: async (id) => {
    await api.logout(id)
    useDevices.setState({ devices: [], loaded: false })
    await get().fetch()
  },
}))

export const useWeather = create((set) => ({
  weather: null,
  fetch: async () => {
    try {
      set({ weather: await api.weather() })
    } catch {
      set({ weather: null })
    }
  },
}))

export const useDevices = create((set, get) => ({
  devices: [],
  loaded: false,
  loading: false,
  error: null,
  // ids of devices with a command in flight
  pending: {},
  fetch: async ({ refresh = false } = {}) => {
    if (get().loading) return
    set({ loading: true })
    try {
      set({ devices: await api.devices({ refresh }), loaded: true, error: null })
    } catch (err) {
      set({ loaded: true, error: err.message })
    } finally {
      set({ loading: false })
      useProviders.getState().fetch()
    }
  },
  // Background refresh for devices on the local network; errors are ignored
  // and nothing is replaced while a command is in flight.
  poll: async () => {
    if (get().loading || Object.values(get().pending).some(Boolean)) return
    try {
      set({ devices: await api.devices({ background: true }) })
    } catch {
      // keep the last known state
    }
  },
  // A live update from the server: replace this provider's devices. While a
  // command is in flight its own reply is more up to date, so the device the
  // command targets is kept.
  update: (provider, devices) =>
    set((s) => {
      const incoming = new Map(devices.map((d) => [d.id, d]))
      const next = s.devices.map((d) => (d.provider === provider && incoming.has(d.id) && !s.pending[d.id] ? incoming.get(d.id) : d))
      for (const d of devices) if (!s.devices.some((x) => x.id === d.id)) next.push(d)
      return { devices: next.filter((d) => d.provider !== provider || incoming.has(d.id)) }
    }),
  // The same command for several devices, e.g. every light off.
  commandAll: (ids, command, value) => Promise.all(ids.map((id) => get().command(id, command, value))),
  command: async (id, command, value) => {
    set((s) => ({ pending: { ...s.pending, [id]: true }, error: null }))
    try {
      const device = await api.command(id, command, value)
      set((s) => ({ devices: s.devices.map((d) => (d.id === id ? device : d)) }))
    } catch (err) {
      set({ error: err.message })
      // The device may have gone offline since the last fetch; reload its state.
      api.devices().then((devices) => set({ devices }), () => {})
    } finally {
      set((s) => ({ pending: { ...s.pending, [id]: false } }))
    }
  },
}))

async function request(path, options) {
  const res = await fetch(`/api${path}`, options)
  if (res.status === 204) return null
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

export const api = {
  providers: () => request('/providers'),
  logout: (provider) => request(`/auth/${provider}/logout`, { method: 'POST' }),
  discover: (provider) => request(`/providers/${provider}/discover`, { method: 'POST' }),
  pair: (provider, seconds) =>
    request(`/providers/${provider}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    }),
  weather: () => request('/weather'),
  devices: ({ refresh = false, background = false } = {}) => request(`/devices${refresh ? '?refresh=1' : background ? '?background=1' : ''}`),
  history: (id, range) => request(`/devices/${encodeURIComponent(id)}/history?range=${range}`),
  command: (id, command, value) =>
    request(`/devices/${encodeURIComponent(id)}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, value }),
    }),
}

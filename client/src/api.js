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
  devices: ({ refresh = false } = {}) => request(`/devices${refresh ? '?refresh=1' : ''}`),
  command: (id, command, value) =>
    request(`/devices/${encodeURIComponent(id)}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, value }),
    }),
}

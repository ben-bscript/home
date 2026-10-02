// Daikin Onecta Cloud API
// https://developer.cloud.daikineurope.com
import { config } from '../config.js'
import { HttpError } from '../httpError.js'
import { getTokens, setTokens } from '../tokenStore.js'

const IDP = 'https://idp.onecta.daikineurope.com/v1/oidc'
const API = 'https://api.onecta.daikineurope.com/v1'
const SCOPE = 'openid onecta:basic.integration'

// The API is limited to 200 requests/day, so device state is cached and only
// refetched when stale or explicitly requested.
const CACHE_TTL = 15 * 60 * 1000

let cache = { raw: null, fetchedAt: 0 }
let rateLimit = null
let refreshing = null

export const id = 'daikin'
export const name = 'Daikin Onecta'

export function status() {
  return {
    id,
    name,
    configured: Boolean(config.daikin.clientId && config.daikin.clientSecret),
    connected: Boolean(getTokens(id)),
    redirectUri: config.daikin.redirectUri,
    rateLimit,
    fetchedAt: cache.fetchedAt || null,
  }
}

export function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.daikin.clientId,
    redirect_uri: config.daikin.redirectUri,
    scope: SCOPE,
    state,
  })
  return `${IDP}/authorize?${params}`
}

async function requestToken(params) {
  const res = await fetch(`${IDP}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.daikin.clientId,
      client_secret: config.daikin.clientSecret,
      ...params,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new HttpError(502, `Daikin token request failed (${res.status}): ${body.error_description ?? body.error ?? 'unknown error'}`)
  }
  const tokens = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? params.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  }
  setTokens(id, tokens)
  return tokens
}

export function exchangeCode(code) {
  return requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.daikin.redirectUri,
  })
}

async function getAccessToken() {
  const tokens = getTokens(id)
  if (!tokens) throw new HttpError(401, 'Daikin is not connected')
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken
  refreshing ??= requestToken({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
    .catch((err) => {
      // A rejected refresh token can't be recovered; require a new login.
      setTokens(id, null)
      throw err
    })
    .finally(() => { refreshing = null })
  return (await refreshing).accessToken
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      Accept: 'application/json',
      ...(options.body && { 'Content-Type': 'application/json' }),
    },
  })
  const header = (h) => (res.headers.has(h) ? Number(res.headers.get(h)) : null)
  if (res.headers.has('x-ratelimit-limit-day')) {
    rateLimit = {
      limitDay: header('x-ratelimit-limit-day'),
      remainingDay: header('x-ratelimit-remaining-day'),
      limitMinute: header('x-ratelimit-limit-minute'),
      remainingMinute: header('x-ratelimit-remaining-minute'),
    }
  }
  if (!res.ok) {
    const text = await res.text()
    const status = res.status === 429 ? 429 : 502
    throw new HttpError(status, `Daikin API ${res.status}: ${text || res.statusText}`)
  }
  return res.status === 204 ? null : res.json()
}

function climatePoint(raw) {
  return raw.managementPoints?.find((mp) => mp.managementPointType === 'climateControl')
}

function range(c) {
  return c ? { value: c.value, min: c.minValue, max: c.maxValue, step: c.stepValue ?? 1 } : null
}

function normalize(raw) {
  const mp = climatePoint(raw)
  const device = {
    id: `${id}:${raw.id}`,
    provider: id,
    type: mp ? 'climate' : 'unknown',
    name: mp?.name?.value || raw.deviceModel || 'Daikin device',
    model: raw.deviceModel ?? null,
    online: raw.isCloudConnectionUp?.value ?? null,
    raw,
  }
  if (!mp) return device

  const mode = mp.operationMode?.value
  const fan = mp.fanControl?.value?.operationModes?.[mode]?.fanSpeed
  const sensors = mp.sensoryData?.value ?? {}
  device.climate = {
    power: mp.onOffMode?.value === 'on',
    mode,
    modes: mp.operationMode?.values ?? [],
    roomTemperature: sensors.roomTemperature?.value ?? null,
    outdoorTemperature: sensors.outdoorTemperature?.value ?? null,
    targetTemperature: range(mp.temperatureControl?.value?.operationModes?.[mode]?.setpoints?.roomTemperature),
    fan: fan && {
      mode: fan.currentMode?.value,
      modes: fan.currentMode?.values ?? [],
      speed: range(fan.modes?.fixed),
    },
  }
  return device
}

export async function listDevices({ force = false } = {}) {
  if (force || !cache.raw || Date.now() - cache.fetchedAt > CACHE_TTL) {
    cache = { raw: await api('/gateway-devices'), fetchedAt: Date.now() }
  }
  return cache.raw.map(normalize)
}

// Translate a generic command into a Daikin characteristic update.
function toCharacteristic(command, value, mp) {
  const mode = mp.operationMode?.value
  switch (command) {
    case 'power':
      return { name: 'onOffMode', value: value ? 'on' : 'off' }
    case 'mode':
      return { name: 'operationMode', value }
    case 'targetTemperature':
      return { name: 'temperatureControl', path: `/operationModes/${mode}/setpoints/roomTemperature`, value }
    case 'fanMode':
      return { name: 'fanControl', path: `/operationModes/${mode}/fanSpeed/currentMode`, value }
    case 'fanSpeed':
      return { name: 'fanControl', path: `/operationModes/${mode}/fanSpeed/modes/fixed`, value }
    default:
      throw new HttpError(400, `Unknown command "${command}"`)
  }
}

export async function sendCommand(deviceId, command, value) {
  const devices = await listDevices()
  const raw = devices.find((d) => d.id === `${id}:${deviceId}`)?.raw
  if (!raw) throw new HttpError(404, 'Device not found')
  const mp = climatePoint(raw)
  if (!mp) throw new HttpError(400, 'Device has no climate control')

  const { name: characteristic, path, value: v } = toCharacteristic(command, value, mp)
  await api(`/gateway-devices/${raw.id}/management-points/${mp.embeddedId}/characteristics/${characteristic}`, {
    method: 'PATCH',
    body: JSON.stringify(path ? { path, value: v } : { value: v }),
  })

  // The cloud takes a while to reflect changes; update the cached state
  // instead of spending another request on a refetch.
  let target = mp[characteristic]
  if (path) {
    target = target.value
    for (const key of path.split('/').filter(Boolean)) target = target?.[key]
  }
  if (target) target.value = v
  return normalize(raw)
}

export function disconnect() {
  setTokens(id, null)
  cache = { raw: null, fetchedAt: 0 }
}

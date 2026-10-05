// Daikin Onecta Cloud API
// https://developer.cloud.daikineurope.com
import { config } from '../config.js'
import { HttpError } from '../httpError.js'
import { getTokens, setTokens } from '../tokenStore.js'

const IDP = 'https://idp.onecta.daikineurope.com/v1/oidc'
const API = 'https://api.onecta.daikineurope.com/v1'
const SCOPE = 'openid onecta:basic.integration'

// The API is limited to 200 requests/day, so device state is cached. The cache
// is kept short while there is plenty of budget left, so a page reload shows
// current state, and gets longer as the day's budget runs down.
function cacheTtl() {
  const remaining = rateLimit?.remainingDay ?? 200
  if (remaining > 100) return 60 * 1000
  if (remaining > 40) return 5 * 60 * 1000
  return 15 * 60 * 1000
}

// The cloud needs a while to reflect a command; until then a refetch would
// return the old state and undo what the app shows.
const COMMAND_HOLD = 30 * 1000
let holdUntil = 0

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
      'Accept-Encoding': 'gzip',
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
    if (text.includes('READ_ONLY_CHARACTERISTIC')) {
      // Everything turns read-only while the unit is offline or in holiday mode.
      cache.fetchedAt = 0
      throw new HttpError(409, 'De airco kan nu niet bediend worden (offline of in vakantiemodus).')
    }
    const status = res.status === 429 ? 429 : 502
    throw new HttpError(status, `Daikin API ${res.status}: ${text || res.statusText}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

function climatePoint(raw) {
  return raw.managementPoints?.find((mp) => mp.managementPointType === 'climateControl')
}

function range(c) {
  return c ? { value: c.value, min: c.minValue, max: c.maxValue, step: c.stepValue ?? 1 } : null
}

function point(raw, type) {
  return raw.managementPoints?.find((mp) => mp.managementPointType === type)
}

function choice(c) {
  return c?.settable ? { mode: c.value, modes: c.values ?? [] } : null
}

// Device details and health, gathered from all management points.
function info(raw, mp) {
  const gateway = point(raw, 'gateway')
  const indoor = point(raw, 'indoorUnit')
  const outdoor = point(raw, 'outdoorUnit')
  const val = (p, key) => p?.[key]?.value ?? null
  return {
    indoorModel: val(indoor, 'modelInfo'),
    indoorSerial: val(indoor, 'serialNumber'),
    indoorSoftware: val(indoor, 'softwareVersion'),
    outdoorModel: val(outdoor, 'modelInfo'),
    outdoorSerial: val(outdoor, 'serialNumber'),
    outdoorSoftware: val(outdoor, 'softwareVersion'),
    gatewayModel: val(gateway, 'modelInfo'),
    firmware: val(gateway, 'firmwareVersion'),
    ipAddress: val(gateway, 'ipAddress'),
    macAddress: val(gateway, 'macAddress'),
    ssid: val(gateway, 'ssid'),
    timeZone: val(gateway, 'timeZone'),
    errorCode: val(mp, 'errorCode'),
    outdoorErrorCode: val(outdoor, 'errorCode'),
    inError: [gateway, mp, outdoor].some((p) => val(p, 'isInErrorState')),
    inWarning: [mp, outdoor].some((p) => val(p, 'isInWarningState')),
    inCaution: [mp, outdoor].some((p) => val(p, 'isInCautionState')),
    modeConflict: val(mp, 'isInModeConflict'),
    updatedAt: raw.timestamp ?? null,
  }
}

function schedule(mp) {
  const s = mp.schedule?.value
  const modeId = s?.currentMode?.value
  const mode = s?.modes?.[modeId]
  if (!mode) return null
  const current = mode.schedules?.[mode.currentSchedule?.value]
  return {
    enabled: Boolean(mode.enabled?.value),
    settable: Boolean(mode.enabled?.settable),
    readOnly: Boolean(current?.meta?.isReadOnly),
    periods: current?.meta?.actionPeriods ?? [],
    maxActions: mode.meta?.maxActionsPerActionPeriod ?? null,
    actionTypes: mode.meta?.actionTypes ?? {},
    actions: current?.actions ?? {},
    nextAction: s.nextAction ?? {},
  }
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
  const fanMode = mp.fanControl?.value?.operationModes?.[mode]
  const fan = fanMode?.fanSpeed
  // Extra on/off functions (powerful, econo, streamer, ...) vary per model.
  const toggles = Object.entries(mp)
    .filter(([key, c]) => key !== 'onOffMode' && c?.settable && c.values?.length === 2 && c.values.includes('on') && c.values.includes('off'))
    .map(([key, c]) => ({ id: key, on: c.value === 'on' }))
  const sensors = mp.sensoryData?.value ?? {}
  device.climate = {
    power: mp.onOffMode?.value === 'on',
    mode,
    modes: mp.operationMode?.values ?? [],
    roomTemperature: sensors.roomTemperature?.value ?? null,
    outdoorTemperature: sensors.outdoorTemperature?.value ?? null,
    roomHumidity: sensors.roomHumidity?.value ?? null,
    targetTemperature: range(mp.temperatureControl?.value?.operationModes?.[mode]?.setpoints?.roomTemperature),
    fan: fan && {
      mode: fan.currentMode?.value,
      modes: fan.currentMode?.values ?? [],
      speed: range(fan.modes?.fixed),
    },
    swing: {
      horizontal: choice(fanMode?.fanDirection?.horizontal?.currentMode),
      vertical: choice(fanMode?.fanDirection?.vertical?.currentMode),
    },
    toggles,
    holiday: mp.holidayMode?.settable
      ? {
          enabled: Boolean(mp.holidayMode.value?.enabled),
          startDate: mp.holidayMode.value?.startDate ?? null,
          endDate: mp.holidayMode.value?.endDate ?? null,
        }
      : null,
    schedule: schedule(mp),
    consumption: mp.consumptionData?.value?.electrical ?? null,
    nameMaxLength: mp.name?.settable ? (mp.name.maxLength ?? 32) : null,
  }
  device.info = info(raw, mp)
  return device
}

export async function listDevices({ force = false, cacheOnly = false } = {}) {
  // Background polls must not spend the daily request budget.
  const held = cache.raw && (cacheOnly || Date.now() < holdUntil)
  if (!held && (force || !cache.raw || Date.now() - cache.fetchedAt > cacheTtl())) {
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
    case 'swingHorizontal':
      return { name: 'fanControl', path: `/operationModes/${mode}/fanDirection/horizontal/currentMode`, value }
    case 'swingVertical':
      return { name: 'fanControl', path: `/operationModes/${mode}/fanDirection/vertical/currentMode`, value }
    case 'toggle': {
      const c = mp[value?.id]
      if (!c?.settable || !c.values?.includes('on')) throw new HttpError(400, `Unknown function "${value?.id}"`)
      return { name: value.id, value: value.on ? 'on' : 'off' }
    }
    case 'name':
      return { name: 'name', value: String(value).trim() }
    default:
      throw new HttpError(400, `Unknown command "${command}"`)
  }
}

// Holiday mode and schedules have dedicated endpoints instead of
// characteristic updates.
function toRequest(command, value, mp) {
  const scheduleValue = mp.schedule?.value
  const modeId = scheduleValue?.currentMode?.value
  const scheduleMode = scheduleValue?.modes?.[modeId]
  const scheduleId = scheduleMode?.currentSchedule?.value
  switch (command) {
    case 'holiday': {
      const body = value?.enabled
        ? { enabled: true, startDate: value.startDate, endDate: value.endDate }
        : { enabled: false }
      return {
        method: 'POST',
        path: '/holiday-mode',
        body,
        apply: () => { mp.holidayMode.value = body },
      }
    }
    case 'scheduleEnabled':
      if (!scheduleMode) throw new HttpError(400, 'Device has no schedule')
      return {
        method: 'PUT',
        path: `/schedule/${modeId}/current`,
        body: { scheduleId, enabled: Boolean(value) },
        apply: () => { scheduleMode.enabled.value = Boolean(value) },
      }
    case 'scheduleActions': {
      if (!scheduleMode) throw new HttpError(400, 'Device has no schedule')
      // The full schedule object of the mode must be sent, with every schedule id.
      const body = Object.fromEntries(
        Object.entries(scheduleMode.schedules).map(([key, s]) => [key, { actions: key === scheduleId ? value : (s.actions ?? {}) }]),
      )
      return {
        method: 'PUT',
        path: `/schedule/${modeId}/schedules`,
        body,
        apply: () => { scheduleMode.schedules[scheduleId].actions = value },
      }
    }
    default:
      return null
  }
}

export async function sendCommand(deviceId, command, value) {
  const devices = await listDevices()
  const raw = devices.find((d) => d.id === `${id}:${deviceId}`)?.raw
  if (!raw) throw new HttpError(404, 'Device not found')
  const mp = climatePoint(raw)
  if (!mp) throw new HttpError(400, 'Device has no climate control')
  const base = `/gateway-devices/${raw.id}/management-points/${mp.embeddedId}`

  // The cloud takes a while to reflect changes; update the cached state
  // instead of spending another request on a refetch.
  const request = toRequest(command, value, mp)
  if (request) {
    await api(base + request.path, { method: request.method, body: JSON.stringify(request.body) })
    request.apply()
    holdUntil = Date.now() + COMMAND_HOLD
    return normalize(raw)
  }

  const { name: characteristic, path, value: v } = toCharacteristic(command, value, mp)
  await api(`${base}/characteristics/${characteristic}`, {
    method: 'PATCH',
    body: JSON.stringify(path ? { path, value: v } : { value: v }),
  })
  let target = mp[characteristic]
  if (path) {
    target = target.value
    for (const key of path.split('/').filter(Boolean)) target = target?.[key]
  }
  if (target) target.value = v
  holdUntil = Date.now() + COMMAND_HOLD
  return normalize(raw)
}

export function disconnect() {
  setTokens(id, null)
  cache = { raw: null, fetchedAt: 0 }
}

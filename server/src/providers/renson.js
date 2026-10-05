// Renson Waves — local HTTP API on the device itself (no cloud, no auth).
// Endpoints follow https://github.com/Pieter-Geerts/rensonwaves
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { config } from '../config.js'
import { HttpError } from '../httpError.js'

const CACHE_TTL = 5 * 1000
const RESCAN_INTERVAL = 60 * 1000
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const stateFile = join(config.dataDir, 'renson.json')

let host = loadHost()
let hostSource = host ? 'cached' : null
let lastScan = 0
let scanning = null
let cache = { device: null, fetchedAt: 0 }

export const id = 'renson'
export const name = 'Renson Waves'

function loadHost() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8')).host ?? null
  } catch {
    return null
  }
}

function setHost(next, source) {
  host = next
  hostSource = source
  mkdirSync(config.dataDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify({ host }, null, 2))
}

async function request(target, path, { method = 'GET', body, timeout = 4000 } = {}) {
  const res = await fetch(`http://${target}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new HttpError(502, `Renson Waves ${res.status} op ${path}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// A Waves answers /v1/constellation with its sensors and actuators.
async function probe(target, timeout = 1500) {
  try {
    const data = await request(target, '/v1/constellation', { timeout })
    return data && typeof data === 'object' && (data.sensor || data.actuator || data.global) ? data : null
  } catch {
    return null
  }
}

// Every address on the /24 networks this machine is connected to.
function candidates() {
  const hosts = new Set()
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      const prefix = address.address.split('.').slice(0, 3).join('.')
      for (let i = 1; i < 255; i++) hosts.add(`${prefix}.${i}`)
    }
  }
  return [...hosts]
}

// Scan the local network for the device; fall back to the configured static address.
export function discover() {
  scanning ??= (async () => {
    lastScan = Date.now()
    const results = await Promise.all(candidates().map(async (target) => ((await probe(target)) ? target : null)))
    const found = results.find(Boolean)
    if (found) setHost(found, 'discovered')
    else if (config.renson.host && (await probe(config.renson.host, 4000))) setHost(config.renson.host, 'static')
    return host
  })().finally(() => {
    scanning = null
  })
  return scanning
}

async function resolveHost() {
  if (!host && Date.now() - lastScan > RESCAN_INTERVAL) await discover()
  return host
}

export function start() {
  if (!host) discover().catch(() => {})
}

export function status() {
  return {
    id,
    name,
    local: true,
    configured: true,
    connected: Boolean(host),
    host,
    hostSource,
    staticHost: config.renson.host || null,
  }
}

const time = (value) => String(value ?? '').slice(0, 5)

function normalize(target, constellation, { room, silent, breeze, wifi, uptime }) {
  const sensors = Object.values(constellation.sensor ?? {})
  const sensor = (type, key) => sensors.find((s) => s.type === type)?.parameter?.[key]?.value ?? null
  const fan = Object.values(constellation.actuator ?? {}).find((a) => a.type === 'ventilation fan')
  const global = constellation.global ?? {}
  const globalValue = (key) => global[key]?.value ?? null
  const serial = globalValue('serial')
  const demandOn = (d) => Boolean(d?.dynamic?.enable || d?.static?.enable)

  return {
    id: `${id}:${serial && serial !== 'unknown' ? serial : (wifi?.MAC ?? target)}`,
    provider: id,
    type: 'ventilation',
    name: globalValue('device_name') || 'Waves',
    model: 'Renson Waves',
    online: true,
    ventilation: {
      flowRate: fan?.parameter?.flow_rate?.value ?? null,
      // Ventilation level as Renson's app shows it: flow relative to the nominal flow.
      level: fan?.parameter?.flow_rate?.value != null && room?.nominal ? Math.round((fan.parameter.flow_rate.value / room.nominal) * 100) : null,
      rpm: fan?.parameter?.rpm?.value ?? null,
      pwm: fan?.parameter?.pwm?.value ?? null,
      temperature: sensor('temp', 'temperature'),
      humidity: sensor('rh', 'humidity'),
      absoluteHumidity: sensor('ah', 'humidity'),
      voc: sensor('avoc', 'raw'),
      pressure: sensor('press', 'pressure'),
      trigger: sensor('decision', 'trigger'),
      roomType: room?.type ?? null,
      minimum: room?.minimum ?? null,
      nominal: room?.nominal ?? null,
      boost: room?.boost
        ? {
            enabled: Boolean(room.boost.enable),
            level: room.boost.level,
            timeout: room.boost.timeout,
            remaining: room.boost.remaining,
            defaultLevel: room.boost.default_level ?? 100,
            defaultTimeout: room.boost.default_timeout ?? 900,
          }
        : null,
      demand: room?.demand
        ? {
            relativeHumidity: demandOn(room.demand.relative_humidity),
            absoluteHumidity: demandOn(room.demand.absolute_humidity),
            voc: demandOn(room.demand.VOC),
          }
        : null,
      silent: silent
        ? {
            enabled: Boolean(silent.enable),
            reduction: silent.reduction,
            schedule: Object.fromEntries(
              DAYS.map((day) => [day, (silent[day] ?? []).map((e) => ({ time: time(e.time), silent: Boolean(e.silent) }))]),
            ),
          }
        : null,
      breeze: breeze ? { enabled: Boolean(breeze.enable), tempThreshold: breeze.temp_threshold } : null,
    },
    info: {
      serial,
      host: target,
      wifiStatus: wifi?.status ?? null,
      ssid: wifi?.ssid ?? null,
      ipAddress: wifi?.IP ?? null,
      macAddress: wifi?.MAC ?? null,
      rssi: sensor('rssi', 'rssi'),
      uptime: uptime?.uptime ?? null,
      firmware: globalValue('firmware_version'),
      product: globalValue('product_name'),
      subtype: globalValue('subtype'),
      pcbVersion: globalValue('pcb_version'),
      motorType: fan?.parameter?.motor_type?.value ?? null,
    },
    raw: { constellation, room, silent, breeze, wifi, uptime },
  }
}

export async function listDevices({ force = false } = {}) {
  if (!force && cache.device?.online && Date.now() - cache.fetchedAt < CACHE_TTL) return [cache.device]

  const target = await resolveHost()
  const constellation = target && (await probe(target, 4000))
  if (!constellation) {
    // The address may have changed (DHCP); forget it so the next call rescans.
    if (target) {
      host = null
      hostSource = null
    }
    if (cache.device) cache.device = { ...cache.device, online: false }
    return cache.device ? [cache.device] : []
  }

  const optional = (path) => request(target, path).catch(() => null)
  const [room, silent, breeze, wifi, uptime] = await Promise.all([
    optional('/v1/decision/room'),
    optional('/v1/decision/silent'),
    optional('/v1/decision/breeze'),
    optional('/v1/wifi/client/status'),
    optional('/v1/global/uptime'),
  ])
  cache = { device: normalize(target, constellation, { room, silent, breeze, wifi, uptime }), fetchedAt: Date.now() }
  return [cache.device]
}

const clamp = (value, min, max, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function toRequest(command, value, device) {
  const { raw, ventilation } = device
  switch (command) {
    case 'boost':
      return {
        path: '/v1/decision/room/boost',
        body: value?.enable
          ? {
              enable: true,
              level: clamp(value.level, 0, 200, ventilation.boost?.defaultLevel ?? 100),
              timeout: Math.round(clamp(value.timeout, 60, 86400, ventilation.boost?.defaultTimeout ?? 900)),
              remaining: 0,
            }
          : { enable: false, level: 0, timeout: 0, remaining: 0 },
      }
    case 'silent': {
      if (!raw.silent) throw new HttpError(400, 'Dit toestel heeft geen stille modus')
      // The device expects the full configuration, schedule included.
      const body = {
        enable: value?.enable ?? Boolean(raw.silent.enable),
        reduction: clamp(value?.reduction, 0, 100, raw.silent.reduction),
      }
      for (const day of DAYS) {
        body[day] = (value?.schedule?.[day] ?? raw.silent[day] ?? []).map((e) => ({ silent: Boolean(e.silent), time: time(e.time) }))
      }
      return { path: '/v1/decision/silent', body }
    }
    case 'breeze':
      if (!raw.breeze) throw new HttpError(400, 'Dit toestel heeft geen breeze-modus')
      return {
        path: '/v1/decision/breeze',
        body: {
          enable: value?.enable ?? Boolean(raw.breeze.enable),
          temp_threshold: clamp(value?.tempThreshold, 10, 40, raw.breeze.temp_threshold),
        },
      }
    default:
      throw new HttpError(400, `Unknown command "${command}"`)
  }
}

export async function sendCommand(deviceId, command, value) {
  const [device] = await listDevices()
  if (!device || device.id !== `${id}:${deviceId}`) throw new HttpError(404, 'Device not found')
  if (!device.online) throw new HttpError(409, 'De Renson Waves is niet bereikbaar op het netwerk.')

  const { path, body } = toRequest(command, value, device)
  await request(device.info.host, path, { method: 'PUT', body })
  return (await listDevices({ force: true }))[0]
}

export function disconnect() {
  host = null
  hostSource = null
  cache = { device: null, fetchedAt: 0 }
}

// Zigbee lights through Zigbee2MQTT (https://www.zigbee2mqtt.io). Zigbee2MQTT
// talks to the USB coordinator (Sonoff Zigbee 3.0 USB Dongle Plus) and publishes
// every device on an MQTT broker; this provider reads and controls them there.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import mqtt from 'mqtt'
import { config } from '../config.js'
import { changed } from '../events.js'
import { HttpError } from '../httpError.js'

const COMMAND_TIMEOUT = 4000
const REQUEST_TIMEOUT = 10000
const MAX_EVENTS = 10

export const id = 'zigbee'
export const name = 'Zigbee'

const base = config.zigbee.baseTopic
const stateFile = join(config.dataDir, 'zigbee.json')

let client = null
let mqttConnected = false
let mqttError = null
let bridgeOnline = false
let bridgeInfo = null
// Zigbee2MQTT device list by IEEE address, and the reverse lookup by name.
let devices = new Map()
let byName = new Map()
const states = new Map()
const availability = new Map()
// Callbacks waiting for the next state message of a device.
const waiters = new Map()
const requests = new Map()
// Recent join/interview events, shown while pairing.
let events = []
let settings = loadSettings()

function loadSettings() {
  try {
    return { rooms: {}, names: {}, powerOn: {}, ...JSON.parse(readFileSync(stateFile, 'utf8')) }
  } catch {
    return { rooms: {}, names: {}, powerOn: {} }
  }
}

function saveSettings() {
  mkdirSync(config.dataDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify(settings, null, 2))
}

function parse(payload) {
  const text = payload.toString()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// Zigbee2MQTT 1.x sends "online", 2.x sends {"state":"online"}.
const isOnline = (value) => (typeof value === 'object' ? value?.state : value) === 'online'

// The controllable lights (and light switches/relays) a device exposes. A device
// with several endpoints, such as a double relay, yields one entry per endpoint.
function lightsOf(device) {
  if (!device?.definition || device.type === 'Coordinator' || device.disabled) return []
  const lights = []
  const exposes = device.definition.exposes ?? []
  // Light effects (Hue: candle, fireplace, colorloop…) are a device-level enum.
  const effectExpose = exposes.find((e) => e.type === 'enum' && e.name === 'effect' && Array.isArray(e.values))
  const effects = effectExpose ? effectExpose.values.filter((v) => !NON_EFFECTS.has(v)) : []
  const stopEffect = effectExpose?.values.find((v) => STOP_EFFECTS.includes(v)) ?? null
  // What the lamp does when mains power returns (generic or Hue-specific).
  const powerOn =
    exposes.find((e) => e.type === 'enum' && e.name === 'power_on_behavior' && Array.isArray(e.values)) ??
    exposes.find((e) => e.type === 'enum' && e.name === 'hue_power_on_behavior' && Array.isArray(e.values)) ??
    null
  for (const expose of exposes) {
    if ((expose.type !== 'light' && expose.type !== 'switch') || !expose.features) continue
    const feature = (name) => expose.features.find((f) => f.name === name)
    const state = feature('state')
    if (!state) continue
    lights.push({
      kind: expose.type,
      endpoint: expose.endpoint ?? null,
      state,
      brightness: feature('brightness'),
      colorTemp: feature('color_temp'),
      color: feature('color_xy') ?? feature('color_hs'),
      effects,
      effectProperty: effectExpose?.property ?? 'effect',
      stopEffect,
      powerOn,
    })
  }
  const multiple = lights.length > 1
  return lights.map((light) => ({ ...light, key: multiple && light.endpoint ? `${device.ieee_address}:${light.endpoint}` : device.ieee_address }))
}

function findLight(key) {
  const [ieee, endpoint] = key.split(':')
  const device = devices.get(ieee)
  const light = lightsOf(device).find((l) => l.key === key || (!endpoint && l.key === ieee))
  return light ? { device, light } : null
}

// Effect values that are not effects to show (service commands and stop values).
const NON_EFFECTS = new Set(['okay', 'channel_change', 'finish_effect', 'stop_effect', 'stop_hue_effect', 'identify'])
const STOP_EFFECTS = ['stop_hue_effect', 'finish_effect', 'stop_effect']
// Zigbee2MQTT doesn't report the running effect, so remember what was started.
const runningEffects = new Map()

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const toHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`

function xyToHex({ x, y }) {
  if (!y) return null
  const X = x / y
  const Z = (1 - x - y) / y
  let r = X * 1.656492 - 0.354851 - Z * 0.255038
  let g = -X * 0.707196 + 1.655397 + Z * 0.036152
  let b = X * 0.051713 - 0.121364 + Z * 1.01153
  const max = Math.max(r, g, b, 1e-6)
  const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
  ;[r, g, b] = [r, g, b].map((v) => gamma(Math.max(0, v / max)))
  return toHex(r, g, b)
}

function hsToHex({ hue, saturation }) {
  const s = saturation / 100
  const f = (n) => {
    const k = (n + hue / 60) % 6
    return 1 - s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return toHex(f(5), f(3), f(1))
}

function colorOf(value) {
  if (!value || typeof value !== 'object') return null
  if (value.hex) return value.hex
  if (value.x != null && value.y != null) return xyToHex(value)
  if (value.hue != null && value.saturation != null) return hsToHex(value)
  return null
}

function normalize(device, light) {
  const state = states.get(device.ieee_address) ?? {}
  const value = (feature) => (feature ? state[feature.property] : undefined)
  const raw = value(light.state)
  const brightness = value(light.brightness)
  const colorTemp = value(light.colorTemp)
  const available = availability.get(device.friendly_name)
  const { vendor, model, description } = device.definition
  const baseName = device.friendly_name
  // Names are kept by the app, so several lights may share one (Zigbee2MQTT
  // needs unique names because they are its MQTT topics).
  const name = settings.names[`${id}:${light.key}`] ?? (light.key === device.ieee_address ? baseName : `${baseName} ${light.endpoint}`)

  return {
    id: `${id}:${light.key}`,
    provider: id,
    type: 'light',
    name,
    model: [vendor, model].filter(Boolean).join(' '),
    room: settings.rooms[`${id}:${light.key}`] ?? null,
    online: bridgeOnline && available !== false,
    light: {
      kind: light.kind,
      known: raw !== undefined,
      on: raw === (light.state.value_on ?? 'ON'),
      brightness: light.brightness
        ? {
            // Shown as a percentage; Zigbee2MQTT uses 0–254.
            value: brightness == null ? null : clamp(Math.round((brightness / (light.brightness.value_max ?? 254)) * 100), 1, 100),
          }
        : null,
      colorTemp: light.colorTemp
        ? {
            value: colorTemp ?? null,
            min: light.colorTemp.value_min ?? 150,
            max: light.colorTemp.value_max ?? 500,
          }
        : null,
      color: light.color ? { value: state.color_mode && state.color_mode !== 'color_temp' ? colorOf(value(light.color)) : null } : null,
      effects: light.effects.length ? light.effects : null,
      effect: runningEffects.get(light.key) ?? null,
      // Hue doesn't report this back, so what the app set is remembered.
      powerOn: light.powerOn
        ? { values: light.powerOn.values, value: state[light.powerOn.property] ?? settings.powerOn[`${id}:${light.key}`] ?? null }
        : null,
      colorMode: state.color_mode ?? null,
    },
    info: {
      ieeeAddress: device.ieee_address,
      friendlyName: device.friendly_name,
      vendor,
      model,
      description,
      endpoint: light.endpoint,
      powerSource: device.power_source ?? null,
      linkquality: state.linkquality ?? null,
      lastSeen: state.last_seen ?? null,
    },
  }
}

function addEvent(event) {
  events = [{ ...event, t: Date.now() }, ...events.filter((e) => e.ieee !== event.ieee)].slice(0, MAX_EVENTS)
}

function onDevices(list) {
  devices = new Map(list.filter((d) => d.type !== 'Coordinator').map((d) => [d.ieee_address, d]))
  byName = new Map([...devices.values()].map((d) => [d.friendly_name, d.ieee_address]))
  for (const device of devices.values()) {
    // Ask lights whose state we haven't seen yet (retained state may be off).
    if (lightsOf(device).length && !states.has(device.ieee_address)) publish(`${device.friendly_name}/get`, { state: '' })
  }
}

function onMessage(topic, payload, packet) {
  if (!topic.startsWith(`${base}/`)) return
  const path = topic.slice(base.length + 1)
  const data = parse(payload)

  if (path === 'bridge/state') {
    const was = bridgeOnline
    bridgeOnline = isOnline(data)
    if (bridgeOnline !== was) notify()
    return
  }
  if (path === 'bridge/info') {
    bridgeInfo = data
    return
  }
  if (path === 'bridge/devices') {
    if (Array.isArray(data)) {
      onDevices(data)
      notify()
    }
    return
  }
  if (path === 'bridge/event') {
    const ieee = data?.data?.ieee_address
    if (!ieee) return
    const friendlyName = data.data.friendly_name ?? ieee
    if (data.type === 'device_joined') addEvent({ ieee, name: friendlyName, status: 'joined' })
    else if (data.type === 'device_interview') addEvent({ ieee, name: friendlyName, status: data.data.status, supported: data.data.supported })
    else if (data.type === 'device_leave') addEvent({ ieee, name: friendlyName, status: 'left' })
    return
  }
  if (path.startsWith('bridge/response/')) {
    const pending = data?.transaction && requests.get(data.transaction)
    if (pending) {
      requests.delete(data.transaction)
      pending(data)
    }
    return
  }
  if (path.startsWith('bridge/')) return

  if (path.endsWith('/availability')) {
    const friendlyName = path.slice(0, -'/availability'.length)
    const was = availability.get(friendlyName)
    availability.set(friendlyName, isOnline(data))
    if (availability.get(friendlyName) !== was) notify()
    return
  }

  // Device state: <base>/<friendly_name>. Friendly names may contain slashes.
  const ieee = byName.get(path)
  if (!ieee || !data || typeof data !== 'object') return
  states.set(ieee, { ...states.get(ieee), ...data })
  // A live (not retained) state message means the device just answered, even
  // when Zigbee2MQTT's availability check had given up on it.
  if (!packet?.retain) availability.set(path, true)
  notify()
  const callbacks = waiters.get(ieee)
  if (callbacks) {
    waiters.delete(ieee)
    for (const callback of callbacks) callback()
  }
}

// Tell the app something changed; it gets the new device list over /api/events.
function notify() {
  changed({ id, listDevices, status })
}

function publish(path, body) {
  client?.publish(`${base}/${path}`, JSON.stringify(body))
}

function nextState(ieee, timeout) {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      const list = waiters.get(ieee)?.filter((cb) => cb !== done)
      if (list?.length) waiters.set(ieee, list)
      else waiters.delete(ieee)
      reject(new HttpError(504, 'De lamp reageert niet. Staat hij aan de stroom?'))
    }, timeout)
    waiters.set(ieee, [...(waiters.get(ieee) ?? []), done])
  })
}

// Request/response on the bridge API, matched by transaction id.
function bridgeRequest(path, body) {
  if (!mqttConnected || !bridgeOnline) return Promise.reject(new HttpError(409, 'Zigbee2MQTT is niet bereikbaar.'))
  const transaction = randomBytes(6).toString('hex')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(transaction)
      reject(new HttpError(504, 'Zigbee2MQTT antwoordt niet.'))
    }, REQUEST_TIMEOUT)
    requests.set(transaction, (response) => {
      clearTimeout(timer)
      if (response.status === 'ok') resolve(response.data)
      else reject(new HttpError(400, response.error ?? 'Zigbee2MQTT weigerde de opdracht.'))
    })
    publish(`bridge/request/${path}`, { ...body, transaction })
  })
}

export function start() {
  if (client) return
  client = mqtt.connect(config.zigbee.mqttUrl, {
    username: config.zigbee.username || undefined,
    password: config.zigbee.password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 5000,
  })
  client.on('connect', () => {
    mqttConnected = true
    mqttError = null
    client.subscribe(`${base}/#`)
  })
  client.on('close', () => {
    mqttConnected = false
    bridgeOnline = false
  })
  client.on('error', (err) => {
    mqttError = err.code === 'ECONNREFUSED' ? `Geen MQTT-broker op ${config.zigbee.mqttUrl}` : err.message
  })
  client.on('message', onMessage)
}

function permitJoinUntil() {
  if (!bridgeInfo?.permit_join) return null
  // 2.x reports an end timestamp, 1.x the remaining seconds.
  if (bridgeInfo.permit_join_end) return bridgeInfo.permit_join_end
  if (bridgeInfo.permit_join_timeout) return Date.now() + bridgeInfo.permit_join_timeout * 1000
  return null
}

export function status() {
  const lights = [...devices.values()].filter((d) => lightsOf(d).length).length
  return {
    id,
    name,
    local: true,
    configured: true,
    connected: mqttConnected && bridgeOnline,
    zigbee: {
      mqttUrl: config.zigbee.mqttUrl,
      mqttConnected,
      mqttError,
      bridgeOnline,
      version: bridgeInfo?.version ?? null,
      coordinator: bridgeInfo?.coordinator?.type ?? null,
      permitJoin: Boolean(bridgeInfo?.permit_join),
      permitJoinUntil: permitJoinUntil(),
      devices: devices.size,
      lights,
      events,
    },
  }
}

export async function listDevices() {
  const list = []
  for (const device of devices.values()) {
    for (const light of lightsOf(device)) list.push(normalize(device, light))
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

export async function discover() {
  start()
}

export async function permitJoin(seconds) {
  const time = clamp(Math.round(Number(seconds) || 0), 0, 254)
  // 1.x reads "value", 2.x only "time" (0 closes the network again).
  await bridgeRequest('permit_join', { value: time > 0, time })
  bridgeInfo = { ...bridgeInfo, permit_join: time > 0, permit_join_end: time > 0 ? Date.now() + time * 1000 : undefined }
  if (time > 0) events = []
  return status()
}

function toPayload(light, command, value) {
  switch (command) {
    case 'power':
      return { [light.state.property]: value ? (light.state.value_on ?? 'ON') : (light.state.value_off ?? 'OFF') }
    case 'brightness': {
      if (!light.brightness) throw new HttpError(400, 'Deze lamp is niet dimbaar')
      const max = light.brightness.value_max ?? 254
      return { [light.brightness.property]: clamp(Math.round((Number(value) / 100) * max), 1, max), transition: 0.3 }
    }
    case 'colorTemp': {
      if (!light.colorTemp) throw new HttpError(400, 'Deze lamp heeft geen instelbaar wit licht')
      return { [light.colorTemp.property]: clamp(Math.round(Number(value)), light.colorTemp.value_min ?? 150, light.colorTemp.value_max ?? 500), transition: 0.3 }
    }
    case 'color': {
      if (!light.color) throw new HttpError(400, 'Deze lamp kan geen kleur tonen')
      if (!/^#[0-9a-f]{6}$/i.test(value)) throw new HttpError(400, 'Ongeldige kleur')
      return { [light.color.property]: { hex: value }, transition: 0.3 }
    }
    // A scene sets several things at once: { brightness, colorTemp } or { brightness, color }.
    case 'scene': {
      const body = { [light.state.property]: light.state.value_on ?? 'ON', transition: 0.5 }
      if (value?.brightness != null && light.brightness) {
        const max = light.brightness.value_max ?? 254
        body[light.brightness.property] = clamp(Math.round((Number(value.brightness) / 100) * max), 1, max)
      }
      if (value?.color && light.color) {
        if (!/^#[0-9a-f]{6}$/i.test(value.color)) throw new HttpError(400, 'Ongeldige kleur')
        body[light.color.property] = { hex: value.color }
      } else if (value?.colorTemp != null && light.colorTemp) {
        body[light.colorTemp.property] = clamp(Math.round(Number(value.colorTemp)), light.colorTemp.value_min ?? 150, light.colorTemp.value_max ?? 500)
      } else if (value?.color && light.colorTemp) {
        // A colour scene on a white-only lamp: fall back to warm white.
        body[light.colorTemp.property] = light.colorTemp.value_max ?? 400
      }
      return body
    }
    case 'powerOn': {
      if (!light.powerOn) throw new HttpError(400, 'Deze lamp heeft geen instelling voor na een stroomonderbreking')
      if (!light.powerOn.values.includes(value)) throw new HttpError(400, `Onbekende waarde "${value}"`)
      return { [light.powerOn.property]: value }
    }
    case 'effect': {
      if (!light.effects.length) throw new HttpError(400, 'Deze lamp heeft geen effecten')
      if (value == null || value === '') {
        if (!light.stopEffect) throw new HttpError(400, 'Deze lamp kan een effect niet stoppen')
        return { [light.effectProperty]: light.stopEffect }
      }
      if (!light.effects.includes(value)) throw new HttpError(400, `Onbekend effect "${value}"`)
      return { [light.effectProperty]: value }
    }
    default:
      throw new HttpError(400, `Unknown command "${command}"`)
  }
}

export async function sendCommand(key, command, value) {
  const found = findLight(key)
  if (!found) throw new HttpError(404, 'Device not found')
  const { device, light } = found

  if (command === 'room') {
    const room = typeof value === 'string' ? value.trim() : ''
    if (room) settings.rooms[`${id}:${key}`] = room
    else delete settings.rooms[`${id}:${key}`]
    saveSettings()
    return normalize(device, light)
  }

  if (command === 'name') {
    const to = String(value ?? '').trim().slice(0, 60)
    if (!to) throw new HttpError(400, 'Geef een naam op')
    settings.names[`${id}:${key}`] = to
    saveSettings()
    return normalize(device, light)
  }

  if (!mqttConnected || !bridgeOnline) throw new HttpError(409, 'Zigbee2MQTT is niet bereikbaar.')
  const payload = toPayload(light, command, value)
  // Setting a colour, white, scene or power state ends a running effect.
  if (command === 'effect') {
    if (value) runningEffects.set(light.key, value)
    else runningEffects.delete(light.key)
  } else if (command !== 'brightness' && command !== 'powerOn') runningEffects.delete(light.key)
  // Effects are fire-and-forget: Hue lamps start them without reporting a new
  // state, so don't hold the app up waiting for one.
  const reply = command === 'effect' ? nextState(device.ieee_address, 500).catch(() => {}) : nextState(device.ieee_address, COMMAND_TIMEOUT)
  publish(`${device.friendly_name}/set`, payload)
  await reply
  if (command === 'powerOn') {
    settings.powerOn[`${id}:${key}`] = value
    saveSettings()
  }
  return normalize(devices.get(device.ieee_address), light)
}

export function disconnect() {
  // Nothing to unlink: the broker is local and needs no account.
}

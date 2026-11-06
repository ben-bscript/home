// The Renson Waves keeps no history itself (the graphs in Renson's own app come
// from their cloud), so readings of local devices are recorded here.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'
import { HttpError } from './httpError.js'

const INTERVAL = 60 * 1000
const KEEP = 8 * 24 * 60 * 60 * 1000
const RANGES = {
  day: { span: 24 * 60 * 60 * 1000, bucket: 5 * 60 * 1000 },
  week: { span: 7 * 24 * 60 * 60 * 1000, bucket: 30 * 60 * 1000 },
}
const FIELDS = ['level', 'voc', 'humidity', 'temperature']

const dir = join(config.dataDir, 'history')
const fileFor = (deviceId) => join(dir, `${deviceId.replace(/[^\w.-]/g, '_')}.jsonl`)

function readLines(file) {
  if (!existsSync(file)) return []
  const rows = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // skip a line that was cut off mid-write
    }
  }
  return rows
}

function prune() {
  if (!existsSync(dir)) return
  const cutoff = Date.now() - KEEP
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    const rows = readLines(file)
    const kept = rows.filter((r) => r.t >= cutoff)
    if (kept.length !== rows.length) writeFileSync(file, kept.map((r) => `${JSON.stringify(r)}\n`).join(''))
  }
}

async function record(providers) {
  for (const provider of providers) {
    const devices = await provider.listDevices({ force: true }).catch(() => [])
    for (const device of devices) {
      const v = device.ventilation
      if (!v || !device.online) continue
      mkdirSync(dir, { recursive: true })
      const row = { t: Date.now(), level: v.level, voc: v.voc, humidity: v.humidity, temperature: v.temperature }
      appendFileSync(fileFor(device.id), `${JSON.stringify(row)}\n`)
    }
  }
}

export function startRecording(providers) {
  const local = providers.filter((p) => p.status().local)
  if (!local.length) return
  prune()
  record(local)
  setInterval(() => record(local), INTERVAL).unref()
  setInterval(prune, 24 * 60 * 60 * 1000).unref()
}

// Readings averaged into fixed time buckets; buckets without readings are left out.
export function getHistory(deviceId, rangeName = 'day') {
  const range = RANGES[rangeName]
  if (!range) throw new HttpError(400, `Unknown range "${rangeName}"`)
  const to = Date.now()
  const from = to - range.span
  const buckets = new Map()
  for (const row of readLines(fileFor(deviceId))) {
    if (row.t < from) continue
    const key = Math.floor(row.t / range.bucket) * range.bucket
    const bucket = buckets.get(key) ?? buckets.set(key, { n: {}, sum: {} }).get(key)
    for (const field of FIELDS) {
      if (row[field] == null) continue
      bucket.sum[field] = (bucket.sum[field] ?? 0) + row[field]
      bucket.n[field] = (bucket.n[field] ?? 0) + 1
    }
  }
  const points = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, { n, sum }]) => ({
      t,
      ...Object.fromEntries(FIELDS.map((f) => [f, n[f] ? Math.round((sum[f] / n[f]) * 10) / 10 : null])),
    }))
  return { range: rangeName, from, to, bucket: range.bucket, points }
}

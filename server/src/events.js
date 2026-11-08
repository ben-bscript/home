// Live updates for the app: providers announce changes here and every open
// browser gets them over Server-Sent Events (GET /api/events).
import { EventEmitter } from 'node:events'

const bus = new EventEmitter()
bus.setMaxListeners(0)

const HEARTBEAT = 25 * 1000
// Changes that arrive together (state + availability) are sent as one update.
const DEBOUNCE = 50

let pending = new Map()
let timer = null

// Called by a provider when its devices or its status changed.
export function changed(provider) {
  pending.set(provider.id, provider)
  timer ??= setTimeout(flush, DEBOUNCE)
}

async function flush() {
  timer = null
  const providers = [...pending.values()]
  pending = new Map()
  for (const provider of providers) {
    const devices = await provider.listDevices({ cacheOnly: true }).catch(() => null)
    if (devices) bus.emit('update', { type: 'devices', provider: provider.id, devices, status: provider.status() })
  }
}

export function subscribe(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tell proxies (Vite, nginx) not to buffer the stream.
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT)
  bus.on('update', send)
  req.on('close', () => {
    clearInterval(heartbeat)
    bus.off('update', send)
  })
}

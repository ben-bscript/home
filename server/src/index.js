import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
import express from 'express'
import selfsigned from 'selfsigned'
import { config } from './config.js'
import { getHistory, startRecording } from './history.js'
import { HttpError } from './httpError.js'
import { providers } from './providers/index.js'
import { getWeather } from './weather.js'

const app = express()
app.use(express.json())

const pendingStates = new Map()

function getProvider(req) {
  const provider = providers[req.params.provider]
  if (!provider) throw new HttpError(404, `Unknown provider "${req.params.provider}"`)
  return provider
}

app.get('/api/providers', (req, res) => {
  res.json(Object.values(providers).map((p) => p.status()))
})

app.get('/api/auth/:provider/login', (req, res) => {
  const provider = getProvider(req)
  if (!provider.status().configured) throw new HttpError(400, `${provider.name} credentials are missing in server/.env`)
  const state = randomBytes(16).toString('hex')
  pendingStates.set(state, provider.id)
  res.redirect(provider.getAuthUrl(state))
})

app.get('/api/auth/:provider/callback', async (req, res) => {
  const provider = getProvider(req)
  const { code, state, error, error_description } = req.query
  const back = (params) => res.redirect(`${config.clientUrl}/settings?${new URLSearchParams(params)}`)
  if (error) return back({ error: error_description ?? error })
  if (pendingStates.get(state) !== provider.id) return back({ error: 'Invalid OAuth state, please try again' })
  pendingStates.delete(state)
  try {
    await provider.exchangeCode(code)
    back({ connected: provider.id })
  } catch (err) {
    back({ error: err.message })
  }
})

app.post('/api/providers/:provider/discover', async (req, res) => {
  const provider = getProvider(req)
  if (!provider.discover) throw new HttpError(400, `${provider.name} cannot be discovered`)
  await provider.discover()
  res.json(provider.status())
})

app.post('/api/auth/:provider/logout', (req, res) => {
  getProvider(req).disconnect()
  res.status(204).end()
})

app.get('/api/weather', async (req, res) => {
  res.json(await getWeather())
})

app.get('/api/devices', async (req, res) => {
  const force = req.query.refresh === '1'
  // Local providers look for their device themselves, so they are always asked.
  const active = Object.values(providers).filter((p) => p.status().connected || p.status().local)
  const cacheOnly = req.query.background === '1'
  const lists = await Promise.all(active.map((p) => p.listDevices({ force, cacheOnly })))
  res.json(lists.flat())
})

app.get('/api/devices/:id/history', (req, res) => {
  res.json(getHistory(req.params.id, req.query.range))
})

app.post('/api/devices/:id/commands', async (req, res) => {
  const [providerId, ...rest] = req.params.id.split(':')
  const provider = providers[providerId]
  if (!provider) throw new HttpError(404, 'Device not found')
  const { command, value } = req.body ?? {}
  res.json(await provider.sendCommand(rest.join(':'), command, value))
})

app.use((err, req, res, next) => {
  if (!err.status) console.error(err)
  res.status(err.status ?? 500).json({ error: err.message })
})

app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`))

for (const provider of Object.values(providers)) provider.start?.()
startRecording(Object.values(providers))

// OAuth providers such as Daikin only accept https redirect URIs, so the
// callback is also served over https with a locally generated certificate.
const redirects = Object.values(providers)
  .map((p) => p.status().redirectUri)
  .filter(Boolean)
  .map((uri) => new URL(uri))
const httpsRedirect = redirects.find((u) => u.protocol === 'https:')
if (httpsRedirect) {
  const host = httpsRedirect.hostname
  const keyFile = join(config.dataDir, `${host}-key.pem`)
  const certFile = join(config.dataDir, `${host}-cert.pem`)
  if (!existsSync(keyFile) || !existsSync(certFile)) {
    const pems = await selfsigned.generate([{ name: 'commonName', value: host }], {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: host }] }],
    })
    mkdirSync(config.dataDir, { recursive: true })
    writeFileSync(keyFile, pems.private)
    writeFileSync(certFile, pems.cert)
  }
  const port = Number(httpsRedirect.port || 443)
  https
    .createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, app)
    .listen(port, () => console.log(`OAuth callback listening on https://${host}:${port}`))
}

import { config } from './config.js'
import { HttpError } from './httpError.js'

const CACHE_TTL = 10 * 60 * 1000

let cache = { data: null, fetchedAt: 0 }

// Current outdoor conditions from Open-Meteo (no API key needed).
export async function getWeather() {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.data
  const { latitude, longitude } = config.location
  const params = new URLSearchParams({ latitude, longitude, current: 'temperature_2m', timezone: 'auto' })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new HttpError(502, `Open-Meteo ${res.status}`)
  const body = await res.json()
  cache = {
    data: { location: config.location.name, temperature: body.current.temperature_2m, time: body.current.time },
    fetchedAt: Date.now(),
  }
  return cache.data
}

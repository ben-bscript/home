import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'

const file = join(config.dataDir, 'tokens.json')

function readAll() {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

export function getTokens(provider) {
  return readAll()[provider] ?? null
}

export function setTokens(provider, tokens) {
  const all = readAll()
  if (tokens) all[provider] = tokens
  else delete all[provider]
  mkdirSync(config.dataDir, { recursive: true })
  writeFileSync(file, JSON.stringify(all, null, 2))
}

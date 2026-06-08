import 'dotenv/config'
import { createClient, type Client } from '@libsql/client'

let _db: Client | null = null
let _baseUrl: string | null = null

export function getApiBaseUrl(): string {
  if (!_baseUrl) {
    _baseUrl = process.env.API_BASE_URL
    if (!_baseUrl) throw new Error('Missing API_BASE_URL in .env')
    _baseUrl = _baseUrl.replace(/\/+$/, '')
  }
  return _baseUrl
}

export function getDb(): Client {
  if (!_db) {
    const url = process.env.TURSO_URL
    const token = process.env.TURSO_TOKEN
    if (!url || !token) throw new Error('Missing TURSO_URL or TURSO_TOKEN in .env')
    _db = createClient({ url, authToken: token })
  }
  return _db
}

export function checkEnv(): string[] {
  const missing: string[] = []
  const required = ['TURSO_URL', 'TURSO_TOKEN', 'API_BASE_URL']
  for (const key of required) {
    if (!process.env[key]) missing.push(key)
  }
  return missing
}

export function isSkippable(): boolean {
  const missing = checkEnv()
  if (missing.length > 0) {
    console.warn(`Skipping real-infra tests: missing env vars: ${missing.join(', ')}`)
    return true
  }
  return false
}

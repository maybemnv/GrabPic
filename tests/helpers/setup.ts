import 'dotenv/config'

let baseUrl: string | null = null

export function getApiBaseUrl(): string {
  if (!baseUrl) {
    baseUrl = process.env.API_BASE_URL
    if (!baseUrl) throw new Error('Missing API_BASE_URL in local test environment')
    baseUrl = baseUrl.replace(/\/+$/, '')
  }
  return baseUrl
}

export function isSkippable(): boolean {
  if (process.env.RUN_REAL_INFRA_TESTS !== '1') {
    console.warn('Skipping deployed-infrastructure tests: set RUN_REAL_INFRA_TESTS=1 to enable')
    return true
  }
  if (!process.env.API_BASE_URL) {
    console.warn('Skipping deployed-infrastructure tests: missing API_BASE_URL')
    return true
  }
  return false
}

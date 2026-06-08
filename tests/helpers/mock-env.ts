import type { Env } from '../../apps/api/src/index'

export function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    PHOTOS: createMockR2(),
    LOG_LEVEL: 'debug',
    MODAL_TOKEN: 'mock-modal-token',
    MODAL_WEBHOOK_URL: 'https://mock.modal.com/webhook',
    TURSO_URL: 'http://mock.turso.com',
    TURSO_TOKEN: 'mock-turso-token',
    ...overrides,
  }
}

function createMockR2() {
  const store = new Map<string, { body: ReadableStream; contentType: string }>()

  return {
    put(key: string, value: ReadableStream | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }) {
      const body = typeof value === 'string' ? new ReadableStream() : value
      store.set(key, {
        body: body as ReadableStream,
        contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
      })
      return Promise.resolve({ etag: `"mock-${key}"`, key, version: 'mock-version', size: 1024, uploaded: new Date() })
    },

    get(key: string) {
      const entry = store.get(key)
      if (!entry) return Promise.resolve(null)
      return Promise.resolve({
        key,
        body: entry.body,
        contentType: entry.contentType,
        size: 1024,
        etag: `"mock-${key}"`,
        version: 'mock-version',
        uploaded: new Date(),
        httpMetadata: { contentType: entry.contentType },
        customMetadata: {},
        range: null,
        writeHttpMetadata: () => {},
      })
    },

    delete(key: string) {
      store.delete(key)
      return Promise.resolve()
    },

    head(key: string) {
      const entry = store.get(key)
      if (!entry) return Promise.resolve(null)
      return Promise.resolve({
        key,
        contentType: entry.contentType,
        size: 1024,
        etag: `"mock-${key}"`,
        version: 'mock-version',
        uploaded: new Date(),
        httpMetadata: { contentType: entry.contentType },
        customMetadata: {},
        range: null,
      })
    },

    createSignedUrl(key: string, options?: { expiration?: number; method?: string }) {
      return Promise.resolve(`https://mock-r2.com/${key}?expires=${options?.expiration ?? 3600}&method=${options?.method ?? 'GET'}`)
    },
  } as any
}

import { afterEach, expect, it, vi } from 'vitest'
import { uploadPhoto } from '../apps/web/src/lib/api'

afterEach(() => vi.unstubAllGlobals())
it('rejects failed signed PUTs before callers can confirm them', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 403 })),
  )
  await expect(
    uploadPhoto('https://r2.test/signed', new File(['x'], 'photo.jpg', { type: 'image/jpeg' })),
  ).rejects.toThrow('403')
})
it('accepts a successful signed PUT', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 200 })),
  )
  await expect(
    uploadPhoto('https://r2.test/signed', new File(['x'], 'photo.jpg', { type: 'image/jpeg' })),
  ).resolves.toBeUndefined()
})

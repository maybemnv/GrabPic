import { describe, expect, it } from 'vitest'
import { onRequestGet } from '../functions/e/[code]'

describe('Cloudflare Pages invite redirect', () => {
  it('keeps the opaque invitation in the attendee URL', async () => {
    const code = '0123456789abcdef0123456789abcdef'
    const response = await onRequestGet({
      params: { code },
      request: new Request(`https://grabpic.app/e/${code}`),
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`https://grabpic.app/attendee?invite=${code}`)
  })

  it('rejects invalid invitation path segments', async () => {
    const response = await onRequestGet({
      params: { code: '../admin' },
      request: new Request('https://grabpic.app/e/bad'),
    })
    expect(response.status).toBe(404)
  })
})

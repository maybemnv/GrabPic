import { describe, expect, it } from 'vitest'
import { hasConvexError } from '../apps/api/src/lib/convex'
import { sanitizeRequestPath } from '../apps/api/src/lib/logger'
import { timingSafeEqual } from '../apps/api/src/lib/secure-compare'

describe('review hardening', () => {
  it('matches only the structured or exact Convex error code', () => {
    expect(hasConvexError(new Error('UNAUTHORIZED'), 'UNAUTHORIZED')).toBe(true)
    const structured = Object.assign(new Error('server failure'), {
      data: { code: 'UNAUTHORIZED' },
    })
    expect(hasConvexError(structured, 'UNAUTHORIZED')).toBe(true)
    expect(hasConvexError(new Error('UNAUTHORIZED happened elsewhere'), 'UNAUTHORIZED')).toBe(false)
    expect(hasConvexError(new Error('NOT_UNAUTHORIZED'), 'UNAUTHORIZED')).toBe(false)
  })

  it('redacts invite tokens from request paths', () => {
    expect(
      sanitizeRequestPath('https://api.test/events/invite/0123456789abcdef0123456789abcdef'),
    ).toBe('/events/invite/[redacted]')
  })

  it('compares secrets without an early equality exit', () => {
    expect(timingSafeEqual('same-secret', 'same-secret')).toBe(true)
    expect(timingSafeEqual('same-secret', 'different')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { rateLimitKey } from '../apps/api/src/lib/rate-limit'

describe('rate limiting', () => {
  it('separates callers by route, event, and client address', () => {
    expect(rateLimitKey('match', 'evt_1', '203.0.113.4')).toBe('match:evt_1:203.0.113.4')
    expect(rateLimitKey('match', 'evt_2', '203.0.113.4')).not.toBe(
      rateLimitKey('match', 'evt_1', '203.0.113.4'),
    )
  })
})

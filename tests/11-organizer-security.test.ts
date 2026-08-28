import { describe, expect, it } from 'vitest'
import {
  generateOrganizerToken,
  hashOrganizerAuthorization,
  hashOrganizerToken,
} from '../apps/api/src/lib/organizer-auth'
import { globalRateLimitKey } from '../apps/api/src/lib/rate-limit'
import { isValidUploadedSize, MAX_UPLOAD_BYTES } from '../apps/api/src/lib/upload'

describe('organizer security and upload abuse controls', () => {
  it('generates high-entropy organizer tokens without storing the raw token', async () => {
    const token = generateOrganizerToken()
    const hash = await hashOrganizerToken(token)

    expect(token).toHaveLength(43)
    expect(hash).not.toContain(token)
  })

  it('hashes only a valid organizer bearer credential for Convex authorization', async () => {
    expect(await hashOrganizerAuthorization(undefined)).toBeNull()
    expect(await hashOrganizerAuthorization('Basic token')).toBeNull()
    expect(await hashOrganizerAuthorization('Bearer ')).toBeNull()
    expect(await hashOrganizerAuthorization('Bearer organizer-secret')).toBe(
      await hashOrganizerToken('organizer-secret'),
    )
  })

  it('uses one client-wide upload bucket even when event IDs rotate', () => {
    expect(globalRateLimitKey('upload-initiation', '203.0.113.4')).toBe(
      globalRateLimitKey('upload-initiation', '203.0.113.4'),
    )
    expect(globalRateLimitKey('upload-initiation', '203.0.113.4')).toBe(
      'upload-initiation::203.0.113.4',
    )
  })

  it('enforces the actual uploaded object size boundary', () => {
    expect(isValidUploadedSize(1)).toBe(true)
    expect(isValidUploadedSize(MAX_UPLOAD_BYTES)).toBe(true)
    expect(isValidUploadedSize(MAX_UPLOAD_BYTES + 1)).toBe(false)
    expect(isValidUploadedSize(0)).toBe(false)
  })
})

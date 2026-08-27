import { describe, expect, it } from 'vitest'
import {
  generateOrganizerToken,
  hashOrganizerToken,
  verifyOrganizerToken,
} from '../apps/api/src/lib/organizer-auth'
import { globalRateLimitKey } from '../apps/api/src/lib/rate-limit'
import { isValidUploadedSize, MAX_UPLOAD_BYTES } from '../apps/api/src/lib/upload'

describe('organizer security and upload abuse controls', () => {
  it('verifies high-entropy organizer tokens by hash without storing the raw token', async () => {
    const token = generateOrganizerToken()
    const hash = await hashOrganizerToken(token)

    expect(token).toHaveLength(43)
    expect(hash).not.toContain(token)
    expect(await verifyOrganizerToken(`Bearer ${token}`, hash)).toBe(true)
    expect(await verifyOrganizerToken(undefined, hash)).toBe(false)
    expect(await verifyOrganizerToken('Bearer wrong-token', hash)).toBe(false)
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

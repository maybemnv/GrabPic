import { describe, expect, it } from 'vitest'
import { claimProcessingBatch } from '../apps/api/src/lib/processing'

describe('processing batch readiness', () => {
  it('allows only one processing claim for an event', async () => {
    const db = {
      execute: async () => ({ rowsAffected: 1 }),
    }

    expect(await claimProcessingBatch(db, 'evt_1', 'batch_1')).toBe(true)
  })

  it('rejects a second concurrent processing claim', async () => {
    const db = {
      execute: async () => ({ rowsAffected: 0 }),
    }

    expect(await claimProcessingBatch(db, 'evt_1', 'batch_2')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { generatePasscode, insertEventWithUniquePasscode } from '../apps/api/src/lib/passcodes'

describe('event passcodes', () => {
  it('generates six-digit codes using the injected cryptographic source', () => {
    expect(generatePasscode(() => new Uint32Array([0]))).toBe('100000')
    expect(generatePasscode(() => new Uint32Array([899999]))).toBe('999999')
  })

  it('retries a database passcode collision before succeeding', async () => {
    let attempts = 0
    const insertEvent = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('UNIQUE constraint failed: events.passcode')
    }

    const result = await insertEventWithUniquePasscode(insertEvent, () => new Uint32Array([23456]))

    expect(result).toBe('123456')
    expect(attempts).toBe(2)
  })

  it('retries a Convex passcode collision before succeeding', async () => {
    let attempts = 0
    const insertEvent = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('PASSCODE_CONFLICT')
    }

    await insertEventWithUniquePasscode(insertEvent, () => new Uint32Array([23456]))

    expect(attempts).toBe(2)
  })
})

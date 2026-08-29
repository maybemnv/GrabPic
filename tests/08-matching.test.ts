import { describe, expect, it } from 'vitest'
import { decodeEmbedding, resolveMatchThreshold } from '../apps/api/src/lib/matching'

describe('embedding helpers', () => {
  it('rejects malformed embeddings', () => {
    expect(() => decodeEmbedding(new Uint8Array(4))).toThrow('512-dimensional')
    expect(() => decodeEmbedding(new Float32Array(512).fill(Number.NaN))).toThrow('finite')
  })

  it('resolves the server-owned threshold and rejects invalid values', () => {
    expect(resolveMatchThreshold()).toBe(0.6)
    expect(resolveMatchThreshold('0.75')).toBe(0.75)
    expect(() => resolveMatchThreshold('1.1')).toThrow('between 0 and 1')
  })
})

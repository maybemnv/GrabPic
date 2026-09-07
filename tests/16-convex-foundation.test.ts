import { describe, expect, it } from 'vitest'
import {
  requireServiceSecret,
  validateNormalizedEmbedding,
} from '../apps/api/convex/lib/validation'

function unitEmbedding(): number[] {
  return [1, ...Array<number>(511).fill(0)]
}

describe('Convex foundation validation', () => {
  it('rejects missing or incorrect Worker service credentials', () => {
    expect(() => requireServiceSecret('', 'worker-secret')).toThrow('Unauthorized')
    expect(() => requireServiceSecret('wrong', 'worker-secret')).toThrow('Unauthorized')
    expect(() => requireServiceSecret('worker-secret', 'worker-secret')).not.toThrow()
  })

  it('accepts only finite normalized 512-dimensional embeddings', () => {
    expect(validateNormalizedEmbedding(unitEmbedding())).toEqual(unitEmbedding())
    expect(() => validateNormalizedEmbedding(Array<number>(511).fill(0))).toThrow(
      '512-dimensional',
    )
    expect(() =>
      validateNormalizedEmbedding([Number.NaN, ...Array<number>(511).fill(0)]),
    ).toThrow('finite')
    expect(() => validateNormalizedEmbedding(Array<number>(512).fill(0))).toThrow('normalized')
    expect(() => validateNormalizedEmbedding([2, ...Array<number>(511).fill(0)])).toThrow(
      'normalized',
    )
  })
})

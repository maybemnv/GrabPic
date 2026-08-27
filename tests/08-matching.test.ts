import { describe, expect, it } from 'vitest'
import { decodeEmbedding, findMatches } from '../apps/api/src/lib/matching'

function embedding(value: number): Float32Array {
  const result = new Float32Array(512)
  result[0] = value
  result[1] = Math.sqrt(Math.max(0, 1 - value * value))
  return result
}

describe('face matching', () => {
  it('calculates similarity from normalized embeddings', () => {
    const matches = findMatches({
      eventId: 'evt_1',
      selfieEmbedding: embedding(1),
      threshold: 0.6,
      faces: [
        {
          eventId: 'evt_1',
          photoId: 'photo_1',
          embedding: embedding(1),
          bbox: { x: 1, y: 2, width: 3, height: 4 },
        },
      ],
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].similarity).toBeCloseTo(1)
  })

  it('includes the threshold boundary and excludes lower scores', () => {
    const matches = findMatches({
      eventId: 'evt_1',
      selfieEmbedding: embedding(1),
      threshold: 0.6,
      faces: [
        { eventId: 'evt_1', photoId: 'at', embedding: embedding(0.6), bbox: null },
        { eventId: 'evt_1', photoId: 'below', embedding: embedding(0.59), bbox: null },
      ],
    })

    expect(matches.map((match) => match.photoId)).toEqual(['at'])
  })

  it('isolates events, deduplicates photos, and keeps the best face score', () => {
    const matches = findMatches({
      eventId: 'evt_1',
      selfieEmbedding: embedding(1),
      threshold: 0.6,
      faces: [
        { eventId: 'evt_2', photoId: 'leak', embedding: embedding(1), bbox: null },
        { eventId: 'evt_1', photoId: 'photo_1', embedding: embedding(0.7), bbox: null },
        { eventId: 'evt_1', photoId: 'photo_1', embedding: embedding(1), bbox: null },
      ],
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].photoId).toBe('photo_1')
    expect(matches[0].similarity).toBeCloseTo(1)
  })

  it('returns no matches when every score is below threshold', () => {
    expect(
      findMatches({
        eventId: 'evt_1',
        selfieEmbedding: embedding(1),
        threshold: 0.6,
        faces: [{ eventId: 'evt_1', photoId: 'photo_1', embedding: embedding(0.5), bbox: null }],
      }),
    ).toEqual([])
  })

  it('rejects malformed embeddings', () => {
    expect(() => decodeEmbedding(new Uint8Array(4))).toThrow('512-dimensional')
    expect(() => decodeEmbedding(new Float32Array(512).fill(Number.NaN))).toThrow('finite')
  })
})

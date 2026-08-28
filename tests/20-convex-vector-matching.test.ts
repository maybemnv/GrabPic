import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { selectVectorMatches } from '../apps/api/convex/lib/vectorMatching'

function candidate(eventPublicId: string, photoId: string, score: number) {
  return {
    eventPublicId,
    photoId,
    originalKey: `events/${eventPublicId}/${photoId}.jpg`,
    thumbnail800Key: `events/${eventPublicId}/thumbs/800/${photoId}.jpg`,
    width: 1200,
    height: 800,
    bbox: { x: 1, y: 2, width: 3, height: 4 },
    score,
  }
}

describe('Convex vector matching', () => {
  it('isolates events, includes the threshold, ranks, and keeps the best face per photo', () => {
    const matches = selectVectorMatches({
      eventPublicId: 'evt_1',
      threshold: 0.6,
      candidates: [
        candidate('evt_2', 'cross_event', 1),
        candidate('evt_1', 'photo_1', 0.7),
        candidate('evt_1', 'photo_2', 0.6),
        candidate('evt_1', 'photo_1', 0.9),
        candidate('evt_1', 'below', 0.59),
      ],
    })

    expect(matches.map(({ photoId, score }) => [photoId, score])).toEqual([
      ['photo_1', 0.9],
      ['photo_2', 0.6],
    ])
  })

  it('caps the personalized gallery at 100 photos', () => {
    const candidates = Array.from({ length: 120 }, (_, index) =>
      candidate('evt_1', `photo_${index}`, 1 - index / 1000),
    )

    expect(
      selectVectorMatches({ eventPublicId: 'evt_1', threshold: 0.6, candidates }),
    ).toHaveLength(100)
  })

  it('keeps the approved event filter and 256-candidate ceiling explicit', () => {
    const source = readFileSync('apps/api/convex/matches.ts', 'utf8')

    expect(source).toContain('limit: 256')
    expect(source).toContain("filter: (query) => query.eq('eventId', event.eventId)")
  })
})

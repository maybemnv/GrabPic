import { describe, expect, it } from 'vitest'
import schema from '../apps/api/convex/schema'

describe('Convex migration contract', () => {
  it('defines the authoritative event-scoped vector store', () => {
    const face = schema.tables.faces
    expect(face.vectorIndexes).toEqual([
      expect.objectContaining({
        dimensions: 512,
        vectorField: 'embedding',
        filterFields: ['eventId'],
      }),
    ])
  })
})

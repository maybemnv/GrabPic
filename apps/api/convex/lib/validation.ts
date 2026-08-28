export function requireServiceSecret(provided: string, expected: string | undefined): void {
  if (!expected || provided !== expected) throw new Error('Unauthorized')
}

export function validateNormalizedEmbedding(embedding: number[]): number[] {
  if (embedding.length !== 512) throw new Error('Embedding must be 512-dimensional')
  if (embedding.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding values must be finite')
  }

  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
  if (Math.abs(norm - 1) > 0.001) throw new Error('Embedding must be normalized')
  return embedding
}

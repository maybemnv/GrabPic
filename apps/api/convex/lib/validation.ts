export function requireServiceSecret(provided: string, expected: string | undefined): void {
  if (!expected || !timingSafeEqual(provided, expected)) throw new Error('Unauthorized')
}

export function timingSafeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
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

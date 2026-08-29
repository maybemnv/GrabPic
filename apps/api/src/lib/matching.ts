export const DEFAULT_MATCH_THRESHOLD = 0.6

export function resolveMatchThreshold(value?: string): number {
  const threshold = value == null || value === '' ? DEFAULT_MATCH_THRESHOLD : Number(value)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('MATCH_THRESHOLD must be between 0 and 1')
  }
  return threshold
}

function bytesFromBase64(value: string): Uint8Array {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return bytes
}

export function decodeEmbedding(value: unknown): Float32Array {
  let bytes: Uint8Array

  if (value instanceof Float32Array) {
    return validateEmbedding(new Float32Array(value))
  }

  if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value)
  } else if (ArrayBuffer.isView(value)) {
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  } else if (typeof value === 'string') {
    bytes = bytesFromBase64(value)
  } else if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return validateEmbedding(new Float32Array(value))
  } else {
    throw new Error('Embedding must be a 512-dimensional Float32Array')
  }

  if (bytes.byteLength !== 512 * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error('Embedding must be 512-dimensional')
  }

  return validateEmbedding(new Float32Array(bytes.slice().buffer))
}

function validateEmbedding(embedding: Float32Array): Float32Array {
  if (embedding.length !== 512) throw new Error('Embedding must be 512-dimensional')
  if (embedding.some((value) => !Number.isFinite(value)))
    throw new Error('Embedding values must be finite')

  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) throw new Error('Embedding must not be zero')
  if (Math.abs(norm - 1) > 0.001) {
    for (let index = 0; index < embedding.length; index += 1) embedding[index] /= norm
  }
  return embedding
}

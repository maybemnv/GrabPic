export interface VectorMatchCandidate {
  eventPublicId: string
  photoId: string
  originalKey: string
  thumbnail800Key: string
  width?: number
  height?: number
  bbox: { x: number; y: number; width: number; height: number }
  score: number
}

export function selectVectorMatches({
  eventPublicId,
  threshold,
  candidates,
}: {
  eventPublicId: string
  threshold: number
  candidates: VectorMatchCandidate[]
}): VectorMatchCandidate[] {
  const matches = new Map<string, VectorMatchCandidate>()

  for (const candidate of candidates) {
    if (
      candidate.eventPublicId !== eventPublicId ||
      !Number.isFinite(candidate.score) ||
      candidate.score < threshold
    ) {
      continue
    }
    const existing = matches.get(candidate.photoId)
    if (!existing || candidate.score > existing.score) matches.set(candidate.photoId, candidate)
  }

  return [...matches.values()].sort((left, right) => right.score - left.score).slice(0, 100)
}

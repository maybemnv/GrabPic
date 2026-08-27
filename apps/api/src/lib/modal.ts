import { decodeEmbedding } from './matching'

export interface ProcessingPhoto {
  id: string
  r2Key: string
}

export interface ProcessingRequest {
  event_id: string
  photos: Array<{ photo_id: string; r2_key: string }>
}

export function buildProcessingRequest(
  eventId: string,
  photos: ProcessingPhoto[],
): ProcessingRequest {
  return {
    event_id: eventId,
    photos: photos.map(({ id, r2Key }) => ({ photo_id: id, r2_key: r2Key })),
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function requestSelfieEmbedding(
  url: string,
  token: string,
  selfieData: string,
  fetcher: Fetcher = fetch,
): Promise<Float32Array> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ selfie_data: selfieData }),
  })

  if (!response.ok) throw new Error(`Selfie embedding service failed with ${response.status}`)

  const body = (await response.json()) as { embedding?: unknown }
  if (body.embedding == null) throw new Error('Selfie embedding response is missing an embedding')
  return decodeEmbedding(body.embedding)
}

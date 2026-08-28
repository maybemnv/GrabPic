import { decodeEmbedding } from './matching'

export interface ProcessingPhoto {
  id: string
  r2Key: string
}

export interface ProcessingRequest {
  job_id: string
  event_id: string
  attempt: number
  photos: Array<{ photo_id: string; r2_key: string }>
}

export function buildProcessingRequest(
  jobId: string,
  eventId: string,
  attempt: number,
  photos: ProcessingPhoto[],
): ProcessingRequest {
  return {
    job_id: jobId,
    event_id: eventId,
    attempt,
    photos: photos.map(({ id, r2Key }) => ({ photo_id: id, r2_key: r2Key })),
  }
}

export async function requestProcessingAcceptance(
  url: string,
  token: string,
  request: ProcessingRequest,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) throw new Error(`Modal processing request rejected with ${response.status}`)

  const body = (await response.json()) as { job_id?: unknown }
  if (typeof body.job_id !== 'string' || body.job_id.length === 0 || body.job_id.length > 200) {
    throw new Error('Modal processing response is missing a job identifier')
  }
  return body.job_id
}

export async function requestProcessingCancellation(
  url: string,
  token: string,
  modalJobId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modal_job_id: modalJobId }),
  })
  if (!response.ok) throw new Error(`Modal cancellation failed with ${response.status}`)
  const body = (await response.json()) as { cancelled?: unknown }
  if (body.cancelled !== true) throw new Error('Modal did not acknowledge cancellation')
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

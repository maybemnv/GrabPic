const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data as T
}

export interface CreateEventPayload {
  name: string
  organizerEmail: string
  organizerName: string
  expiryDays?: number
}

export interface CreateEventResponse {
  eventId: string
  passcode: string
  uploadUrl: string
  shareUrl: string
  qrCode: string
  expiresAt: number
}

export interface UploadUrlsResponse {
  uploadUrls: Array<{ photoId: string; uploadUrl: string; filename: string }>
}

export interface ConfirmUploadPayload {
  photoIds: string[]
}

export interface ConfirmUploadResponse {
  status: string
  jobId?: string
  estimatedTime?: number
}

export interface EventStatusResponse {
  status: string
  photoCount: number
  faceCount: number
  progress: number
  error: string | null
}

export interface MatchPayload {
  passcode: string
  selfieData: string
  threshold?: number
}

export interface MatchResponse {
  matches: Array<{
    photoId: string
    similarity: number
    url: string
    thumbnailUrl: string
    width: number
    height: number
    faces: Array<{ bbox: { x: number; y: number; width: number; height: number }; isMatch: boolean }>
  }>
  totalMatches: number
  processingTime: number
}

export interface DeleteEventResponse {
  deleted: boolean
  photosDeleted: number
  storageFreed: number
}

export function createEvent(payload: CreateEventPayload) {
  return request<CreateEventResponse>('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getEvent(eventId: string) {
  return request<Record<string, unknown>>(`/events/${eventId}`)
}

export function getEventStatus(eventId: string) {
  return request<EventStatusResponse>(`/events/${eventId}/status`)
}

export function getUploadUrls(eventId: string, photos: Array<{ filename: string; size: number; type: string }>) {
  return request<UploadUrlsResponse>(`/events/${eventId}/upload`, {
    method: 'POST',
    body: JSON.stringify({ photos }),
  })
}

export function confirmUpload(eventId: string, photoIds: string[]) {
  return request<ConfirmUploadResponse>(`/events/${eventId}/upload/confirm`, {
    method: 'POST',
    body: JSON.stringify({ photoIds }),
  })
}

export function matchSelfie(eventId: string, payload: MatchPayload) {
  return request<MatchResponse>(`/events/${eventId}/match`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteEvent(eventId: string) {
  return request<DeleteEventResponse>(`/events/${eventId}`, { method: 'DELETE' })
}

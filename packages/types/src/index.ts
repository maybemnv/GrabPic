export interface Event {
  id: string
  name: string
  passcode: string
  createdAt: number
  expiresAt: number
  status: 'processing' | 'ready' | 'expired' | 'failed'
  photoCount: number
  faceCount: number
  organizerEmail: string
  organizerName: string
  maxPhotos: number
  tier: 'free' | 'pro'
}

export interface Photo {
  id: string
  eventId: string
  r2Key: string
  thumbnail200Key: string | null
  thumbnail800Key: string | null
  uploadedAt: number
  width: number | null
  height: number | null
  fileSize: number | null
}

export interface Face {
  id: string
  photoId: string
  bbox: BBox
  confidence: number
  clusterId: string | null
  landmarks: FaceLandmarks | null
}

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceLandmarks {
  leftEye: [number, number]
  rightEye: [number, number]
  nose: [number, number]
  leftMouth: [number, number]
  rightMouth: [number, number]
}

export interface FaceEmbedding {
  id: string
  faceId: string
  embedding: ArrayBuffer
  createdAt: number
}

export interface CreateEventRequest {
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

export interface UploadRequest {
  photos: Array<{ filename: string; size: number; type: string }>
}

export interface UploadResponse {
  uploadUrls: Array<{ photoId: string; uploadUrl: string; filename: string }>
}

export interface ConfirmUploadRequest {
  photoIds: string[]
}

export interface EventStatusResponse {
  status: string
  photoCount: number
  faceCount: number
  progress: number
  error: string | null
}

export interface MatchRequest {
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
    faces: Array<{ bbox: BBox; isMatch: boolean }>
  }>
  totalMatches: number
  processingTime: number
}

export interface PhotoDetailResponse {
  photoId: string
  url: string
  thumbnailUrl: string
  width: number
  height: number
  faces: Array<{ bbox: BBox }>
}

export interface DeleteEventResponse {
  deleted: boolean
  photosDeleted: number
  storageFreed: number
}

export interface ApiError {
  error: string
  code: string
}

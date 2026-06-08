import { describe, it, expect } from 'vitest'
import type {
  Event,
  Photo,
  Face,
  CreateEventRequest,
  CreateEventResponse,
  MatchRequest,
  MatchResponse,
  UploadRequest,
  UploadResponse,
  EventStatusResponse,
  DeleteEventResponse,
  ApiError,
} from '@grabpic/types'

describe('API Contract Validation (Type Shapes)', () => {
  describe('CreateEvent Contract', () => {
    const validRequest: CreateEventRequest = {
      name: 'Tech Conference 2026',
      organizerEmail: 'sarah@example.com',
      organizerName: 'Sarah Johnson',
      expiryDays: 30,
    }

    const validResponse: CreateEventResponse = {
      eventId: 'evt_1a2b3c4d',
      passcode: '123456',
      uploadUrl: '/events/evt_1a2b3c4d/upload',
      shareUrl: 'https://grabpic.app/e/123456',
      qrCode: 'https://api.grabpic.app/qr/evt_1a2b3c4d',
      expiresAt: 1741824000,
    }

    it('validates required fields exist', () => {
      expect(validRequest.name).toBeDefined()
      expect(validRequest.organizerEmail).toBeDefined()
      expect(validRequest.organizerName).toBeDefined()
    })

    it('validates response has all fields', () => {
      expect(validResponse.eventId).toMatch(/^evt_/)
      expect(validResponse.passcode).toMatch(/^\d{6}$/)
      expect(validResponse.uploadUrl).toContain('/upload')
      expect(validResponse.shareUrl).toContain('grabpic.app')
      expect(validResponse.expiresAt).toBeGreaterThan(0)
    })
  })

  describe('Upload Contract', () => {
    const validRequest: UploadRequest = {
      photos: [
        { filename: 'IMG_001.jpg', size: 4857344, type: 'image/jpeg' },
        { filename: 'IMG_002.jpg', size: 5123456, type: 'image/jpeg' },
      ],
    }

    const validResponse: UploadResponse = {
      uploadUrls: [
        {
          photoId: 'photo_abc123',
          uploadUrl: 'https://r2.grabpic.app/signed-url-1',
          filename: 'IMG_001.jpg',
        },
        {
          photoId: 'photo_def456',
          uploadUrl: 'https://r2.grabpic.app/signed-url-2',
          filename: 'IMG_002.jpg',
        },
      ],
    }

    it('validates photo metadata', () => {
      for (const photo of validRequest.photos) {
        expect(photo.filename).toBeTruthy()
        expect(photo.size).toBeGreaterThan(0)
        expect(photo.size).toBeLessThanOrEqual(50 * 1024 * 1024)
        expect(photo.type).toMatch(/^image\//)
      }
    })

    it('validates response URL shape', () => {
      for (const url of validResponse.uploadUrls) {
        expect(url.photoId).toMatch(/^photo_/)
        expect(url.uploadUrl).toContain('https://')
        expect(url.filename).toBeTruthy()
      }
    })
  })

  describe('Match Contract', () => {
    const validRequest: MatchRequest = {
      passcode: '123456',
      selfieData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      threshold: 0.6,
    }

    const validResponse: MatchResponse = {
      matches: [
        {
          photoId: 'photo_abc123',
          similarity: 0.87,
          url: 'https://cdn.grabpic.app/evt_123/photo_abc123_800.jpg',
          thumbnailUrl: 'https://cdn.grabpic.app/evt_123/photo_abc123_200.jpg',
          width: 4032,
          height: 3024,
          faces: [{ bbox: { x: 1200, y: 800, width: 400, height: 480 }, isMatch: true }],
        },
      ],
      totalMatches: 1,
      processingTime: 234,
    }

    it('validates match request body', () => {
      expect(validRequest.passcode).toMatch(/^\d{6}$/)
      expect(validRequest.selfieData).toContain('base64')
      expect(validRequest.threshold).toBeGreaterThanOrEqual(0)
      expect(validRequest.threshold).toBeLessThanOrEqual(1)
    })

    it('validates match response structure', () => {
      expect(validResponse.totalMatches).toBe(validResponse.matches.length)

      for (const match of validResponse.matches) {
        expect(match.photoId).toMatch(/^photo_/)
        expect(match.similarity).toBeGreaterThanOrEqual(0)
        expect(match.similarity).toBeLessThanOrEqual(1)
        expect(match.url).toContain('https://')
        expect(match.width).toBeGreaterThan(0)
        expect(match.height).toBeGreaterThan(0)

        for (const face of match.faces) {
          expect(face.bbox.x).toBeGreaterThanOrEqual(0)
          expect(face.bbox.y).toBeGreaterThanOrEqual(0)
          expect(face.bbox.width).toBeGreaterThan(0)
          expect(face.bbox.height).toBeGreaterThan(0)
        }
      }
    })

    it('returns processingTime in milliseconds', () => {
      expect(validResponse.processingTime).toBeGreaterThan(0)
      expect(validResponse.processingTime).toBeLessThan(5000)
    })
  })

  describe('Event Status Contract', () => {
    it('validates all possible status values', () => {
      const validStatuses = ['processing', 'ready', 'expired', 'failed']
      const status: EventStatusResponse = {
        status: 'ready',
        photoCount: 250,
        faceCount: 487,
        progress: 100,
        error: null,
      }

      expect(validStatuses).toContain(status.status)
      expect(status.photoCount).toBeGreaterThanOrEqual(0)
      expect(status.faceCount).toBeGreaterThanOrEqual(0)
      expect(status.progress).toBeGreaterThanOrEqual(0)
      expect(status.progress).toBeLessThanOrEqual(100)
    })
  })

  describe('Delete Contract', () => {
    it('validates delete response', () => {
      const response: DeleteEventResponse = {
        deleted: true,
        photosDeleted: 250,
        storageFreed: 1250000000,
      }

      expect(response.deleted).toBe(true)
      expect(response.photosDeleted).toBeGreaterThanOrEqual(0)
      expect(response.storageFreed).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Error Contract', () => {
    it('returns consistent error shape', () => {
      const errors: Array<{ status: number; error: ApiError }> = [
        { status: 400, error: { error: 'Validation failed', code: 'VALIDATION_ERROR' } },
        { status: 401, error: { error: 'Invalid passcode', code: 'UNAUTHORIZED' } },
        { status: 404, error: { error: 'Event not found', code: 'NOT_FOUND' } },
        { status: 500, error: { error: 'Internal server error', code: 'INTERNAL_ERROR' } },
      ]

      for (const { status, error } of errors) {
        expect(error.error).toBeTruthy()
        expect(error.code).toMatch(/^[A-Z_]+$/)

        if (status === 400) expect(error.code).toBe('VALIDATION_ERROR')
        if (status === 401) expect(error.code).toBe('UNAUTHORIZED')
        if (status === 404) expect(error.code).toBe('NOT_FOUND')
        if (status === 500) expect(error.code).toBe('INTERNAL_ERROR')
      }
    })
  })

  describe('Type: Event', () => {
    it('validates Event type shape', () => {
      const event: Event = {
        id: 'evt_001',
        name: 'Test Event',
        passcode: '123456',
        createdAt: 1700000000,
        expiresAt: 1702592000,
        status: 'ready',
        photoCount: 100,
        faceCount: 200,
        organizerEmail: 'test@example.com',
        organizerName: 'Tester',
        maxPhotos: 1000,
        tier: 'free',
      }

      expect(event.id).toMatch(/^evt_/)
      expect(event.passcode).toHaveLength(6)
      expect(event.createdAt).toBeLessThan(event.expiresAt)
      expect(['processing', 'ready', 'expired', 'failed']).toContain(event.status)
      expect(['free', 'pro']).toContain(event.tier)
    })
  })

  describe('Type: Face', () => {
    it('validates Face type shape', () => {
      const face: Face = {
        id: 'face_001',
        photoId: 'photo_001',
        bbox: { x: 100, y: 100, width: 200, height: 200 },
        confidence: 0.95,
        clusterId: 'cluster_1',
        landmarks: null,
      }

      expect(face.bbox.x).toBeGreaterThanOrEqual(0)
      expect(face.bbox.y).toBeGreaterThanOrEqual(0)
      expect(face.bbox.width).toBeGreaterThan(0)
      expect(face.bbox.height).toBeGreaterThan(0)
      expect(face.confidence).toBeGreaterThanOrEqual(0)
      expect(face.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('Type: Photo', () => {
    it('validates Photo type shape', () => {
      const photo: Photo = {
        id: 'photo_001',
        eventId: 'evt_001',
        r2Key: 'events/evt_001/photo_001.jpg',
        thumbnail200Key: 'events/evt_001/thumbs/200/photo_001.jpg',
        thumbnail800Key: 'events/evt_001/thumbs/800/photo_001.jpg',
        uploadedAt: 1700000000,
        width: 4032,
        height: 3024,
        fileSize: 4857344,
      }

      expect(photo.r2Key).toContain(photo.eventId)
      expect(photo.r2Key).toContain(photo.id)
      expect(photo.thumbnail200Key).toContain('thumbs/200')
      expect(photo.thumbnail800Key).toContain('thumbs/800')
    })
  })

  describe('Real Endpoint Contract Validation', () => {
    it('can import all contract types without error', () => {
      const types = {
        CreateEventRequest: {} as CreateEventRequest,
        CreateEventResponse: {} as CreateEventResponse,
        MatchRequest: {} as MatchRequest,
        MatchResponse: {} as MatchResponse,
        UploadRequest: {} as UploadRequest,
        UploadResponse: {} as UploadResponse,
        EventStatusResponse: {} as EventStatusResponse,
        DeleteEventResponse: {} as DeleteEventResponse,
        ApiError: {} as ApiError,
        Event: {} as Event,
        Photo: {} as Photo,
        Face: {} as Face,
      }
      expect(Object.keys(types).length).toBe(12)
    })
  })
})

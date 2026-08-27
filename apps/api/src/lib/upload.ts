export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function isValidUploadedSize(size: number): boolean {
  return Number.isInteger(size) && size > 0 && size <= MAX_UPLOAD_BYTES
}

export function photoObjectKey(eventId: string, photoId: string): string {
  return `events/${eventId}/${photoId}.jpg`
}

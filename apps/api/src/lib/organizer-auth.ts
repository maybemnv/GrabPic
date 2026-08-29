const ORGANIZER_TOKEN_BYTES = 32

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function generateOrganizerToken(): string {
  const bytes = new Uint8Array(ORGANIZER_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function hashOrganizerToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toHex(new Uint8Array(digest))
}

export async function hashOrganizerAuthorization(
  authorization: string | undefined,
): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length)
  return token ? hashOrganizerToken(token) : null
}

export function rateLimitKey(route: string, eventId: string, clientId: string): string {
  return `${route}:${eventId}:${clientId || 'unknown'}`
}

export function globalRateLimitKey(route: string, clientId: string): string {
  return rateLimitKey(route, '', clientId)
}

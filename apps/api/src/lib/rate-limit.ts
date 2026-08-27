export function rateLimitKey(route: string, eventId: string, clientId: string): string {
  return `${route}:${eventId}:${clientId || 'unknown'}`
}

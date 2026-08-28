import { ConvexError } from 'convex/values'

export function appError(code: string): never {
  throw new ConvexError({ code })
}

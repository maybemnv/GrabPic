import { v } from 'convex/values'
import { query } from './_generated/server'
import { requireServiceSecret } from './lib/validation'

export const health = query({
  args: { serviceSecret: v.string() },
  returns: v.object({ status: v.literal('ok') }),
  handler: async (_ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    return { status: 'ok' as const }
  },
})

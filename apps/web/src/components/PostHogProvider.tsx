'use client'

import posthog from 'posthog-js'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY
    if (!key || key.length === 0) return

    if (!posthog.__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        capture_pageview: false,
        loaded: (ph) => {
          if (process.env.NODE_ENV !== 'production') ph.opt_out_capturing()
        },
      })
    }
  }, [])

  useEffect(() => {
    if (posthog.__loaded) {
      posthog.capture('$pageview', { $current_url: pathname + searchParams.toString() })
    }
  }, [pathname, searchParams])

  return <>{children}</>
}

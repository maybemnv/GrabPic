'use client'

import { Button } from '@/components/ui/Button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="font-display text-2xl text-ink tracking-tight mb-4">Something went wrong</h1>
        <p className="text-sm text-muted mb-8">An unexpected error occurred. Please try again.</p>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  )
}

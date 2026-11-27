import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="font-display text-6xl text-ink tracking-tight mb-4">404</h1>
        <p className="text-muted mb-8">
          This page doesn&apos;t exist. The link might be broken, or the event may have expired.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 font-medium text-sm bg-terracotta text-white px-6 py-3 rounded-input hover:bg-terracotta-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}

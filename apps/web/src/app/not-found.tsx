import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-[#E1E0CC] font-['Almarai',sans-serif] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-6xl font-['Instrument_Serif',serif] tracking-tight mb-4">404</h1>
        <p className="text-[#E1E0CC]/60 mb-8">
          This page doesn&apos;t exist. The link might be broken, or the event may have expired.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-[#DEDBC8] text-black text-sm font-medium hover:bg-[#DEDBC8]/90 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}

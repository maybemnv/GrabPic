'use client'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-black text-[#E1E0CC] font-['Almarai',sans-serif] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-2xl font-['Instrument_Serif',serif] tracking-tight mb-4">Something went wrong</h1>
        <p className="text-[#E1E0CC]/60 mb-8 text-sm">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="inline-block px-6 py-3 rounded-xl bg-[#DEDBC8] text-black text-sm font-medium hover:bg-[#DEDBC8]/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

'use client'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-black text-[#E1E0CC] font-['Almarai',sans-serif] flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-['Instrument_Serif',serif] tracking-tight mb-4">Critical Error</h1>
          <p className="text-[#E1E0CC]/60 mb-8 text-sm">
            {error.message || 'A critical error occurred. Please reload the page.'}
          </p>
          <button
            onClick={reset}
            className="inline-block px-6 py-3 rounded-xl bg-[#DEDBC8] text-black text-sm font-medium hover:bg-[#DEDBC8]/90 transition-colors"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}

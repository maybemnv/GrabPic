'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Inter, -apple-system, sans-serif',
          backgroundColor: '#F8F4EB',
          color: '#30251E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '28rem', padding: '1.5rem' }}>
          <h1
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: '1.5rem',
              marginBottom: '1rem',
            }}
          >
            Critical Error
          </h1>
          <p style={{ color: '#71655B', fontSize: '0.875rem', marginBottom: '2rem' }}>
            A critical error occurred. Please reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              backgroundColor: '#B95632',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}

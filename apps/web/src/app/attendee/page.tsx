'use client'

import { useState, useRef } from 'react'

export default function AttendeePage() {
  const [eventId, setEventId] = useState('')
  const [passcode, setPasscode] = useState('')
  const [step, setStep] = useState<'code' | 'selfie' | 'gallery'>('code')
  const [selfie, setSelfie] = useState<string | null>(null)
  const [matches, setMatches] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setStep('selfie')
  }

  function startCamera() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    })
  }

  function captureSelfie() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg')
    setSelfie(dataUrl)

    if (video.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    }
  }

  async function handleMatch() {
    if (!selfie) return
    setLoading(true)

    try {
      const res = await fetch(`/api/events/${eventId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, selfieData: selfie }),
      })
      const data = await res.json()

      if (res.ok) {
        setMatches(data.matches as Array<Record<string, unknown>>)
        setStep('gallery')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Find My Photos</h1>

      {step === 'code' && (
        <form onSubmit={handleJoin} className="space-y-4">
          <input
            className="w-full border rounded-lg p-3"
            placeholder="Event ID"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-lg p-3 font-mono text-center text-2xl tracking-widest"
            placeholder="000000"
            maxLength={6}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-black text-white p-3 font-medium hover:bg-gray-800"
          >
            Continue
          </button>
        </form>
      )}

      {step === 'selfie' && (
        <div className="space-y-4">
          {!selfie ? (
            <>
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg" />
              <button
                onClick={startCamera}
                className="w-full rounded-lg bg-black text-white p-3 font-medium hover:bg-gray-800"
              >
                Start Camera
              </button>
              <button
                onClick={captureSelfie}
                className="w-full rounded-lg border border-gray-300 p-3 font-medium hover:bg-gray-100"
              >
                Capture Selfie
              </button>
            </>
          ) : (
            <>
              <img
                src={selfie}
                alt="Selfie"
                className="w-48 h-48 object-cover rounded-full mx-auto"
              />
              <button
                onClick={handleMatch}
                disabled={loading}
                className="w-full rounded-lg bg-black text-white p-3 font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? 'Finding your photos...' : 'Find My Photos'}
              </button>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {step === 'gallery' && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">Found {matches.length} photos of you</p>
          <div className="grid grid-cols-2 gap-4">
            {matches.map((photo) => (
              <div
                key={photo.photoId as string}
                className="bg-white border rounded-lg overflow-hidden"
              >
                <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                  Photo
                </div>
                <div className="p-2 text-xs text-gray-500">
                  Match: {Math.round((photo.similarity as number) * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

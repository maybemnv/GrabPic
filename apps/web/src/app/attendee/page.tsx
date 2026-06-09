'use client'

import { useState, useRef } from 'react'
import { matchSelfie, getEvent, type MatchResponse } from '@/lib/api'
import { ArrowRight, Camera, Check, Loader } from 'lucide-react'

export default function AttendeePage() {
  const [eventId, setEventId] = useState('')
  const [passcode, setPasscode] = useState('')
  const [step, setStep] = useState<'code' | 'selfie' | 'gallery'>('code')
  const [selfie, setSelfie] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [matches, setMatches] = useState<MatchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [eventName, setEventName] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const eventData = await getEvent(eventId)
      setEventName((eventData.name as string) || 'Event')
      setStep('selfie')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Event not found')
    } finally {
      setLoading(false)
    }
  }

  function startCamera() {
    setCameraActive(true)
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => {
        setError('Camera access denied. Please allow camera permissions.')
        setCameraActive(false)
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
      video.srcObject.getTracks().forEach((t) => t.stop())
    }
    setCameraActive(false)
  }

  async function handleMatch() {
    if (!selfie) return
    setLoading(true)
    setError('')
    try {
      const data = await matchSelfie(eventId, {
        passcode,
        selfieData: selfie,
        threshold: 0.6,
      })
      setMatches(data)
      setStep('gallery')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Matching failed')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep('code')
    setSelfie(null)
    setMatches(null)
    setConsent(false)
    setCameraActive(false)
    setError('')
    setEventName('')
  }

  return (
    <main className="min-h-screen bg-black">
      <div className="mx-auto max-w-lg px-4 py-16 md:py-24">
        <a
          href="/"
          className="inline-block text-xs sm:text-sm mb-8 transition-colors"
          style={{ color: 'rgba(225, 224, 204, 0.6)' }}
        >
          &larr; Back to home
        </a>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-2" style={{ color: '#E1E0CC' }}>
          Find My Photos
        </h1>
        <p className="text-xs sm:text-sm mb-8" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
          Enter your event code and take a selfie to see every photo you appear in.
        </p>

        {error && (
          <div className="mb-6 rounded-xl bg-red-900/30 border border-red-800/50 px-4 py-3">
            <p className="text-xs sm:text-sm text-red-400">{error}</p>
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs sm:text-sm mb-1.5" style={{ color: 'rgba(225, 224, 204, 0.7)' }}>
                Event Code
              </label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors font-mono text-center text-2xl tracking-[0.3em]"
                style={{ color: '#E1E0CC' }}
                placeholder="000000"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm mb-1.5" style={{ color: 'rgba(225, 224, 204, 0.7)' }}>
                Event ID
              </label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs sm:text-sm placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                style={{ color: '#E1E0CC' }}
                placeholder="evt_1a2b3c4d"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all hover:gap-3 disabled:opacity-50"
              style={{ backgroundColor: '#DEDBC8', color: '#000' }}
            >
              {loading ? <><Loader className="w-4 h-4 animate-spin" /> Checking...</> : <>Continue <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        )}

        {step === 'selfie' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#101010] p-5">
              <p className="text-xs sm:text-sm font-medium mb-1" style={{ color: '#E1E0CC' }}>
                {eventName}
              </p>
              <p className="text-[10px] sm:text-xs" style={{ color: 'rgba(225, 224, 204, 0.5)' }}>
                Code: {passcode}
              </p>
            </div>

            {!selfie ? (
              <>
                {!cameraActive ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 bg-white/5 px-6 py-12">
                    <Camera className="w-8 h-8 mb-3" style={{ color: 'rgba(225, 224, 204, 0.5)' }} />
                    <p className="text-xs sm:text-sm text-center mb-4" style={{ color: 'rgba(225, 224, 204, 0.5)' }}>
                      Take a selfie to find your photos
                    </p>
                    <button
                      onClick={startCamera}
                      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                      style={{ backgroundColor: '#DEDBC8', color: '#000' }}
                    >
                      <Camera className="w-4 h-4" /> Open Camera
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <video ref={videoRef} autoPlay playsInline className="w-full rounded-2xl" />
                    <button
                      onClick={captureSelfie}
                      className="w-full rounded-full px-5 py-3 text-sm font-medium"
                      style={{ backgroundColor: '#DEDBC8', color: '#000' }}
                    >
                      Capture Selfie
                    </button>
                  </div>
                )}

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="text-[10px] sm:text-xs leading-relaxed" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
                    I consent to facial recognition processing for matching photos at this event.
                    My face data is used only for this event, deleted after 30 days, and never shared.
                  </span>
                </label>

                <button
                  onClick={handleMatch}
                  disabled={!consent || loading}
                  className="group w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-all hover:gap-3 disabled:opacity-30"
                  style={{ backgroundColor: '#DEDBC8', color: '#000' }}
                >
                  {loading ? <><Loader className="w-4 h-4 animate-spin" /> Finding your photos...</> : <>Find My Photos <ArrowRight className="w-4 h-4" /></>}
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <img
                  src={selfie}
                  alt="Your selfie"
                  className="w-32 h-32 object-cover rounded-full mx-auto border-2 border-primary/30"
                />
                <button
                  onClick={() => { setSelfie(null); setCameraActive(false) }}
                  className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-xs sm:text-sm transition-colors hover:bg-white/5"
                  style={{ color: 'rgba(225, 224, 204, 0.7)' }}
                >
                  Retake
                </button>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {step === 'gallery' && matches && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#101010] p-5 flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium" style={{ color: '#E1E0CC' }}>
                  {matches.totalMatches} photo{matches.totalMatches !== 1 ? 's' : ''} found
                </p>
                <p className="text-[10px] sm:text-xs" style={{ color: 'rgba(225, 224, 204, 0.5)' }}>
                  Matched in {(matches.processingTime / 1000).toFixed(1)}s
                </p>
              </div>
              <Check className="w-5 h-5 text-green-400" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {matches.matches.map((photo) => (
                <a
                  key={photo.photoId}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative rounded-xl overflow-hidden border border-white/10 bg-[#101010] aspect-square"
                >
                  <div className="absolute inset-0 flex items-center justify-center bg-[#101010]">
                    <span className="text-[10px] sm:text-xs" style={{ color: 'rgba(225, 224, 204, 0.3)' }}>
                      Photo
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-[10px] sm:text-xs font-medium" style={{ color: '#E1E0CC' }}>
                      {Math.round(photo.similarity * 100)}% match
                    </p>
                  </div>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4" style={{ color: '#DEDBC8' }} />
                  </div>
                </a>
              ))}
            </div>

            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all hover:gap-3"
              style={{ backgroundColor: '#DEDBC8', color: '#000' }}
            >
              Find Another Event
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

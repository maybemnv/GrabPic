'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { matchSelfie, lookupEvent, getEventByInviteToken, type MatchResponse } from '@/lib/api'
import { Camera, Download, Loader2 } from 'lucide-react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/FormField'
import { ErrorState, EmptyState, LoadingState } from '@/components/ui/States'
import { Lightbox } from '@/components/ui/Lightbox'
import { FadeIn } from '@/components/ui/FadeIn'

export default function AttendeePage() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite') || ''
  const [eventId, setEventId] = useState('')
  const [passcode, setPasscode] = useState('')
  const [step, setStep] = useState<'code' | 'selfie' | 'matching' | 'gallery'>('code')
  const [selfie, setSelfie] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [matches, setMatches] = useState<MatchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [eventName, setEventName] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!inviteToken || eventId) return
    setLoading(true)
    getEventByInviteToken(inviteToken)
      .then((eventData) => {
        setEventId(eventData.eventId)
        setEventName(eventData.name)
        setStep('selfie')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Invite not found'))
      .finally(() => setLoading(false))
  }, [inviteToken, eventId])

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const eventData = await lookupEvent(passcode)
      setEventId(eventData.eventId)
      setEventName(eventData.name || 'Event')
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
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => {
        setError('Camera access denied. Please allow camera permissions.')
        setCameraActive(false)
      })
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
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
    stopCamera()
  }

  async function handleMatch() {
    if (!selfie) return
    setStep('matching')
    setLoading(true)
    setError('')
    try {
      const data = await matchSelfie(eventId, {
        ...(passcode ? { passcode } : { inviteToken }),
        selfieData: selfie,
      })
      setMatches(data)
      setStep('gallery')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Matching failed')
      setStep('selfie')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    if (inviteToken) {
      window.location.assign('/attendee')
      return
    }
    stopCamera()
    setStep('code')
    setSelfie(null)
    setMatches(null)
    setConsent(false)
    setError('')
    setEventName('')
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-paper paper-texture">
        <div className="mx-auto max-w-lg px-6 py-12 md:py-20">
          <FadeIn>
            <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.1em] text-muted mb-3">
              Find My Photos
            </p>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
              {step === 'gallery'
                ? eventName
                : step === 'matching'
                  ? 'Looking through your moments'
                  : 'Let\u2019s find your photos.'}
            </h1>
            {step === 'code' && (
              <p className="mt-2 text-sm text-muted">
                Enter your event code or open a shared link to get started.
              </p>
            )}
          </FadeIn>

          {error && (
            <div className="mt-6">
              <ErrorState message={error} retry={() => setError('')} />
            </div>
          )}

          {/* Step: Event Code */}
          {step === 'code' && !inviteToken && (
            <FadeIn delay={0.08}>
              <form onSubmit={handleJoin} className="mt-8 space-y-5">
                <Input
                  label="Event Code"
                  placeholder="000000"
                  maxLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="font-mono text-center text-2xl tracking-[0.3em]"
                  required
                />
                <Button type="submit" showArrow loading={loading} className="w-full">
                  Continue
                </Button>
              </form>
            </FadeIn>
          )}

          {/* Loading invite */}
          {step === 'code' && inviteToken && loading && (
            <div className="mt-8">
              <LoadingState message="Loading event…" />
            </div>
          )}

          {/* Step: Selfie */}
          {step === 'selfie' && (
            <div className="mt-8 space-y-5">
              <FadeIn>
                <div className="rounded-card border border-border bg-ivory px-5 py-4">
                  <p className="text-sm font-medium text-ink">{eventName}</p>
                  {passcode && <p className="text-xs text-muted mt-0.5">Code: {passcode}</p>}
                </div>
              </FadeIn>

              {/* Consent */}
              <FadeIn delay={0.06}>
                <div className="rounded-card border border-border bg-ivory p-5">
                  <h3 className="text-sm font-semibold text-ink mb-2">Consent Required</h3>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-border text-terracotta focus:ring-terracotta"
                    />
                    <span className="text-sm text-muted leading-relaxed">
                      I consent to facial recognition processing for matching photos at this event.
                      My face data is used only for this event, deleted after 30 days, and never
                      shared across events.
                    </span>
                  </label>
                </div>
              </FadeIn>

              {/* Camera */}
              {!selfie ? (
                <FadeIn delay={0.12}>
                  {!cameraActive ? (
                    <div className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-border bg-ivory px-6 py-12">
                      <Camera className="w-8 h-8 text-muted/40 mb-3" />
                      <p className="text-sm text-muted text-center mb-4">
                        Take a selfie to find your photos
                      </p>
                      <Button onClick={startCamera} disabled={!consent}>
                        <Camera className="w-4 h-4" />
                        Open Camera
                      </Button>
                      {!consent && (
                        <p className="text-xs text-muted mt-3">
                          Please accept the consent above to continue.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative rounded-card overflow-hidden bg-espresso">
                        <video ref={videoRef} autoPlay playsInline className="w-full block" />
                        {/* Corner guides */}
                        <div className="absolute inset-6 pointer-events-none">
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/40 rounded-tl" />
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/40 rounded-tr" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/40 rounded-bl" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/40 rounded-br" />
                        </div>
                      </div>
                      <Button onClick={captureSelfie} className="w-full">
                        Capture Selfie
                      </Button>
                    </div>
                  )}
                </FadeIn>
              ) : (
                <FadeIn delay={0.12}>
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <img
                        src={selfie}
                        alt="Your selfie"
                        className="w-32 h-32 object-cover rounded-full border-2 border-border"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          setSelfie(null)
                          stopCamera()
                        }}
                      >
                        Retake
                      </Button>
                      <Button
                        className="flex-1"
                        showArrow
                        onClick={handleMatch}
                        disabled={!consent}
                        loading={loading}
                      >
                        Find My Photos
                      </Button>
                    </div>
                  </div>
                </FadeIn>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {/* Step: Matching */}
          {step === 'matching' && (
            <div className="mt-8">
              <LoadingState message="Looking through your moments…" />
            </div>
          )}

          {/* Step: Gallery */}
          {step === 'gallery' && matches && (
            <div className="mt-8 space-y-6">
              <FadeIn>
                <div className="rounded-card border border-border bg-ivory px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {matches.totalMatches} photo{matches.totalMatches !== 1 ? 's' : ''} found
                    </p>
                    <p className="text-xs text-muted">
                      Matched in {(matches.processingTime / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
              </FadeIn>

              {matches.totalMatches === 0 ? (
                <EmptyState
                  title="No photos found"
                  description="We couldn't find you in any of the event photos. This can happen if the photos haven't been fully processed yet."
                  action={{ label: 'Find Another Event', onClick: reset }}
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {matches.matches.map((photo, i) => (
                      <FadeIn key={photo.photoId} delay={Math.min(i * 0.04, 0.3)}>
                        <button
                          onClick={() => setLightboxIndex(i)}
                          className="group relative rounded-photo overflow-hidden bg-oat aspect-square w-full border border-border/60 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
                        >
                          <img
                            src={photo.thumbnailUrl}
                            alt={`Photo ${i + 1} from ${eventName}`}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        </button>
                      </FadeIn>
                    ))}
                  </div>

                  <Lightbox
                    open={lightboxIndex !== null}
                    onClose={() => setLightboxIndex(null)}
                    onPrev={
                      lightboxIndex !== null && lightboxIndex > 0
                        ? () => setLightboxIndex(lightboxIndex - 1)
                        : undefined
                    }
                    onNext={
                      lightboxIndex !== null && lightboxIndex < matches.matches.length - 1
                        ? () => setLightboxIndex(lightboxIndex + 1)
                        : undefined
                    }
                  >
                    {lightboxIndex !== null && (
                      <div className="relative">
                        <img
                          src={matches.matches[lightboxIndex].url}
                          alt={`Photo ${lightboxIndex + 1} from ${eventName}`}
                          className="max-w-[90vw] max-h-[85vh] object-contain rounded-photo"
                        />
                        <a
                          href={matches.matches[lightboxIndex].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute bottom-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                          aria-label="Open original"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </Lightbox>

                  <Button variant="secondary" onClick={reset}>
                    Find Another Event
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

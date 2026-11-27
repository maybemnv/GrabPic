'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  createEvent,
  getUploadUrls,
  confirmUpload,
  getEventStatus,
  type CreateEventResponse,
} from '@/lib/api'
import { Copy, Check, Upload, Share2, ExternalLink } from 'lucide-react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/FormField'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ErrorState } from '@/components/ui/States'
import { FadeIn } from '@/components/ui/FadeIn'

export default function OrganizerPage() {
  const [eventName, setEventName] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [event, setEvent] = useState<CreateEventResponse | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const data = await createEvent({
        name: eventName,
        organizerEmail: email,
        organizerName: name,
      })
      setEvent(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setCreating(false)
    }
  }

  async function handleUpload() {
    if (!event || photos.length === 0) return
    setUploading(true)
    setError('')
    try {
      setUploadProgress('Requesting upload URLs…')
      const { uploadUrls } = await getUploadUrls(
        event.eventId,
        event.organizerToken,
        photos.map((f) => ({
          filename: f.name,
          size: f.size,
          type: f.type,
        })),
      )

      setUploadProgress(`Uploading ${photos.length} photos…`)
      const results = await Promise.allSettled(
        uploadUrls.map((u, i) =>
          fetch(u.uploadUrl, {
            method: 'PUT',
            body: photos[i],
            headers: { 'Content-Type': photos[i].type },
          }).then((res) => {
            if (!res.ok) throw new Error(`Upload failed for ${photos[i].name}: ${res.status}`)
            return u.photoId
          }),
        ),
      )

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value)

      const failed = results.filter((r) => r.status === 'rejected').length

      if (succeeded.length === 0) {
        setError('All uploads failed. Please try again.')
        setUploading(false)
        return
      }

      if (failed > 0) {
        setUploadProgress(`${succeeded.length} uploaded, ${failed} failed.`)
      } else {
        setUploadProgress('Confirming upload…')
      }

      const confirm = await confirmUpload(event.eventId, event.organizerToken, succeeded)
      setUploadProgress(
        `Processing started${confirm.estimatedTime ? ` (est. ${confirm.estimatedTime}s)` : ''}.${failed > 0 ? ` ${failed} file(s) failed to upload.` : ''}`,
      )

      pollingRef.current = setInterval(async () => {
        try {
          const status = await getEventStatus(event.eventId, event.organizerToken)
          setProcessingStatus(status.status)
          if (status.status === 'ready' || status.status === 'failed') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            pollingRef.current = null
          }
        } catch {
          /* continue polling */
        }
      }, 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) setPhotos(files)
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-paper paper-texture">
        <div className="mx-auto max-w-2xl px-6 py-12 md:py-20">
          <FadeIn>
            <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.1em] text-muted mb-3">
              Organizer Workspace
            </p>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
              {event ? eventName : 'Create an event'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {event
                ? 'Manage your event, upload photos, and share with attendees.'
                : 'Set up your event to start uploading and sharing photos.'}
            </p>
          </FadeIn>

          {error && (
            <div className="mt-6">
              <ErrorState message={error} retry={() => setError('')} />
            </div>
          )}

          {!event ? (
            <FadeIn delay={0.1}>
              <form onSubmit={handleCreateEvent} className="mt-8 space-y-5">
                <Input
                  label="Event Name"
                  placeholder="e.g. Tech Conference 2026"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  required
                />
                <Input
                  label="Your Email"
                  type="email"
                  placeholder="sarah@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Your Name"
                  placeholder="Sarah Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Button type="submit" showArrow loading={creating}>
                  Create Event
                </Button>
              </form>
            </FadeIn>
          ) : (
            <div className="mt-8 space-y-6">
              {/* Event Overview */}
              <FadeIn>
                <div className="rounded-card border border-border bg-ivory p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-lg font-semibold text-ink">{eventName}</h2>
                    {processingStatus && (
                      <StatusBadge
                        status={
                          processingStatus === 'ready'
                            ? 'ready'
                            : processingStatus === 'failed'
                              ? 'failed'
                              : 'processing'
                        }
                      />
                    )}
                  </div>

                  <div className="space-y-3">
                    <InfoRow
                      label="Passcode"
                      value={
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-lg tracking-widest font-semibold text-ink">
                            {event.passcode}
                          </span>
                          <CopyBtn
                            onClick={() => copyText(event.passcode, 'passcode')}
                            copied={copied === 'passcode'}
                          />
                        </div>
                      }
                    />

                    <InfoRow
                      label="Share Link"
                      value={
                        <div className="flex items-center gap-2">
                          <a
                            href={event.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-terracotta hover:text-terracotta-dark transition-colors inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open link
                          </a>
                          <CopyBtn
                            onClick={() => copyText(event.shareUrl, 'shareUrl')}
                            copied={copied === 'shareUrl'}
                          />
                        </div>
                      }
                    />
                  </div>

                  <div className="mt-4 rounded-input border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-3">
                    <p className="text-xs font-medium text-[var(--warning)] mb-1">
                      Save your organizer token
                    </p>
                    <p className="text-xs text-[var(--warning)]/80 mb-2">
                      This token is shown only once and is required for future management.
                    </p>
                    <div className="flex items-start gap-2">
                      <code className="text-[11px] text-[var(--warning)] break-all flex-1 select-all">
                        {event.organizerToken}
                      </code>
                      <CopyBtn
                        onClick={() => copyText(event.organizerToken, 'token')}
                        copied={copied === 'token'}
                      />
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* Photo Upload */}
              <FadeIn delay={0.08}>
                <div className="rounded-card border border-border bg-ivory p-6">
                  <h2 className="text-lg font-semibold text-ink mb-4">Upload Photos</h2>

                  <div
                    className="flex flex-col items-center justify-center rounded-input border-2 border-dashed border-border bg-paper px-6 py-10 cursor-pointer transition-colors hover:border-terracotta/40 hover:bg-oat/20"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                    }}
                  >
                    <Upload className="w-6 h-6 text-muted mb-2" />
                    <p className="text-sm text-muted text-center">
                      {photos.length > 0
                        ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} selected`
                        : 'Drag and drop photos, or click to browse'}
                    </p>
                    <p className="text-xs text-muted/60 mt-1">JPEG, PNG, WebP</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setPhotos(Array.from(e.target.files || []))}
                      className="hidden"
                    />
                  </div>

                  {photos.length > 0 && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button onClick={handleUpload} loading={uploading}>
                        <Upload className="w-4 h-4" />
                        Upload & Process
                      </Button>
                      {!uploading && (
                        <Button variant="ghost" onClick={() => setPhotos([])}>
                          Clear
                        </Button>
                      )}
                    </div>
                  )}

                  {uploadProgress && <p className="mt-3 text-sm text-muted">{uploadProgress}</p>}

                  {processingStatus && (
                    <div className="mt-3">
                      <StatusBadge
                        status={
                          processingStatus === 'ready'
                            ? 'ready'
                            : processingStatus === 'failed'
                              ? 'failed'
                              : 'processing'
                        }
                        label={
                          processingStatus === 'ready'
                            ? 'Processing complete'
                            : processingStatus === 'failed'
                              ? 'Processing failed'
                              : 'Processing photos…'
                        }
                      />
                    </div>
                  )}
                </div>
              </FadeIn>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-input bg-paper px-4 py-3">
      <span className="text-sm text-muted">{label}</span>
      {value}
    </div>
  )
}

function CopyBtn({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-input text-muted hover:text-ink hover:bg-oat/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[var(--success)]" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

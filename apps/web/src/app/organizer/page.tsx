'use client'

import { useState } from 'react'
import {
  createEvent,
  getUploadUrls,
  confirmUpload,
  getEventStatus,
  type CreateEventResponse,
} from '@/lib/api'
import { ArrowRight, Check, Copy, Upload, Share2, Loader } from 'lucide-react'

export default function OrganizerPage() {
  const [eventName, setEventName] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [event, setEvent] = useState<CreateEventResponse | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const data = await createEvent({
        name: eventName,
        organizerEmail: email,
        organizerName: name,
      })
      setEvent(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    }
  }

  async function handleUpload() {
    if (!event || photos.length === 0) return
    setUploading(true)
    setError('')
    try {
      setUploadStatus('Requesting upload URLs...')
      const { uploadUrls } = await getUploadUrls(event.eventId, photos.map((f) => ({
        filename: f.name,
        size: f.size,
        type: f.type,
      })))

      setUploadStatus('Uploading photos...')
      await Promise.all(
        uploadUrls.map((u, i) =>
          fetch(u.uploadUrl, {
            method: 'PUT',
            body: photos[i],
            headers: { 'Content-Type': photos[i].type },
          }),
        ),
      )

      setUploadStatus('Confirming upload...')
      const confirm = await confirmUpload(
        event.eventId,
        uploadUrls.map((u) => u.photoId),
      )
      setUploadStatus(`Processing started. ${confirm.estimatedTime ? `Est. ${confirm.estimatedTime}s` : ''}`)

      const interval = setInterval(async () => {
        try {
          const status = await getEventStatus(event.eventId)
          setProcessingStatus(status.status)
          if (status.status === 'ready' || status.status === 'failed') {
            clearInterval(interval)
          }
        } catch { /* continue polling */ }
      }, 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function copyPasscode() {
    if (!event) return
    navigator.clipboard.writeText(event.passcode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen bg-black">
      <div className="mx-auto max-w-2xl px-4 py-16 md:py-24">
        <a href="/" className="inline-block text-xs sm:text-sm mb-8 transition-colors" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
          &larr; Back to home
        </a>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-8" style={{ color: '#E1E0CC' }}>
          Organizer Dashboard
        </h1>

        {error && (
          <div className="mb-6 rounded-xl bg-red-900/30 border border-red-800/50 px-4 py-3">
            <p className="text-xs sm:text-sm text-red-400">{error}</p>
          </div>
        )}

        {!event ? (
          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <label className="block text-xs sm:text-sm mb-1.5" style={{ color: 'rgba(225, 224, 204, 0.7)' }}>
                Event Name
              </label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                placeholder="e.g. Tech Conference 2026"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                required
                style={{ color: '#E1E0CC' }}
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm mb-1.5" style={{ color: 'rgba(225, 224, 204, 0.7)' }}>
                Your Email
              </label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs sm:text-sm placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                style={{ color: '#E1E0CC' }}
                type="email"
                placeholder="sarah@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm mb-1.5" style={{ color: 'rgba(225, 224, 204, 0.7)' }}>
                Your Name
              </label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs sm:text-sm placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                style={{ color: '#E1E0CC' }}
                placeholder="Sarah Johnson"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all hover:gap-3"
              style={{ backgroundColor: '#DEDBC8', color: '#000' }}
            >
              Create Event
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#101010] p-6">
              <h2 className="text-lg sm:text-xl font-medium mb-3" style={{ color: '#E1E0CC' }}>
                {eventName}
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-xs sm:text-sm" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
                    Passcode
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base sm:text-lg tracking-widest font-bold" style={{ color: '#E1E0CC' }}>
                      {event.passcode}
                    </span>
                    <button onClick={copyPasscode} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" style={{ color: 'rgba(225, 224, 204, 0.6)' }} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-xs sm:text-sm" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
                    Share Link
                  </span>
                  <a
                    href={event.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs sm:text-sm transition-colors hover:underline"
                    style={{ color: '#DEDBC8' }}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Open
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#101010] p-6">
              <h2 className="text-sm sm:text-base font-medium mb-4" style={{ color: '#E1E0CC' }}>
                Upload Photos
              </h2>

              <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/5 px-6 py-8 cursor-pointer hover:border-primary/30 transition-colors">
                <Upload className="w-6 h-6 mb-2" style={{ color: 'rgba(225, 224, 204, 0.5)' }} />
                <span className="text-xs sm:text-sm" style={{ color: 'rgba(225, 224, 204, 0.5)' }}>
                  {photos.length > 0 ? `${photos.length} photos selected` : 'Click to select photos'}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setPhotos(Array.from(e.target.files || []))}
                  className="hidden"
                />
              </label>

              {photos.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="group mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all hover:gap-3 disabled:opacity-50"
                  style={{ backgroundColor: '#DEDBC8', color: '#000' }}
                >
                  {uploading ? (
                    <><Loader className="w-4 h-4 animate-spin" /> {uploadStatus}</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Upload & Process</>
                  )}
                </button>
              )}

              {uploadStatus && !uploading && (
                <p className="mt-3 text-xs sm:text-sm" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
                  {uploadStatus}
                </p>
              )}

              {processingStatus && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${processingStatus === 'ready' ? 'bg-green-400' : processingStatus === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
                  <span className="text-xs sm:text-sm" style={{ color: 'rgba(225, 224, 204, 0.6)' }}>
                    {processingStatus === 'ready' ? 'Processing complete' : processingStatus === 'failed' ? 'Processing failed' : 'Processing...'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

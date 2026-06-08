'use client'

import { useState } from 'react'

export default function OrganizerPage() {
  const [eventName, setEventName] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [event, setEvent] = useState<Record<string, unknown> | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: eventName,
        organizerEmail: email,
        organizerName: name,
      }),
    })
    const data = await res.json()
    setEvent(data)
  }

  async function handleUpload() {
    if (!event || photos.length === 0) return
    setUploading(true)
    setStatus('Requesting upload URLs...')

    const uploadRes = await fetch(`/api/events/${event.eventId}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photos: photos.map((f) => ({
          filename: f.name,
          size: f.size,
          type: f.type,
        })),
      }),
    })
    const { uploadUrls } = await uploadRes.json()

    setStatus('Uploading photos...')
    await Promise.all(
      (uploadUrls as Array<Record<string, unknown>>).map((u, i) =>
        fetch(u.uploadUrl as string, {
          method: 'PUT',
          body: photos[i],
          headers: { 'Content-Type': photos[i].type },
        }),
      ),
    )

    setStatus('Confirming upload...')
    await fetch(`/api/events/${event.eventId}/upload/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoIds: (uploadUrls as Array<Record<string, unknown>>).map((u) => u.photoId),
      }),
    })

    setUploading(false)
    setStatus('Processing started. Check back soon.')
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Organizer Dashboard</h1>

      {!event ? (
        <form onSubmit={createEvent} className="space-y-4">
          <input
            className="w-full border rounded-lg p-3"
            placeholder="Event Name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-lg p-3"
            type="email"
            placeholder="Your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-lg p-3"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-black text-white p-3 font-medium hover:bg-gray-800"
          >
            Create Event
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-semibold mb-2">{eventName}</h2>
            <p className="text-sm text-gray-500">
              Passcode:{' '}
              <span className="font-mono font-bold text-black">{event.passcode as string}</span>
            </p>
            <p className="text-sm text-gray-500">
              Share: <span className="text-blue-600">{event.shareUrl as string}</span>
            </p>
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-semibold mb-4">Upload Photos</h2>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setPhotos(Array.from(e.target.files || []))}
              className="mb-4"
            />
            <p className="text-sm text-gray-500 mb-4">{photos.length} photos selected</p>
            <button
              onClick={handleUpload}
              disabled={uploading || photos.length === 0}
              className="rounded-lg bg-black text-white px-6 py-3 font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload & Process'}
            </button>
            {status && <p className="mt-4 text-sm text-gray-600">{status}</p>}
          </div>
        </div>
      )}
    </main>
  )
}

import { createHash, randomUUID } from 'node:crypto'
import { ConvexHttpClient } from '../../apps/api/node_modules/convex/dist/esm/browser/index.js'
import { api } from '../../apps/api/convex/_generated/api.js'

const url = process.env.CONVEX_URL
const serviceSecret = process.env.CONVEX_SERVICE_SECRET
if (!url || !serviceSecret) throw new Error('Convex fixture environment is required')

const client = new ConvexHttpClient(url, { logger: false })
const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
const eventPublicId = `evt_${suffix}`
const otherEventPublicId = `evt_${randomUUID().replaceAll('-', '').slice(0, 8)}`
const organizerTokenHash = createHash('sha256').update('fixture-organizer-token').digest('hex')
const now = Math.floor(Date.now() / 1000)
const firstPasscode = String(100000 + (Number.parseInt(suffix.slice(0, 6), 16) % 899999))
const secondPasscode = String(Number(firstPasscode) + 1)
let stage = 'setup'

function embedding(score) {
  return [score, Math.sqrt(1 - score * score), ...Array(510).fill(0)]
}

function eventArgs(publicId, passcode, inviteToken) {
  return {
    serviceSecret,
    publicId,
    name: 'Synthetic Vector Fixture',
    passcode,
    inviteToken,
    organizerTokenHash,
    createdAt: now,
    expiresAt: now + 3600,
    organizerEmail: 'fixture@example.invalid',
    organizerName: 'Fixture',
    maxPhotos: 1000,
    tier: 'pro',
    matchThreshold: 0.6,
    clusteringEps: 0.4,
  }
}

function photo(publicId, index) {
  const photoId = `photo_${index.toString(16).padStart(8, '0')}`
  return {
    publicId: photoId,
    originalKey: `events/${publicId}/${photoId}.jpg`,
    fileSize: 1024,
  }
}

function resultPhoto(publicId, source) {
  return {
    publicId: source.publicId,
    thumbnail200Key: `events/${publicId}/thumbs/200/${source.publicId}.jpg`,
    thumbnail800Key: `events/${publicId}/thumbs/800/${source.publicId}.jpg`,
    width: 1200,
    height: 800,
  }
}

async function seedEvent(publicId, passcode, inviteToken, photos, scores, jobPublicId) {
  stage = 'create event'
  await client.mutation(api.events.create, eventArgs(publicId, passcode, inviteToken))
  stage = 'confirm photos'
  await client.mutation(api.uploads.confirm, {
    serviceSecret,
    eventPublicId: publicId,
    organizerTokenHash,
    jobPublicId,
    now,
    photos,
  })
  stage = 'accept job'
  await client.mutation(api.processing.markAccepted, {
    serviceSecret,
    eventPublicId: publicId,
    jobPublicId,
    attempt: 1,
    modalJobId: `modal_${jobPublicId}`,
    now,
  })

  for (let offset = 0; offset < photos.length; offset += 25) {
    stage = `persist face batch ${offset / 25 + 1}`
    const batch = photos.slice(offset, offset + 25)
    await client.mutation(api.processing.persistResults, {
      serviceSecret,
      eventPublicId: publicId,
      jobPublicId,
      attempt: 1,
      final: false,
      now,
      photos: batch.map((item) => resultPhoto(publicId, item)),
      faces: batch.map((item, batchIndex) => ({
        publicId: `face_${publicId.slice(4)}_${offset + batchIndex}`,
        photoPublicId: item.publicId,
        bbox: { x: 1, y: 2, width: 3, height: 4 },
        confidence: 0.99,
        embedding: embedding(scores[offset + batchIndex]),
      })),
    })
  }
  stage = 'complete job'
  await client.mutation(api.processing.persistResults, {
    serviceSecret,
    eventPublicId: publicId,
    jobPublicId,
    attempt: 1,
    final: true,
    now,
    photos: photos.map((item) => resultPhoto(publicId, item)),
    faces: [],
  })
}

try {
  const photos = Array.from({ length: 260 }, (_, index) => photo(eventPublicId, index))
  const scores = photos.map((_, index) =>
    index < 100 ? 1 - index * 0.0005 : 0.7 - (index - 100) * 0.0005,
  )
  await seedEvent(eventPublicId, firstPasscode, suffix.repeat(4), photos, scores, `job_${suffix}`)
  const otherPhoto = photo(otherEventPublicId, 9999)
  await seedEvent(
    otherEventPublicId,
    secondPasscode,
    otherEventPublicId.slice(4).repeat(4),
    [otherPhoto],
    [1],
    `job_${otherEventPublicId.slice(4)}`,
  )

  const expected = new Set(photos.slice(0, 100).map(({ publicId }) => publicId))
  let result
  for (let attempt = 0; attempt < 10; attempt += 1) {
    stage = `vector search ${attempt + 1}`
    result = await client.action(api.matches.search, {
      serviceSecret,
      eventPublicId,
      passcode: firstPasscode,
      now: Math.floor(Date.now() / 1000),
      embedding: embedding(1),
    })
    if (result.matches.length === 100) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const actual = new Set(result.matches.map(({ photoId }) => photoId))
  stage = 'membership check'
  if (
    result.matches.length !== 100 ||
    [...expected].some((photoId) => !actual.has(photoId)) ||
    actual.has(otherPhoto.publicId)
  ) {
    throw new Error('Vector membership or event isolation regressed')
  }
  console.log(JSON.stringify({ matches: result.matches.length, eventIsolation: true }))
} catch (error) {
  console.error(`Local Convex vector verification failed during ${stage}`)
  if (stage === 'create event' && error instanceof Error) {
    console.error(
      error.message
        .replaceAll(serviceSecret, '[redacted]')
        .replaceAll(organizerTokenHash, '[redacted]')
        .slice(0, 500),
    )
  }
  process.exitCode = 1
}

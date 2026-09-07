# Convex Data Model

The schema is implemented in `apps/api/convex/schema.ts`. Public IDs are
stored alongside Convex references; `_id` values never cross the Worker
boundary.

## Events

`publicId`, name, passcode, opaque invite token, organizer token hash, created
and expiry timestamps, processing/deletion status, photo and face counts,
organizer metadata, `maxPhotos`, tier, match threshold, clustering epsilon,
and retryable deletion state.

Indexes: public ID, passcode, invite token, expiry, and status.

## Photos

`publicId`, event reference, original R2 key, optional 200px/800px thumbnail
keys, upload timestamp, dimensions, file size, processing state, and face
count. Indexes support event listing and event/public-ID lookup.

## Faces

`publicId`, event and photo references, bounding box, confidence, optional
cluster ID and landmarks, and a finite L2-normalized 512-number embedding.
Indexes support event/photo lookup. The vector index has 512 dimensions and
requires `eventId` equality filtering, so a face from one event cannot match a
different event.

## Match sessions

Event reference, matched count, threshold, duration, and timestamp. Raw user
IP addresses and biometric vectors are not retained.

## Processing jobs

External job ID, event and photo references, pending/accepted/processing/
complete/failed/cancelled state, Modal job ID, attempts, sanitized error, and
timestamps. Upload confirmation creates or reuses exactly one job for the
event submission.

## Access boundary

Every public Convex function validates its arguments and Worker service
secret. Organizer mutations additionally validate the signed-off organizer
management token hash. Modal result persistence is available only through the
authenticated Worker callback.

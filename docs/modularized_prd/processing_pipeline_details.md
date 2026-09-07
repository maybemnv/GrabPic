# Modal Processing Pipeline

The implementation lives in `ml/processor.py`. Modal performs ML and R2
thumbnail work only; it has no Convex credentials.

## Accepted job

The Worker sends stable event/photo/R2 keys to the Modal processing endpoint.
Modal explicitly accepts the request and returns a real job identifier. The
Worker persists that identifier in Convex before returning `202 Processing`.
An unaccepted request remains a retryable Convex job and does not make the
event ready.

## GPU work

For each original in R2, Modal runs the pinned `InceptionResnetV1` vggface2
model with the existing detection confidence threshold, generates normalized
512-dimensional embeddings, clusters faces with the per-event DBSCAN config,
and writes deterministic 200px and 800px JPEG thumbnails to R2.

## Callback

Modal posts authenticated batches to the private Worker callback. Each batch
contains no more than 25 faces and includes event/job IDs, photo metadata, and
face boxes, confidence, cluster/landmark metadata, and embeddings. The Worker
rejects wrong-event, stale-job, malformed, non-finite, non-normalized, and
wrong-dimension vectors before calling the Convex persistence mutation.

Callback bodies and embeddings are never logged or attached to Sentry. A
final callback marks the job complete and the event ready only after all photo
results have been persisted. Duplicate callbacks are idempotent. Callbacks
after deletion begins are rejected.

## Selfie path

The Worker sends attendee selfie data to the same pinned Modal embedding
endpoint. It then performs the event-filtered Convex vector search and signs
the matching R2 assets for the response.

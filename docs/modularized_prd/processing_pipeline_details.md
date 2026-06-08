# FaceFind - Processing Pipeline Details

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Background Job Architecture (Modal.com)

```python
# /ml/main.py
import modal
from typing import List, Dict
import numpy as np
from sklearn.cluster import DBSCAN

stub = modal.Stub(
    "facefind-processor",
    secrets=[modal.Secret.from_name("turso-credentials")]
)

# Pre-download model weights in image build
image = (
    modal.Image.debian_slim()
    .pip_install(
        "facenet-pytorch",
        "torch",
        "torchvision",
        "pillow",
        "scikit-learn",
        "requests",
        "libsql-client"
    )
    .run_commands(
        "python -c 'from facenet_pytorch import MTCNN, InceptionResnetV1; MTCNN(); InceptionResnetV1(pretrained=\"vggface2\")'"
    )
)

@stub.function(
    image=image,
    gpu="T4",
    timeout=600,  # 10 minutes max
    memory=4096   # 4GB RAM
)
def process_event(event_id: str, photo_urls: List[str]) -> Dict:
    """
    Main processing function for an event
    Returns: {
        'faces_detected': int,
        'clusters_found': int,
        'processing_time': float
    }
    """
    import time
    start = time.time()

    # Initialize models (cached after first cold start)
    mtcnn = MTCNN(keep_all=True, device='cuda', post_process=False)
    resnet = InceptionResnetV1(pretrained='vggface2').eval().to('cuda')

    all_faces = []

    # Process each photo
    for photo_url in photo_urls:
        photo_id = extract_photo_id(photo_url)
        img = download_and_preprocess(photo_url)

        # Detect faces
        boxes, probs, landmarks = mtcnn.detect(img, landmarks=True)

        if boxes is None:
            continue

        # Extract aligned face tensors
        face_tensors = mtcnn(img)

        # Generate embeddings
        with torch.no_grad():
            embeddings = resnet(face_tensors).cpu().numpy()

        # Store face data
        for i, (box, prob, landmark, embedding) in enumerate(
            zip(boxes, probs, landmarks, embeddings)
        ):
            face_id = f"{photo_id}_face_{i}"
            all_faces.append({
                'id': face_id,
                'photo_id': photo_id,
                'bbox': box.tolist(),
                'confidence': float(prob),
                'landmarks': landmark.tolist(),
                'embedding': embedding
            })

    # Cluster similar faces (same person)
    embeddings_matrix = np.array([f['embedding'] for f in all_faces])
    clusters = cluster_faces(embeddings_matrix)

    # Assign cluster IDs
    for face, cluster_id in zip(all_faces, clusters):
        face['cluster_id'] = f"cluster_{cluster_id}" if cluster_id != -1 else None

    # Store in database
    store_faces_in_db(event_id, all_faces)

    processing_time = time.time() - start

    return {
        'faces_detected': len(all_faces),
        'clusters_found': len(set(clusters)) - (1 if -1 in clusters else 0),
        'processing_time': processing_time
    }

def cluster_faces(embeddings: np.ndarray, eps=0.4, min_samples=2) -> np.ndarray:
    """
    Cluster face embeddings using DBSCAN
    - eps: max distance for same cluster (lower = stricter)
    - min_samples: min faces to form cluster
    Returns: cluster labels (-1 = noise/unclustered)
    """
    clustering = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric='cosine'
    )
    return clustering.fit_predict(embeddings)

def store_faces_in_db(event_id: str, faces: List[Dict]):
    """Store detected faces and embeddings in Turso"""
    from libsql_client import create_client

    db = create_client(
        url=os.environ['TURSO_URL'],
        auth_token=os.environ['TURSO_TOKEN']
    )

    # Batch insert faces
    face_records = [
        (f['id'], f['photo_id'], json.dumps(f['bbox']),
         f['confidence'], f['cluster_id'])
        for f in faces
    ]

    db.batch([
        "INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)"
        for _ in face_records
    ], face_records)

    # Batch insert embeddings
    embedding_records = [
        (f['id'], f['id'], f['embedding'].tobytes(), int(time.time()))
        for f in faces
    ]

    db.batch([
        "INSERT INTO face_embeddings (id, face_id, embedding, created_at) VALUES (?, ?, ?, ?)"
        for _ in embedding_records
    ], embedding_records)

    # Update event status
    db.execute(
        "UPDATE events SET status = 'ready', face_count = ? WHERE id = ?",
        (len(faces), event_id)
    )
```

## Webhook Trigger (Cloudflare Worker)

```typescript
// /api/webhooks/process-event.ts
export async function onUploadComplete(req: Request) {
  const { eventId, photoIds } = await req.json()

  // Get photo URLs from R2
  const photoUrls = photoIds.map(id =>
    `https://r2.facefind.app/events/${eventId}/${id}.jpg`
  )

  // Trigger Modal function
  const modalUrl = "https://modal.com/facefind-processor/process-event"
  const response = await fetch(modalUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.MODAL_TOKEN}`
    },
    body: JSON.stringify({
      event_id: eventId,
      photo_urls: photoUrls
    })
  })

  // Update event status to "processing"
  await db.execute(
    "UPDATE events SET status = 'processing' WHERE id = ?",
    [eventId]
  )

  return new Response(JSON.stringify({ jobId: response.job_id }), {
    status: 202
  })
}
```
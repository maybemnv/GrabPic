import base64
import hmac
import json
import os
import threading
import time
from io import BytesIO
from typing import Any, Dict, Iterator, List, Optional, Tuple
from urllib import request as urllib_request

import numpy as np
from sklearn.cluster import DBSCAN


SELFIE_MAX_SIDE = 1024


def normalize_embedding(values: Any) -> np.ndarray:
    embedding = np.asarray(values, dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if embedding.ndim != 1 or not np.isfinite(norm) or norm == 0:
        raise ValueError("embedding must be a non-zero finite vector")
    return embedding / norm


def timing_safe_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def parse_processing_request(
    payload: Dict[str, Any],
) -> Tuple[str, str, int, List[Dict[str, str]]]:
    job_id = payload.get("job_id")
    event_id = payload.get("event_id")
    attempt = payload.get("attempt")
    photos = payload.get("photos")
    if (
        not isinstance(job_id, str)
        or not job_id
        or not isinstance(event_id, str)
        or not event_id
        or not isinstance(attempt, int)
        or isinstance(attempt, bool)
        or attempt < 1
        or not isinstance(photos, list)
        or not 1 <= len(photos) <= 1000
    ):
        raise ValueError("job_id, event_id, and 1-1000 photos are required")

    parsed: List[Dict[str, str]] = []
    prefix = f"events/{event_id}/"
    for photo in photos:
        if not isinstance(photo, dict):
            raise ValueError("each photo must be an object")
        photo_id = photo.get("photo_id")
        r2_key = photo.get("r2_key")
        if (
            not isinstance(photo_id, str)
            or not photo_id
            or not isinstance(r2_key, str)
            or not r2_key.startswith(prefix)
            or ".." in r2_key
        ):
            raise ValueError("photo references must be scoped to the event")
        parsed.append({"photo_id": photo_id, "r2_key": r2_key})
    return job_id, event_id, attempt, parsed


def thumbnail_keys(event_id: str, photo_id: str) -> Tuple[str, str]:
    return (
        f"events/{event_id}/thumbs/200/{photo_id}.jpg",
        f"events/{event_id}/thumbs/800/{photo_id}.jpg",
    )


def build_callback_payloads(
    job_id: str,
    event_id: str,
    attempt: int,
    photos: List[Dict[str, Any]],
    faces: List[Dict[str, Any]],
    skipped_photo_ids: Optional[List[str]] = None,
) -> Iterator[Dict[str, Any]]:
    # A generator so only one 25-face batch of Python-float embeddings exists at a
    # time; the full set stays as float32 arrays in `faces`.
    for offset in range(0, len(faces), 25):
        batch = [
            {**face, "embedding": np.asarray(face["embedding"]).tolist()}
            for face in faces[offset : offset + 25]
        ]
        photo_ids = {face["photoId"] for face in batch}
        yield {
            "status": "success",
            "jobId": job_id,
            "eventId": event_id,
            "attempt": attempt,
            "final": False,
            "photos": [photo for photo in photos if photo["photoId"] in photo_ids],
            "faces": batch,
        }
    yield {
        "status": "success",
        "jobId": job_id,
        "eventId": event_id,
        "attempt": attempt,
        "final": True,
        "photos": photos,
        "faces": [],
        **({"skippedPhotoIds": skipped_photo_ids} if skipped_photo_ids else {}),
    }


def send_callback(payload: Dict[str, Any]) -> None:
    callback_url = os.environ.get("WORKER_CALLBACK_URL")
    callback_token = os.environ.get("PROCESSOR_CALLBACK_TOKEN")
    if not callback_url or not callback_token:
        raise ValueError("Worker callback configuration is required")
    callback_request = urllib_request.Request(
        callback_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {callback_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(callback_request, timeout=30) as response:
            if not 200 <= response.status < 300:
                raise RuntimeError("Worker rejected processor callback")
    except Exception as error:
        raise CallbackDeliveryFailed("Processor callback was not acknowledged") from error


class CallbackDeliveryFailed(Exception):
    pass


def object_store():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


_models = None
# Batch jobs and selfie requests share one model set; without the lock a startup
# preload racing the first request would load the weights twice on a 1 GB VM.
_models_lock = threading.Lock()


def load_models():
    global _models
    with _models_lock:
        if _models is not None:
            return _models

        import torch
        from facenet_pytorch import MTCNN, InceptionResnetV1

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        detector = MTCNN(keep_all=True, device=device, post_process=True)
        resnet = InceptionResnetV1(pretrained="vggface2").eval().to(device)
        _models = detector, resnet, device
        return _models


def embed_faces(image, detector, resnet, device, one_face: bool = False):
    boxes, probabilities = detector.detect(image, landmarks=False)
    if boxes is None or probabilities is None:
        return []
    import torch

    tensors = detector.extract(image, boxes, None)
    if tensors is None:
        return []
    if tensors.ndim == 3:
        tensors = tensors.unsqueeze(0)

    candidates = [
        index
        for index, probability in enumerate(probabilities)
        if probability is not None and probability >= 0.9 and index < len(tensors)
    ]
    if one_face and candidates:
        candidates = [max(candidates, key=lambda index: probabilities[index])]
    if not candidates:
        return []

    with torch.no_grad():
        embeddings = torch.nn.functional.normalize(
            resnet(tensors[candidates].to(device)), p=2, dim=1
        )

    return [
        (boxes[index], float(probabilities[index]), embeddings[position].cpu().numpy())
        for position, index in enumerate(candidates)
    ]


def image_from_data_url(data_url: str):
    from PIL import Image

    try:
        _, encoded = data_url.split(",", 1)
        image = Image.open(BytesIO(base64.b64decode(encoded, validate=True))).convert("RGB")
        # Phone selfies are 12 MP; MTCNN's pyramid on that is far too slow for the
        # 1/8 OCPU VM, and the face is only resized to 160px for FaceNet anyway.
        image.thumbnail((SELFIE_MAX_SIDE, SELFIE_MAX_SIDE))
        return image
    except Exception as error:
        raise ValueError("invalid selfie image") from error


def image_bytes(image, size: int) -> bytes:
    image = image.copy()
    image.thumbnail((size, size))
    output = BytesIO()
    image.save(output, format="JPEG", quality=85, optimize=True)
    return output.getvalue()


class ProcessingCancelled(Exception):
    pass


def process_event_job(payload: Dict[str, Any], cancelled=lambda: False) -> Dict[str, Any]:
    job_id, event_id, attempt, photos = parse_processing_request(payload)
    start = time.time()
    all_faces: List[Dict[str, Any]] = []
    processed_photos: List[Dict[str, Any]] = []
    skipped_photo_ids: List[str] = []

    try:
        store = object_store()
        detector, resnet, device = load_models()
        for photo in photos:
            if cancelled():
                raise ProcessingCancelled()
            source = store.get_object(
                Bucket=os.environ["R2_BUCKET"], Key=photo["r2_key"]
            )["Body"].read()
            from PIL import Image

            try:
                image = Image.open(BytesIO(source)).convert("RGB")
            except Exception:
                # One undecodable original must not fail (and endlessly retry) a
                # 1000-photo event. Storage and detection errors still fail the job.
                skipped_photo_ids.append(photo["photo_id"])
                continue
            width, height = image.size
            thumb_200, thumb_800 = thumbnail_keys(event_id, photo["photo_id"])
            store.put_object(
                Bucket=os.environ["R2_BUCKET"],
                Key=thumb_200,
                Body=image_bytes(image, 200),
                ContentType="image/jpeg",
            )
            store.put_object(
                Bucket=os.environ["R2_BUCKET"],
                Key=thumb_800,
                Body=image_bytes(image, 800),
                ContentType="image/jpeg",
            )
            processed_photos.append(
                {
                    "photoId": photo["photo_id"],
                    "thumbnail200Key": thumb_200,
                    "thumbnail800Key": thumb_800,
                    "width": width,
                    "height": height,
                }
            )

            for index, (box, confidence, embedding) in enumerate(
                embed_faces(image, detector, resnet, device)
            ):
                all_faces.append(
                    {
                        "faceId": f"face_{photo['photo_id']}_{index}",
                        "photoId": photo["photo_id"],
                        "bbox": {
                            "x": float(box[0]),
                            "y": float(box[1]),
                            "width": float(box[2] - box[0]),
                            "height": float(box[3] - box[1]),
                        },
                        "confidence": confidence,
                        "embedding": normalize_embedding(embedding),
                    }
                )

        if not processed_photos:
            raise ValueError("no photo could be decoded")
        clusters = (
            cluster_faces(np.array([face["embedding"] for face in all_faces]))
            if all_faces
            else np.array([])
        )
        for face, cluster_id in zip(all_faces, clusters):
            face["clusterId"] = f"cluster_{cluster_id}" if cluster_id != -1 else None
        cluster_count = (
            len(set(clusters)) - (1 if -1 in clusters else 0) if all_faces else 0
        )
        processing_time = time.time() - start
        if cancelled():
            raise ProcessingCancelled()
        for callback in build_callback_payloads(
            job_id,
            event_id,
            attempt,
            processed_photos,
            all_faces,
            skipped_photo_ids,
        ):
            send_callback(callback)
        return {
            "faces_detected": len(all_faces),
            "clusters_found": cluster_count,
            "processing_time": processing_time,
        }
    except (ProcessingCancelled, CallbackDeliveryFailed):
        raise
    except Exception:
        send_callback(
            {
                "status": "failed",
                "jobId": job_id,
                "eventId": event_id,
                "attempt": attempt,
            }
        )
        raise


def embed_selfie(payload: Dict[str, Any]) -> Dict[str, Any]:
    data_url = payload.get("selfie_data")
    if not isinstance(data_url, str):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="selfie_data is required")

    try:
        selfie_image = image_from_data_url(data_url)
    except ValueError as error:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="invalid selfie image") from error

    detector, resnet, device = load_models()
    faces = embed_faces(selfie_image, detector, resnet, device, one_face=True)
    if not faces:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="no face detected")
    return {"embedding": normalize_embedding(faces[0][2]).tolist()}


def cluster_faces(embeddings: np.ndarray) -> np.ndarray:
    return DBSCAN(eps=0.4, min_samples=2, metric="cosine").fit_predict(embeddings)

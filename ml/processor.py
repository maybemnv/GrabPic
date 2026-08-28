import base64
import json
import os
import time
from io import BytesIO
from typing import Any, Dict, List, Tuple
from urllib import request as urllib_request

from fastapi import Request
import modal
import numpy as np
from sklearn.cluster import DBSCAN

app = modal.App("grabpic-processor")

image = (
    modal.Image.debian_slim()
    .pip_install(
        "boto3",
        "facenet-pytorch",
        "fastapi",
        "numpy",
        "pillow",
        "scikit-learn",
        "torch",
        "torchvision",
    )
    .run_commands(
        'python -c "from facenet_pytorch import MTCNN, InceptionResnetV1; MTCNN(); InceptionResnetV1(pretrained=\\"vggface2\\")"'
    )
)

auth_secrets = [modal.Secret.from_name("grabpic-modal-auth")]
processing_secrets = [
    modal.Secret.from_name("grabpic-r2"),
    modal.Secret.from_name("grabpic-modal-auth"),
]


def normalize_embedding(values: Any) -> np.ndarray:
    embedding = np.asarray(values, dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if embedding.ndim != 1 or not np.isfinite(norm) or norm == 0:
        raise ValueError("embedding must be a non-zero finite vector")
    return embedding / norm


def parse_processing_request(
    payload: Dict[str, Any],
) -> Tuple[str, str, List[Dict[str, str]]]:
    job_id = payload.get("job_id")
    event_id = payload.get("event_id")
    photos = payload.get("photos")
    if (
        not isinstance(job_id, str)
        or not job_id
        or not isinstance(event_id, str)
        or not event_id
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
    return job_id, event_id, parsed


def thumbnail_keys(event_id: str, photo_id: str) -> Tuple[str, str]:
    return (
        f"events/{event_id}/thumbs/200/{photo_id}.jpg",
        f"events/{event_id}/thumbs/800/{photo_id}.jpg",
    )


def accepted_job_id(call: Any) -> str:
    job_id = getattr(call, "object_id", None)
    if not isinstance(job_id, str) or not job_id or len(job_id) > 200:
        raise ValueError("Modal did not return a real job identifier")
    return job_id


def build_callback_payloads(
    job_id: str,
    event_id: str,
    photos: List[Dict[str, Any]],
    faces: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    payloads: List[Dict[str, Any]] = []
    for offset in range(0, len(faces), 25):
        batch = faces[offset : offset + 25]
        photo_ids = {face["photoId"] for face in batch}
        payloads.append(
            {
                "status": "success",
                "jobId": job_id,
                "eventId": event_id,
                "final": False,
                "photos": [photo for photo in photos if photo["photoId"] in photo_ids],
                "faces": batch,
            }
        )
    payloads.append(
        {
            "status": "success",
            "jobId": job_id,
            "eventId": event_id,
            "final": True,
            "photos": photos,
            "faces": [],
        }
    )
    return payloads


def send_callback(payload: Dict[str, Any]) -> None:
    callback_url = os.environ.get("WORKER_CALLBACK_URL")
    callback_token = os.environ.get("MODAL_CALLBACK_TOKEN")
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
    with urllib_request.urlopen(callback_request, timeout=30) as response:
        if not 200 <= response.status < 300:
            raise RuntimeError("Worker rejected Modal callback")


def object_store():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def load_models():
    import torch
    from facenet_pytorch import MTCNN, InceptionResnetV1

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    detector = MTCNN(keep_all=True, device=device, post_process=True)
    resnet = InceptionResnetV1(pretrained="vggface2").eval().to(device)
    return detector, resnet, device


def embed_faces(image, detector, resnet, device, one_face: bool = False):
    import torch

    boxes, probabilities = detector.detect(image, landmarks=False)
    tensors = detector(image)
    if boxes is None or probabilities is None or tensors is None:
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
        return Image.open(BytesIO(base64.b64decode(encoded, validate=True))).convert(
            "RGB"
        )
    except Exception as error:
        raise ValueError("invalid selfie image") from error


def image_bytes(image, size: int) -> bytes:
    image = image.copy()
    image.thumbnail((size, size))
    output = BytesIO()
    image.save(output, format="JPEG", quality=85, optimize=True)
    return output.getvalue()


def require_auth(request) -> None:
    expected = os.environ.get("MODAL_TOKEN")
    if not expected or request.headers.get("authorization") != f"Bearer {expected}":
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="unauthorized")


@app.function(
    image=image, gpu="T4", timeout=600, memory=4096, secrets=processing_secrets
)
def process_event_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    job_id, event_id, photos = parse_processing_request(payload)
    store = object_store()
    detector, resnet, device = load_models()
    start = time.time()
    all_faces: List[Dict[str, Any]] = []
    processed_photos: List[Dict[str, Any]] = []

    try:
        for photo in photos:
            source = store.get_object(
                Bucket=os.environ["R2_BUCKET"], Key=photo["r2_key"]
            )["Body"].read()
            from PIL import Image

            image = Image.open(BytesIO(source)).convert("RGB")
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
                        "embedding": normalize_embedding(embedding).tolist(),
                    }
                )

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
        for callback in build_callback_payloads(
            job_id,
            event_id,
            processed_photos,
            all_faces,
        ):
            send_callback(callback)
        return {
            "faces_detected": len(all_faces),
            "clusters_found": cluster_count,
            "processing_time": processing_time,
        }
    except Exception:
        send_callback({"status": "failed", "jobId": job_id, "eventId": event_id})
        raise


@app.function(image=image, timeout=30, secrets=auth_secrets)
@modal.fastapi_endpoint(method="POST")
def process_event(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    require_auth(request)
    parse_processing_request(payload)
    call = process_event_job.spawn(payload)
    return {"job_id": accepted_job_id(call)}


@app.function(image=image, timeout=30, secrets=auth_secrets)
@modal.fastapi_endpoint(method="POST")
def cancel_processing(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    require_auth(request)
    modal_job_id = payload.get("modal_job_id")
    if not isinstance(modal_job_id, str) or not modal_job_id or len(modal_job_id) > 200:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="modal_job_id is required")
    modal.FunctionCall.from_id(modal_job_id).cancel()
    return {"cancelled": True}


@app.function(
    image=image, gpu="T4", timeout=120, memory=4096, secrets=processing_secrets
)
@modal.fastapi_endpoint(method="POST")
def embed_selfie(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    require_auth(request)
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

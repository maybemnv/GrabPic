import modal
import os
import json
import time
import numpy as np
from typing import List, Dict
from sklearn.cluster import DBSCAN

stub = modal.Stub(
    "grabpic-processor",
    secrets=[modal.Secret.from_name("turso-credentials")]
)

image = (
    modal.Image.debian_slim()
    .pip_install(
        "facenet-pytorch",
        "torch",
        "torchvision",
        "pillow",
        "scikit-learn",
        "requests",
        "libsql-client",
        "numpy",
    )
    .run_commands(
        'python -c "from facenet_pytorch import MTCNN, InceptionResnetV1; MTCNN(); InceptionResnetV1(pretrained=\\\"vggface2\\\")"'
    )
)

@stub.function(
    image=image,
    gpu="T4",
    timeout=600,
    memory=4096,
)
def process_event(event_id: str, photo_urls: List[str]) -> Dict:
    import torch
    from facenet_pytorch import MTCNN, InceptionResnetV1
    from PIL import Image
    import requests
    from io import BytesIO

    start = time.time()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    mtcnn = MTCNN(keep_all=True, device=device, post_process=False)
    resnet = InceptionResnetV1(pretrained="vggface2").eval().to(device)

    all_faces = []

    for photo_url in photo_urls:
        try:
            resp = requests.get(photo_url, timeout=30)
            img = Image.open(BytesIO(resp.content)).convert("RGB")
        except Exception as e:
            continue

        boxes, probs = mtcnn.detect(img, landmarks=False)

        if boxes is None:
            continue

        face_tensors = mtcnn(img)

        if face_tensors is None:
            continue

        if face_tensors.ndim == 3:
            face_tensors = face_tensors.unsqueeze(0)

        with torch.no_grad():
            embeddings = resnet(face_tensors).cpu().numpy()

        photo_id = photo_url.split("/")[-1].replace(".jpg", "")

        for i, (box, prob, embedding) in enumerate(zip(boxes, probs, embeddings)):
            face_id = f"{photo_id}_face_{i}"
            all_faces.append({
                "id": face_id,
                "photo_id": photo_id,
                "bbox": box.tolist(),
                "confidence": float(prob),
                "embedding": embedding,
            })

    if len(all_faces) == 0:
        store_result(event_id, 0, 0, time.time() - start)
        return {"faces_detected": 0, "clusters_found": 0, "processing_time": time.time() - start}

    embeddings_matrix = np.array([f["embedding"] for f in all_faces])
    clusters = cluster_faces(embeddings_matrix)

    for face, cluster_id in zip(all_faces, clusters):
        face["cluster_id"] = f"cluster_{cluster_id}" if cluster_id != -1 else None

    store_faces_in_db(event_id, all_faces)
    store_result(event_id, len(all_faces), len(set(clusters)) - (1 if -1 in clusters else 0), time.time() - start)

    processing_time = time.time() - start

    return {
        "faces_detected": len(all_faces),
        "clusters_found": len(set(clusters)) - (1 if -1 in clusters else 0),
        "processing_time": processing_time,
    }

def cluster_faces(embeddings: np.ndarray, eps=0.4, min_samples=2) -> np.ndarray:
    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
    return clustering.fit_predict(embeddings)

def store_faces_in_db(event_id: str, faces: List[Dict]):
    from libsql_client import create_client

    db = create_client(
        url=os.environ["TURSO_URL"],
        auth_token=os.environ["TURSO_TOKEN"],
    )

    for f in faces:
        db.execute(
            "INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)",
            [f["id"], f["photo_id"], json.dumps(f["bbox"]), f["confidence"], f["cluster_id"]],
        )
        db.execute(
            "INSERT INTO face_embeddings (id, face_id, embedding, created_at) VALUES (?, ?, ?, ?)",
            [f["id"], f["id"], f["embedding"].tobytes(), int(time.time())],
        )

def store_result(event_id: str, face_count: int, cluster_count: int, processing_time: float):
    from libsql_client import create_client

    db = create_client(
        url=os.environ["TURSO_URL"],
        auth_token=os.environ["TURSO_TOKEN"],
    )

    db.execute(
        "UPDATE events SET status = 'ready', face_count = ? WHERE id = ?",
        [face_count, event_id],
    )

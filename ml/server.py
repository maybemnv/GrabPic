"""Single-process, persistent CPU job runner for a small OCI VM."""

import json
import asyncio
import os
import sqlite3
import threading
from contextlib import asynccontextmanager, contextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from processor import (
    CallbackDeliveryFailed,
    ProcessingCancelled,
    embed_selfie,
    load_models,
    parse_processing_request,
    process_event_job,
    timing_safe_equal,
)

_worker_lock = threading.Lock()
# A handful of selfies may wait for the shared inference lock (see processor.py);
# beyond that a flood would pin every threadpool thread, so shed load instead.
_embed_slots = threading.BoundedSemaphore(4)
_wake_event = threading.Event()


@contextmanager
def _connect():
    path = os.environ.get("PROCESSOR_DB_PATH", "/var/lib/grabpic/jobs.sqlite3")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute(
        "CREATE TABLE IF NOT EXISTS jobs ("
        "job_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, attempt INTEGER NOT NULL, "
        "payload TEXT NOT NULL, status TEXT NOT NULL)"
    )
    try:
        with db:
            yield db
    finally:
        db.close()


def get_job(job_id: str) -> dict[str, Any] | None:
    with _connect() as db:
        row = db.execute(
            "SELECT job_id, event_id, attempt, payload, status FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
    return dict(zip(("job_id", "event_id", "attempt", "payload", "status"), row)) if row else None


def _cancelled(job_id: str) -> bool:
    job = get_job(job_id)
    return job is None or job["status"] in ("cancelled", "cancelling")


def _drain() -> None:
    # Only one model instance and one image at a time on the memory-limited VM.
    if not _worker_lock.acquire(blocking=False):
        return
    try:
        while True:
            _wake_event.clear()
            with _connect() as db:
                row = db.execute(
                    "SELECT job_id, payload FROM jobs WHERE status = 'accepted' ORDER BY rowid LIMIT 1"
                ).fetchone()
                if not row:
                    if _wake_event.is_set():
                        continue
                    return
                job_id, payload = row
                db.execute("UPDATE jobs SET status = 'running' WHERE job_id = ?", (job_id,))
            try:
                process_event_job(json.loads(payload), cancelled=lambda: _cancelled(job_id))
            except ProcessingCancelled:
                status = "cancelled"
            except CallbackDeliveryFailed:
                # The Queue has already acknowledged durable acceptance. Retry the
                # same attempt until Convex acknowledges its callback.
                status = "accepted"
            except Exception:
                status = "failed"
            else:
                status = "complete"
            with _connect() as db:
                db.execute(
                    "UPDATE jobs SET status = ? WHERE job_id = ?",
                    ("cancelled" if _cancelled(job_id) else status, job_id),
                )
            if status == "accepted":
                retry = threading.Timer(30, kick_worker)
                retry.daemon = True
                retry.start()
                return
    finally:
        _worker_lock.release()
        # A producer can enqueue after the empty SELECT but before lock release.
        if _wake_event.is_set():
            kick_worker()


def kick_worker() -> None:
    _wake_event.set()
    threading.Thread(target=_drain, name="grabpic-processor", daemon=True).start()


def _preload_models() -> None:
    try:
        load_models()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    required = (
        "PROCESSOR_TOKEN", "PROCESSOR_CALLBACK_TOKEN", "WORKER_CALLBACK_URL",
        "R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    )
    if any(not os.environ.get(name) for name in required):
        raise RuntimeError("Processor configuration is incomplete")
    with _connect() as db:
        db.execute("UPDATE jobs SET status = 'accepted' WHERE status = 'running'")
        db.execute("UPDATE jobs SET status = 'cancelled' WHERE status = 'cancelling'")
    kick_worker()
    # Load FaceNet now so the first selfie does not pay the cold start. Best effort:
    # a failure here resurfaces on the first real request.
    threading.Thread(target=_preload_models, name="grabpic-preload", daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except ValueError as error:
        raise HTTPException(status_code=422, detail="invalid JSON body") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="JSON object required")
    return payload


def require_auth(request: Request) -> None:
    token = os.environ.get("PROCESSOR_TOKEN")
    if not token or not timing_safe_equal(
        request.headers.get("authorization", ""), f"Bearer {token}"
    ):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict[str, str]:
    with _connect() as db:
        db.execute("SELECT 1")
    return {"status": "ok"}


@app.post("/process", status_code=202)
async def process(request: Request) -> dict[str, str]:
    require_auth(request)
    payload = await _json_body(request)
    try:
        job_id, event_id, attempt, _ = parse_processing_request(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    with _connect() as db:
        existing = db.execute(
            "SELECT payload, status FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        if existing:
            old_payload, status = existing
            if status in ("cancelled", "cancelling"):
                raise HTTPException(status_code=409, detail="cancelled job")
            if old_payload != serialized:
                previous = json.loads(old_payload)
                if (
                    status != "failed"
                    or previous.get("event_id") != event_id
                    or previous.get("attempt") != attempt - 1
                    or previous.get("photos") != payload.get("photos")
                ):
                    raise HTTPException(status_code=409, detail="conflicting job")
                db.execute(
                    "UPDATE jobs SET attempt = ?, payload = ?, status = 'accepted' WHERE job_id = ?",
                    (attempt, serialized, job_id),
                )
        else:
            db.execute(
                "INSERT INTO jobs VALUES (?, ?, ?, ?, 'accepted')",
                (job_id, event_id, attempt, serialized),
            )
    kick_worker()
    return {"job_id": job_id}


@app.post("/cancel")
async def cancel(request: Request) -> dict[str, bool]:
    require_auth(request)
    payload = await _json_body(request)
    job_id = payload.get("job_id")
    if not isinstance(job_id, str) or not job_id or len(job_id) > 200:
        raise HTTPException(status_code=422, detail="job_id is required")
    with _connect() as db:
        db.execute(
            "INSERT OR IGNORE INTO jobs VALUES (?, '', 0, '{}', 'cancelled')",
            (job_id,),
        )
        db.execute(
            "UPDATE jobs SET status = CASE WHEN status = 'running' THEN 'cancelling' "
            "ELSE 'cancelled' END WHERE job_id = ? AND status IN ('accepted', 'running')",
            (job_id,),
        )
    # Do not let deletion purge R2 while an in-flight photo can still write thumbnails.
    for _ in range(300):
        if get_job(job_id)["status"] != "cancelling":
            break
        await asyncio.sleep(0.1)
    else:
        raise HTTPException(status_code=503, detail="processor is still stopping")
    # Unknown jobs may still be in the Cloudflare Queue. The tombstone rejects them.
    return {"cancelled": True}


@app.post("/embed")
async def embed(request: Request) -> dict[str, Any]:
    require_auth(request)
    payload = await _json_body(request)
    from starlette.concurrency import run_in_threadpool

    if not _embed_slots.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="processor busy")
    try:
        # Selfies take the shared inference lock with priority over the batch worker,
        # so matching waits for at most one photo instead of a whole event.
        return await run_in_threadpool(embed_selfie, payload)
    finally:
        _embed_slots.release()

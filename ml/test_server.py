import os
import asyncio
import threading
import time
import sys
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException

sys.path.insert(0, "ml")


class ProcessorServerTests(unittest.TestCase):
    def test_readiness_requires_loaded_models_and_database(self):
        from server import health, ready, _preload_models

        with mock.patch("server._models_ready", threading.Event(), create=True):
            self.assertEqual(health(), {"status": "ok"})
            with self.assertRaises(HTTPException) as unavailable:
                ready()
            self.assertEqual(unavailable.exception.status_code, 503)
            with mock.patch("server.load_models", side_effect=RuntimeError("private error")):
                _preload_models()
            with self.assertRaises(HTTPException):
                ready()
            with mock.patch("server.load_models"):
                _preload_models()
            self.assertEqual(ready(), {"status": "ready"})

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.environment = mock.patch.dict(
            os.environ,
            {
                "PROCESSOR_DB_PATH": f"{self.directory.name}/jobs.sqlite3",
                "PROCESSOR_TOKEN": "test-secret",
                "PROCESSOR_CALLBACK_TOKEN": "callback-secret",
                "WORKER_CALLBACK_URL": "https://example.com/internal/processor/results",
                "R2_BUCKET": "test-bucket",
                "R2_ENDPOINT": "https://example.com",
                "R2_ACCESS_KEY_ID": "test-key",
                "R2_SECRET_ACCESS_KEY": "test-secret-key",
            },
        )
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.directory.cleanup()

    def test_acceptance_is_durable_and_idempotent_without_running_inference(self):
        from server import process, get_job

        payload = {
            "job_id": "job_1",
            "event_id": "evt_1",
            "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            with self.assertRaises(HTTPException) as unauthorized:
                asyncio.run(process(_Request(payload, "wrong")))
            self.assertEqual(unauthorized.exception.status_code, 401)
            self.assertEqual(asyncio.run(process(_Request(payload))), {"job_id": "job_1"})
            self.assertEqual(asyncio.run(process(_Request(payload))), {"job_id": "job_1"})
            self.assertEqual(get_job("job_1")["status"], "accepted")
            with self.assertRaises(HTTPException) as conflict:
                asyncio.run(process(_Request({**payload, "attempt": 2})))
            self.assertEqual(conflict.exception.status_code, 409)

    def test_cancellation_survives_restart_and_is_idempotent(self):
        from server import process, cancel, get_job

        payload = {
            "job_id": "job_2",
            "event_id": "evt_1",
            "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
            self.assertEqual(asyncio.run(cancel(_Request({"job_id": "job_2"}))), {"cancelled": True})
            self.assertEqual(get_job("job_2")["status"], "cancelled")
            self.assertEqual(asyncio.run(cancel(_Request({"job_id": "job_2"}))), {"cancelled": True})
            with self.assertRaises(HTTPException) as conflict:
                asyncio.run(process(_Request(payload)))
            self.assertEqual(conflict.exception.status_code, 409)

    def test_cancel_before_queue_delivery_prevents_later_processing(self):
        from server import process, cancel, get_job

        payload = {
            "job_id": "job_late", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            self.assertEqual(asyncio.run(cancel(_Request({"job_id": "job_late"}))), {"cancelled": True})
            self.assertEqual(get_job("job_late")["status"], "cancelled")
            with self.assertRaises(HTTPException) as conflict:
                asyncio.run(process(_Request(payload)))
            self.assertEqual(conflict.exception.status_code, 409)

    def test_failed_job_can_be_retried_with_a_new_attempt(self):
        from server import process, get_job, _connect

        payload = {
            "job_id": "job_retry", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
            with _connect() as db:
                db.execute("UPDATE jobs SET status = 'failed' WHERE job_id = 'job_retry'")
            self.assertEqual(asyncio.run(process(_Request({**payload, "attempt": 2}))), {"job_id": "job_retry"})
            self.assertEqual(get_job("job_retry")["attempt"], 2)
            with self.assertRaises(HTTPException):
                asyncio.run(process(_Request(payload)))

    def test_terminal_cleanup_preserves_replay_guards_and_failed_retry(self):
        from server import process, cleanup_jobs, get_job, _connect

        payload = {
            "job_id": "job_cleanup", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
            with _connect() as db:
                db.execute("UPDATE jobs SET status = 'failed', updated_at = 1")
            self.assertEqual(cleanup_jobs(now=100000), 1)
            self.assertEqual(get_job("job_cleanup")["payload"], "{}")
            self.assertEqual(asyncio.run(process(_Request(payload))), {"job_id": "job_cleanup"})
            with self.assertRaises(HTTPException):
                asyncio.run(process(_Request({**payload, "photos": [{"photo_id": "other", "r2_key": "events/evt_1/other.jpg"}], "attempt": 2})))
            asyncio.run(process(_Request({**payload, "attempt": 2})))
            self.assertEqual(get_job("job_cleanup")["status"], "accepted")
            self.assertEqual(cleanup_jobs(now=200000), 0)

    def test_cleanup_is_bounded_and_complete_replay_stays_idempotent(self):
        import json
        from server import process, cleanup_jobs, get_job, _connect

        payload = {
            "job_id": "job_done", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
            with _connect() as db:
                db.execute("UPDATE jobs SET status = 'complete', updated_at = 1")
                for i in range(100):
                    db.execute("INSERT INTO jobs (job_id, event_id, attempt, payload, status, updated_at) VALUES (?, 'evt_1', 1, ?, 'complete', 2)", (f"old_{i}", json.dumps(payload)))
            self.assertEqual(cleanup_jobs(now=100000), 100)
            self.assertEqual(cleanup_jobs(now=100000), 1)
            self.assertEqual(asyncio.run(process(_Request(payload))), {"job_id": "job_done"})
            self.assertEqual(get_job("job_done")["status"], "complete")
            from server import cancel
            asyncio.run(cancel(_Request({"job_id": "job_done"})))
            with self.assertRaises(HTTPException):
                asyncio.run(process(_Request(payload)))

    def test_periodic_cleanup_retries_transient_database_errors(self):
        import sqlite3
        from server import _cleanup_loop

        async def run_sweeps():
            with mock.patch("server.asyncio.sleep", new=mock.AsyncMock(side_effect=[None, None, asyncio.CancelledError()])), mock.patch("server.cleanup_jobs", side_effect=[sqlite3.OperationalError("busy"), 1]) as cleanup:
                with self.assertRaises(asyncio.CancelledError):
                    await _cleanup_loop()
                self.assertEqual(cleanup.call_count, 2)

        asyncio.run(run_sweeps())

    def test_cleanup_migrates_old_schema_and_keeps_live_jobs(self):
        import json
        import sqlite3
        from server import cleanup_jobs, get_job

        payload = {"event_id": "evt_1", "attempt": 1, "photos": []}
        with sqlite3.connect(os.environ["PROCESSOR_DB_PATH"]) as db:
            db.execute("CREATE TABLE jobs (job_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, attempt INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL)")
            for status in ("complete", "running", "accepted", "cancelling"):
                db.execute("INSERT INTO jobs VALUES (?, 'evt_1', 1, ?, ?)", (status, json.dumps(payload), status))
        self.assertEqual(cleanup_jobs(now=100000), 1)
        self.assertEqual(get_job("complete")["payload"], "{}")
        for status in ("running", "accepted", "cancelling"):
            self.assertNotEqual(get_job(status)["payload"], "{}")

    def test_cancel_erases_payload_without_losing_tombstone(self):
        from server import process, cancel, get_job

        payload = {
            "job_id": "job_private", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
            asyncio.run(cancel(_Request({"job_id": "job_private"})))
            self.assertEqual(get_job("job_private")["payload"], "{}")
            self.assertEqual(get_job("job_private")["event_id"], "")
            with self.assertRaises(HTTPException):
                asyncio.run(process(_Request(payload)))

    def test_selfie_endpoint_works_while_a_batch_job_holds_the_worker(self):
        from server import embed, _worker_lock

        _worker_lock.acquire()
        try:
            with mock.patch("server.embed_selfie", return_value={"embedding": [1.0]}) as model:
                result = asyncio.run(embed(_Request({"selfie_data": "ignored"})))
                self.assertEqual(result, {"embedding": [1.0]})
                model.assert_called_once()
        finally:
            _worker_lock.release()

    def test_selfie_endpoint_sheds_load_when_too_many_selfies_wait(self):
        from server import embed, _embed_slots

        held = 0
        while _embed_slots.acquire(blocking=False):
            held += 1
        try:
            with mock.patch("server.embed_selfie") as model:
                with self.assertRaises(HTTPException) as busy:
                    asyncio.run(embed(_Request({"selfie_data": "ignored"})))
                self.assertEqual(busy.exception.status_code, 503)
                model.assert_not_called()
        finally:
            for _ in range(held):
                _embed_slots.release()

    def test_malformed_bodies_are_rejected_with_422_not_500(self):
        from server import cancel, embed, process

        class BadJson(_Request):
            async def json(self):
                raise ValueError("bad json")

        for handler in (process, cancel, embed):
            for request in (BadJson({}), _Request([1, 2])):
                with self.assertRaises(HTTPException) as bad:
                    asyncio.run(handler(request))
                self.assertEqual(bad.exception.status_code, 422)

    def test_cancellation_waits_for_running_photo_to_stop(self):
        from server import process, cancel, _connect

        payload = {
            "job_id": "job_running", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
            with _connect() as db:
                db.execute("UPDATE jobs SET status = 'running' WHERE job_id = 'job_running'")

            def finish():
                time.sleep(0.05)
                with _connect() as db:
                    db.execute("UPDATE jobs SET status = 'cancelled' WHERE job_id = 'job_running'")

            worker = threading.Thread(target=finish)
            worker.start()
            start = time.monotonic()
            try:
                self.assertEqual(asyncio.run(cancel(_Request({"job_id": "job_running"}))), {"cancelled": True})
                self.assertGreaterEqual(time.monotonic() - start, 0.04)
            finally:
                worker.join()

    def test_restart_finishes_cancellation_after_worker_is_gone(self):
        from server import cancel, get_job, lifespan, process, _connect, app

        payload = {
            "job_id": "job_restart", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"), mock.patch("server.load_models"):
            asyncio.run(process(_Request(payload)))
            with _connect() as db:
                db.execute("UPDATE jobs SET status = 'cancelling' WHERE job_id = 'job_restart'")

            async def restart():
                async with lifespan(app):
                    pass

            asyncio.run(restart())
            self.assertEqual(get_job("job_restart")["status"], "cancelled")
            self.assertEqual(asyncio.run(cancel(_Request({"job_id": "job_restart"}))), {"cancelled": True})

    def test_callback_outage_requeues_durable_job_without_embeddings(self):
        from processor import CallbackDeliveryFailed
        from server import _drain, get_job, process, _wake_event

        payload = {
            "job_id": "job_callback", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        with mock.patch("server.kick_worker"):
            asyncio.run(process(_Request(payload)))
        _wake_event.clear()
        with mock.patch("server.process_event_job", side_effect=CallbackDeliveryFailed()), mock.patch("server.threading.Timer") as timer:
            _drain()
        self.assertEqual(get_job("job_callback")["status"], "accepted")
        timer.assert_called_once()

    def test_new_job_wakes_worker_as_empty_drain_exits(self):
        from server import _drain, _wake_event, process

        payload = {
            "job_id": "job_race", "event_id": "evt_1", "attempt": 1,
            "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
        }
        _wake_event.clear()
        with mock.patch("server._worker_lock") as lock, mock.patch("server.kick_worker") as wake:
            def enqueue_during_release():
                asyncio.run(process(_Request(payload)))
                _wake_event.set()

            lock.acquire.return_value = True
            lock.release.side_effect = enqueue_during_release
            _drain()
            self.assertEqual(wake.call_count, 2)


class _Request:
    def __init__(self, payload, token="test-secret"):
        self.payload = payload
        self.headers = {"authorization": f"Bearer {token}"}

    async def json(self):
        return self.payload


if __name__ == "__main__":
    unittest.main()

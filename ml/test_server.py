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
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.environment = mock.patch.dict(
            os.environ,
            {
                "PROCESSOR_DB_PATH": f"{self.directory.name}/jobs.sqlite3",
                "PROCESSOR_TOKEN": "test-secret",
                "PROCESSOR_CALLBACK_TOKEN": "callback-secret",
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

    def test_selfie_endpoint_rejects_contention_without_loading_models(self):
        from server import embed, _worker_lock

        _worker_lock.acquire()
        try:
            with mock.patch("server.embed_selfie") as model:
                with self.assertRaises(HTTPException) as busy:
                    asyncio.run(embed(_Request({"selfie_data": "ignored"})))
                self.assertEqual(busy.exception.status_code, 503)
                model.assert_not_called()
        finally:
            _worker_lock.release()

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


class _Request:
    def __init__(self, payload, token="test-secret"):
        self.payload = payload
        self.headers = {"authorization": f"Bearer {token}"}

    async def json(self):
        return self.payload


if __name__ == "__main__":
    unittest.main()

import sys
import types
import unittest


class _Decorator:
    def __call__(self, function):
        return function


class _FakeImage:
    @staticmethod
    def debian_slim():
        return _FakeImage()

    def pip_install(self, *args):
        return self

    def run_commands(self, *args):
        return self


class _FakeModal:
    App = lambda *args, **kwargs: types.SimpleNamespace(
        function=lambda **kwargs: _Decorator()
    )
    Image = _FakeImage
    Secret = types.SimpleNamespace(from_name=lambda *args, **kwargs: object())
    fastapi_endpoint = lambda *args, **kwargs: _Decorator()


sys.modules.setdefault("modal", _FakeModal())
sys.path.insert(0, "ml")
from processor import (
    accepted_job_id,
    build_callback_payloads,
    normalize_embedding,
    parse_processing_request,
    thumbnail_keys,
)


class ProcessorContractTests(unittest.TestCase):
    def test_processing_payload_requires_stable_r2_references(self):
        job_id, event_id, photos = parse_processing_request(
            {
                "job_id": "job_1",
                "event_id": "evt_1",
                "photos": [
                    {"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}
                ],
            }
        )
        self.assertEqual(job_id, "job_1")
        self.assertEqual(event_id, "evt_1")
        self.assertEqual(photos[0]["r2_key"], "events/evt_1/photo_1.jpg")

    def test_thumbnail_keys_are_deterministic(self):
        self.assertEqual(
            thumbnail_keys("evt_1", "photo_1"),
            (
                "events/evt_1/thumbs/200/photo_1.jpg",
                "events/evt_1/thumbs/800/photo_1.jpg",
            ),
        )

    def test_embeddings_are_l2_normalized(self):
        normalized = normalize_embedding([3.0, 4.0])
        self.assertAlmostEqual(float(normalized[0]), 0.6)
        self.assertAlmostEqual(float(normalized[1]), 0.8)

    def test_modal_acceptance_requires_a_real_call_identifier(self):
        call = types.SimpleNamespace(object_id="fc-123")
        self.assertEqual(accepted_job_id(call), "fc-123")
        with self.assertRaises(ValueError):
            accepted_job_id(types.SimpleNamespace(object_id=""))

    def test_callback_batches_never_exceed_twenty_five_faces(self):
        photos = [
            {
                "photoId": "photo_1",
                "thumbnail200Key": "events/evt_1/thumbs/200/photo_1.jpg",
                "thumbnail800Key": "events/evt_1/thumbs/800/photo_1.jpg",
                "width": 1200,
                "height": 800,
            }
        ]
        faces = [
            {
                "faceId": f"face_{index}",
                "photoId": "photo_1",
                "bbox": {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0},
                "confidence": 0.99,
                "clusterId": None,
                "embedding": [1.0] + [0.0] * 511,
            }
            for index in range(26)
        ]

        payloads = build_callback_payloads("job_1", "evt_1", photos, faces)

        self.assertTrue(all(len(payload["faces"]) <= 25 for payload in payloads))
        self.assertTrue(payloads[-1]["final"])
        self.assertEqual(payloads[-1]["photos"], photos)

    def test_processor_has_no_database_runtime_integration(self):
        with open("ml/processor.py", "r", encoding="utf-8") as source:
            processor = source.read().lower()
        for marker in ("lib" + "sql", "tur" + "so"):
            self.assertNotIn(marker, processor)


if __name__ == "__main__":
    unittest.main()

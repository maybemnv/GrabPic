import sys
import types
import unittest
from unittest import mock


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
    embed_faces,
    load_models,
    normalize_embedding,
    parse_processing_request,
    timing_safe_equal,
    thumbnail_keys,
)


class ProcessorContractTests(unittest.TestCase):
    def test_processing_payload_requires_stable_r2_references(self):
        job_id, event_id, attempt, photos = parse_processing_request(
            {
                "job_id": "job_1",
                "event_id": "evt_1",
                "photos": [
                    {"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}
                ],
                "attempt": 1,
            }
        )
        self.assertEqual(job_id, "job_1")
        self.assertEqual(attempt, 1)
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

    def test_service_token_comparison_requires_exact_match(self):
        self.assertTrue(timing_safe_equal("Bearer token", "Bearer token"))
        self.assertFalse(timing_safe_equal("Bearer token", "Bearer tokens"))

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

        payloads = build_callback_payloads("job_1", "evt_1", 2, photos, faces)

        self.assertTrue(all(len(payload["faces"]) <= 25 for payload in payloads))
        self.assertTrue(payloads[-1]["final"])
        self.assertTrue(all(payload["attempt"] == 2 for payload in payloads))
        self.assertEqual(payloads[-1]["photos"], photos)

    def test_face_embedding_uses_one_detection_and_extracts_from_it(self):
        import numpy as np

        class Tensor:
            ndim = 4

            def __len__(self):
                return 1

            def unsqueeze(self, _dimension):
                return self

            def __getitem__(self, _index):
                return self

            def to(self, _device):
                return self

            def cpu(self):
                return self

            def numpy(self):
                return np.ones(512, dtype=np.float32)

        class NoGrad:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        fake_torch = types.SimpleNamespace(
            no_grad=lambda: NoGrad(),
            nn=types.SimpleNamespace(
                functional=types.SimpleNamespace(normalize=lambda values, **_kwargs: values)
            ),
        )

        class Detector:
            def __init__(self):
                self.detect_calls = 0
                self.extract_calls = 0

            def detect(self, _image, landmarks=False):
                self.detect_calls += 1
                self.assert_landmarks = landmarks
                return np.array([[1, 2, 5, 6]]), np.array([0.99])

            def extract(self, _image, boxes, _save_path):
                self.extract_calls += 1
                self.boxes = boxes
                return Tensor()

        class Resnet:
            def __call__(self, tensors):
                return Tensor()

        detector = Detector()
        with mock.patch.dict(sys.modules, {"torch": fake_torch}):
            faces = embed_faces(object(), detector, Resnet(), "cpu")

        self.assertEqual(detector.detect_calls, 1)
        self.assertEqual(detector.extract_calls, 1)
        self.assertEqual(len(faces), 1)

    def test_face_embedding_skips_extract_when_detection_is_empty(self):
        class Detector:
            def detect(self, _image, landmarks=False):
                return None, None

            def extract(self, *_args):
                raise AssertionError("extract should not run without detections")

        self.assertEqual(embed_faces(object(), Detector(), object(), object()), [])

    def test_models_are_reused_within_a_warm_container(self):
        import processor

        class Detector:
            calls = 0

            def __init__(self, **_kwargs):
                Detector.calls += 1

        class Resnet:
            calls = 0

            def __init__(self, **_kwargs):
                Resnet.calls += 1

            def eval(self):
                return self

            def to(self, _device):
                return self

        fake = types.SimpleNamespace(MTCNN=Detector, InceptionResnetV1=Resnet)
        previous = getattr(processor, "_models", None)
        processor._models = None
        fake_torch = types.SimpleNamespace(
            device=lambda value: value,
            cuda=types.SimpleNamespace(is_available=lambda: False),
        )
        with mock.patch.dict(sys.modules, {"torch": fake_torch, "facenet_pytorch": fake}):
            first = load_models()
            second = load_models()
        processor._models = previous

        self.assertIs(first, second)
        self.assertEqual(Detector.calls, 1)
        self.assertEqual(Resnet.calls, 1)

    def test_processor_has_no_database_runtime_integration(self):
        with open("ml/processor.py", "r", encoding="utf-8") as source:
            processor = source.read().lower()
        for marker in ("lib" + "sql", "tur" + "so"):
            self.assertNotIn(marker, processor)


if __name__ == "__main__":
    unittest.main()

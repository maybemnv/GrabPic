import sys
import types
import unittest
from unittest import mock


sys.path.insert(0, "ml")
from processor import (
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

        payloads = list(build_callback_payloads("job_1", "evt_1", 2, photos, faces))

        self.assertTrue(all(len(payload["faces"]) <= 25 for payload in payloads))
        self.assertTrue(payloads[-1]["final"])
        self.assertTrue(all(payload["attempt"] == 2 for payload in payloads))
        self.assertEqual(payloads[-1]["photos"], photos)

    def test_final_callback_reports_skipped_photos_only_when_present(self):
        photos = [{"photoId": "photo_1"}]
        clean = list(build_callback_payloads("job_1", "evt_1", 1, photos, []))
        self.assertNotIn("skippedPhotoIds", clean[-1])
        skipped = list(build_callback_payloads("job_1", "evt_1", 1, photos, [], ["photo_2"]))
        self.assertEqual(skipped[-1]["skippedPhotoIds"], ["photo_2"])

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

    def test_inference_never_overlaps_between_batch_and_selfie(self):
        import threading
        import time

        import processor

        active = 0
        peak = 0

        def work():
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            time.sleep(0.02)
            active -= 1

        threads = [
            threading.Thread(target=run, args=(work,))
            for run in (processor.run_batch_inference, processor.run_selfie_inference) * 3
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(peak, 1)

    def test_batch_inference_yields_while_a_selfie_is_waiting(self):
        import threading
        import time

        import processor

        done = threading.Event()
        processor._selfies_waiting = 1
        try:
            thread = threading.Thread(
                target=lambda: (processor.run_batch_inference(lambda: None), done.set())
            )
            thread.start()
            self.assertFalse(done.wait(0.2))
        finally:
            processor._selfies_waiting = 0
        self.assertTrue(done.wait(2))
        thread.join()

    def test_selfie_is_downscaled_before_detection(self):
        import base64
        from io import BytesIO

        from PIL import Image
        from processor import SELFIE_MAX_SIDE, image_from_data_url

        buffer = BytesIO()
        Image.new("RGB", (4000, 3000)).save(buffer, format="JPEG")
        data_url = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()

        image = image_from_data_url(data_url)

        self.assertEqual(max(image.size), SELFIE_MAX_SIDE)
        self.assertEqual(image.size, (1024, 768))

    def test_processor_has_no_database_runtime_integration(self):
        with open("ml/processor.py", "r", encoding="utf-8") as source:
            processor = source.read().lower()
        for marker in ("lib" + "sql", "tur" + "so"):
            self.assertNotIn(marker, processor)


if __name__ == "__main__":
    unittest.main()

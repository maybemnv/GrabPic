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
    App = lambda *args, **kwargs: types.SimpleNamespace(function=lambda **kwargs: _Decorator())
    Image = _FakeImage
    Secret = types.SimpleNamespace(from_name=lambda *args, **kwargs: object())
    fastapi_endpoint = lambda *args, **kwargs: _Decorator()


sys.modules.setdefault("modal", _FakeModal())
_fake_libsql = types.ModuleType("libsql_client")
_fake_libsql.create_client_sync = lambda **kwargs: ("sync-client", kwargs)
sys.modules.setdefault("libsql_client", _fake_libsql)
sys.path.insert(0, "ml")
from processor import database, normalize_embedding, parse_processing_request, thumbnail_keys


class ProcessorContractTests(unittest.TestCase):
    def test_processing_payload_requires_stable_r2_references(self):
        event_id, photos = parse_processing_request(
            {
                "event_id": "evt_1",
                "photos": [{"photo_id": "photo_1", "r2_key": "events/evt_1/photo_1.jpg"}],
            }
        )
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

    def test_database_uses_synchronous_client_for_sync_handlers(self):
        import os

        os.environ["TURSO_URL"] = "libsql://example.test"
        os.environ["TURSO_TOKEN"] = "token"
        client, config = database()
        self.assertEqual(client, "sync-client")
        self.assertEqual(config, {"url": "libsql://example.test", "auth_token": "token"})


if __name__ == "__main__":
    unittest.main()

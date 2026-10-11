import unittest
from fastapi.testclient import TestClient
from ml.src.app import app
from ml.src.inference import FEATURE_NAMES, predict
from ml.src.xai import explain


class InferenceTests(unittest.TestCase):
    def setUp(self):
        # Explicit test aggregate, not a collected employee event.
        self.features = dict.fromkeys(FEATURE_NAMES, 0)
        self.features.update(day_of_week=3, is_weekend=0)

    def test_real_model_and_shap(self):
        result = predict(self.features)
        self.assertGreaterEqual(result['threat_probability'], 0)
        self.assertLessEqual(result['threat_probability'], 1)
        self.assertEqual(result['operating_threshold'], 0.85)
        self.assertEqual(result['predicted_class'], int(result['threat_probability'] >= 0.85))
        reasons = explain(self.features)
        self.assertEqual(len(reasons), 5)
        self.assertTrue(all(r['feature'] in FEATURE_NAMES for r in reasons))

    def test_schema_values_and_no_missing_value_fabrication(self):
        for value in (None, '3', float('nan'), float('inf'), -1, True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                predict({**self.features, 'logon_count': value})
        with self.assertRaises(ValueError):
            predict({})
        with self.assertRaises(ValueError):
            predict({**self.features, 'unknown': 1})

    def test_http_contract(self):
        client = TestClient(app)
        response = client.post('/predict', json={'user': 'synthetic-test', 'features': self.features})
        self.assertEqual(response.status_code, 200)
        self.assertIn('xai_reasons', response.json())
        self.assertNotIn('trust_score', response.json())
        self.assertEqual(client.post('/predict', json={'user': 'test', 'features': {}}).status_code, 400)
        self.assertEqual(client.post('/predict', json={'user': 'test', 'features': self.features, 'trust_score': 100}).status_code, 422)
        self.assertRegex(response.json()['model_fingerprint'], r'^[a-f0-9]{64}$')


if __name__ == '__main__':
    unittest.main()

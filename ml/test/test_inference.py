import unittest
import json
import os
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from ml.src.app import app
from ml.src.inference import FEATURE_NAMES, MODEL_DIR, PROJECT_ROOT, predict, resolve_model_dir
from ml.src.xai import explain
from ml.test.test_research import test_directory


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

    def test_active_schema_order_and_project_relative_model_overrides(self):
        schema = json.loads((MODEL_DIR / 'multi_source_feature_schema.json').read_text(encoding='utf-8'))
        self.assertEqual(schema['feature_count'], 21)
        self.assertEqual(FEATURE_NAMES, schema['feature_names'])
        self.assertEqual(resolve_model_dir('custom-models', Path('C:/project')).as_posix(),
                         (Path('C:/project') / 'custom-models').resolve().as_posix())
        with test_directory() as directory:
            root = Path(directory)
            (root / '.env').write_text('CYBERORBIT_MODEL_DIR="artifacts/model-a"\n', encoding='utf-8')
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(resolve_model_dir(project_root=root), (root / 'artifacts/model-a').resolve())

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

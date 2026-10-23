import { Router } from "express";
import { requireSecurityAdmin } from '../middleware/auth.js';
import { createLiveModelDataReadiness } from '../services/ml-data-readiness.js';

const router = Router();

router.post("/ingest", requireSecurityAdmin, (_req, res) => {
  // This legacy generic-event endpoint cannot establish the source semantics
  // required by the model. Fail before normalization, aggregation, persistence,
  // or inference; the enrolled-agent endpoint remains the telemetry ingest API.
  return res.status(400).json({
    success: false,
    error: {
      code: 'ML_DATA_INCOMPLETE',
      message: 'Generic telemetry events cannot be converted into the model training features. No prediction or risk update was made.',
      details: createLiveModelDataReadiness()
    }
  });
});

export default router;

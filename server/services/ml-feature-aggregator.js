/**
 * Retired compatibility surface for the former endpoint-to-CERT pseudo mapper.
 * The endpoint event contract is not equivalent to the CERT source logs. Keep
 * these exports so old imports fail closed instead of silently fabricating a
 * user-day feature vector.
 */
export const featureState = new Map();

export function updateFeatureState(_state, _event) {
  const error = new Error('Endpoint telemetry has no verified mapping to the CERT user-day feature contract. No aggregate was created.');
  error.code = 'ML_DATA_INCOMPLETE';
  error.details = { status: 'INSUFFICIENT_FOR_MODEL', inferenceAllowed: false };
  throw error;
}

export function getUserDayFeatures() {
  return null;
}

export function getLatestUserDayFeatures() {
  return null;
}

import {featureSchema} from './ml-service.js';

// These describe the notebook's training sources. Endpoint events deliberately
// do not get promoted to CERT log rows: their semantics and collection scope
// differ, even where a field name happens to look similar.
const SOURCE_BY_FEATURE = Object.freeze({
  logon_count: 'logon.csv',
  device_event_count: 'device.csv',
  file_event_count: 'file.csv',
  http_event_count: 'http.csv',
  email_event_count: 'email.csv',
  day_of_week: 'declared UTC user-day date',
  is_weekend: 'declared UTC user-day date',
  logon_unique_pc_count: 'logon.csv: pc',
  device_unique_pc_count: 'device.csv: pc',
  file_unique_pc_count: 'file.csv: pc',
  http_unique_pc_count: 'http.csv: pc',
  email_unique_pc_count: 'email.csv: pc',
  unique_files: 'file.csv: filename',
  file_content_events: 'file.csv: content',
  unique_urls: 'http.csv: url',
  unique_http_content: 'http.csv: content',
  unique_recipients: 'email.csv: to',
  email_size_total: 'email.csv: size',
  attachments_total: 'email.csv: attachments',
  total_activity: 'row counts across all five CERT logs',
  cross_source_activity: 'row counts across all five CERT logs',
});

const CALENDAR_FEATURES = new Set(['day_of_week', 'is_weekend']);

export function createLiveModelDataReadiness() {
  const features = featureSchema.feature_names.map(name => ({
    name,
    source: SOURCE_BY_FEATURE[name] || 'unmapped training source',
    status: CALENDAR_FEATURES.has(name) ? 'DERIVABLE_FROM_DECLARED_DATE' : 'MISSING_COMPATIBLE_SOURCE',
    reason: CALENDAR_FEATURES.has(name)
      ? 'Can be calculated only after a complete UTC user-day aggregate is declared.'
      : 'The enrolled-device/application telemetry does not provide the notebook-equivalent source field and aggregation.',
  }));
  return {
    status: 'INSUFFICIENT_FOR_MODEL',
    complete: false,
    featureCount: featureSchema.feature_names.length,
    compatibleFeatureCount: 0,
    derivableFeatureCount: features.filter(feature => feature.status === 'DERIVABLE_FROM_DECLARED_DATE').length,
    missingCompatibleFeatureCount: features.filter(feature => feature.status === 'MISSING_COMPATIBLE_SOURCE').length,
    features,
    requiredSources: ['logon.csv', 'device.csv', 'file.csv', 'http.csv', 'email.csv'],
    nextSteps: [
      'Provide reviewed source integrations or an authorized complete user-day aggregate that follows the saved model schema.',
      'Do not infer file reads, HTTP history/content, recipients, email sizes, or attachment counts from endpoint process and file-change observations.',
      'Until every feature is supplied and validated, use contextual risk assessment only; no model prediction is made.',
    ],
  };
}

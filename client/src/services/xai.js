export function normalizeAttributions(reasons) {
  if (!Array.isArray(reasons)) return { contributions: [], summaries: [], invalidCount: 0 };
  const contributions = [], summaries = [];
  let invalidCount = 0;
  for (const reason of reasons) {
    if (typeof reason === 'string' && reason.trim()) summaries.push(reason.trim());
    else if (reason && typeof reason.feature === 'string' && reason.feature.trim() && typeof reason.shap_value === 'number' && Number.isFinite(reason.shap_value)) {
      contributions.push({ ...reason, feature: reason.feature.trim(), impact: reason.shap_value > 0 ? 'increases threat' : reason.shap_value < 0 ? 'decreases threat' : 'no directional change' });
    } else invalidCount++;
  }
  return { contributions, summaries, invalidCount };
}
export const formatNumber = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'Not recorded';
export const formatShap = value => typeof value === 'number' && Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(4)}` : 'Not recorded';
export const matchesExplanation = (values, query) => values.some(value => value !== null && value !== undefined && String(value).toLowerCase().includes(query));

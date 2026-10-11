export function apiErrorMessage(data, fallback) {
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.message === 'string') return data.message;
  return fallback;
}

// All Devices actions use the same authenticated, checked request path.
export async function requestApi(url, { method='GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method, signal: signal || AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${globalThis.localStorage?.getItem('zero_trust_token') || ''}`, ...(body !== undefined ? { 'Content-Type':'application/json' } : {}) },
      ...(body !== undefined ? { body:JSON.stringify(body) } : {})
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'The request timed out. Check the backend connection and try again.' : e.name === 'AbortError' ? 'Request cancelled.' : 'Cannot reach the backend. Check your connection and try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    const fallback = response.status === 401 ? 'Your session has expired. Sign in and complete MFA again.' : response.status === 403 ? 'Administrator permission is required.' : `Device request failed (HTTP ${response.status}).`;
    throw new Error(apiErrorMessage(data, fallback));
  }
  return data;
}


import React from 'react';

const statuses = {
  disabled: 'City estimate is off',
  revoked: 'Device revoked',
  paused: 'Monitoring paused',
  'migration-required': 'City estimates need a backend database update. Existing devices and monitoring remain available.',
  'awaiting-heartbeat': 'Waiting for the next authenticated laptop heartbeat',
  'provider-not-configured': 'Location API is not configured on the backend',
  'public-ip-unavailable': 'Public laptop IP unavailable; check the backend proxy configuration',
  'lookup-unavailable': 'Location API unavailable; heartbeat monitoring continues',
  'rate-limited': 'Location API rate limited; automatic retry on later heartbeats',
  expired: 'Previous city estimate expired'
};

const reasons = {
  'invalid-api-key': 'Location provider rejected the API key. Verify the selected provider and its key in backend settings.',
  'authentication-failed': 'Location provider authentication failed. Verify that the API key belongs to the selected provider.',
  'access-denied': 'Location provider refused access. Check the provider account and API permissions.',
  'quota-exceeded': 'Location provider quota exceeded. Requests are paused temporarily before retrying.',
  timeout: 'Location provider timed out. Monitoring continues; a later heartbeat will retry.',
  'network-error': 'Backend could not reach the location provider. A later heartbeat will retry.',
  'dns-error': 'Backend DNS could not resolve the location provider. Check the hosting network or provider availability.',
  'tls-error': 'Backend could not verify or establish the provider HTTPS connection. Check certificates and hosting connectivity.',
  'connection-refused': 'Location provider refused the backend connection. Check provider availability and outbound access.',
  'network-unreachable': 'Backend has no usable network route to the location provider. Check hosting outbound connectivity.',
  'connection-reset': 'Location provider connection was interrupted. A later heartbeat will retry.',
  'invalid-response': 'Location provider returned an invalid response. Monitoring continues.',
  'response-ip-mismatch': "Location provider returned a different IP; its location was discarded.",
  'location-unavailable': 'Location provider has no location for this network.',
  'provider-http-error': 'Location provider returned an HTTP error. Check the backend provider diagnostic.',
  'provider-rejected-query': 'Location provider rejected the lookup. Check the backend provider diagnostic.',
  'unsupported-provider': 'Backend location provider setting is invalid. Choose db-ip-lite, ipapi.co or ipapi.is.',
  'local-database-unavailable': 'Local city database is missing. Prepare it during the backend build.',
  'local-database-invalid': 'Local city database failed validation. Rebuild it from the verified release.',
  'local-database-stale': 'Local city database is too old. Update the backend database release.'
};

const supportedProvider = value =>
  ['ipapi.co', 'ipapi.is', 'db-ip-lite'].includes(value) ? value : null;

const networkCodes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'EAI_FAIL',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_HANDSHAKE_TIMEOUT',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ECONNRESET',
  'EPIPE',
  'UND_ERR_SOCKET'
]);

export function EndpointCity({ device, administrator, pending, onChange }) {
  const city = device.ipCity || {
    status: device.ipCityEnabled ? 'awaiting-heartbeat' : 'disabled'
  };

  const provider = supportedProvider(
    device.ipCityProvider === undefined ? 'ipapi.co' : device.ipCityProvider
  );

  const available = city.status === 'available';
  const stale = available && (city.stale || device.connectionStatus !== 'CONNECTED');

  return (
    <div
      aria-label="Estimated device city"
      className="group relative overflow-hidden rounded-2xl border border-[#67E8F9]/25 bg-[#050A10] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/40 hover:bg-[#070C12] sm:p-5 space-y-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#67E8F9]/10">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="h-5 w-5 text-[#67E8F9]"
              aria-hidden="true"
            >
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </div>

          <div>
            <p className="font-semibold text-white">Estimated city</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
              Network geolocation
            </p>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${
            available
              ? stale
                ? 'border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#E8D89B]'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-white/10 bg-white/5 text-[#A7B0BA]'
          }`}
        >
          {available ? (stale ? 'STALE ESTIMATE' : 'AVAILABLE') : 'NOT AVAILABLE'}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[#A7B0BA]">
          Configured provider:{' '}
          <span className="font-medium text-[#C5CDD5]">
            {provider || 'not configured'}
          </span>
          {supportedProvider(city.provider) && city.provider !== provider
            ? ` · Last lookup: ${city.provider}`
            : ''}
        </p>

        {available ? (
          <>
            <div className="rounded-xl border border-[#67E8F9]/15 bg-[#67E8F9]/[0.04] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#7F8A96]">
                Detected location
              </p>

              <p className="mt-2 text-xl font-semibold tracking-tight text-white">
                {city.city || 'City unavailable'}
              </p>

              {[city.region, city.country || city.countryCode].filter(Boolean).length > 0 && (
                <p className="mt-1 text-sm text-[#A7B0BA]">
                  {[city.region, city.country || city.countryCode].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-[#070C12] p-3 space-y-2">
              <p
                role="status"
                className={stale ? 'text-sm text-[#E8D89B]' : 'text-sm text-emerald-200'}
              >
                {stale ? 'Last known estimate; not current' : 'Recent network estimate'}
              </p>

              <p className="text-xs text-[#A7B0BA]">
                Last updated: {new Date(city.observedAt).toLocaleString()}
              </p>

              <p className="text-xs text-[#7F8A96]">
                IP database lookup: {new Date(city.resolvedAt).toLocaleString()}
              </p>
            </div>

            {city.provider === 'db-ip-lite' && (
              <div className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-3">
                <p className="text-xs leading-5 text-[#C5CDD5]">
                  Local database release: {city.databaseRelease || 'not reported'}.
                  {' '}
                  <a
                    href="https://db-ip.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#E8D89B] underline decoration-[#D4AF37]/40 underline-offset-4 transition hover:text-[#D4AF37]"
                  >
                    IP Geolocation by DB-IP
                  </a>
                  {' '}· CC BY 4.0. Reduced coverage and accuracy; the IP's city may differ from the employee's city.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4">
            <p className="text-sm leading-6 text-[#E8D89B]" role="status">
              {reasons[city.reason] || statuses[city.status] || 'City estimate unavailable'}
              {Number.isInteger(city.httpStatus) &&
              city.httpStatus >= 400 &&
              city.httpStatus <= 599
                ? ` (HTTP ${city.httpStatus})`
                : ''}
            </p>
          </div>
        )}
      </div>

      {!available &&
        Array.isArray(city.networkCodes) &&
        city.networkCodes.some(code => networkCodes.has(code)) && (
          <div className="rounded-lg border border-white/10 bg-[#070C12] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7F8A96]">
              Connection diagnostics
            </p>
            <p className="mt-1 break-words text-xs text-[#A7B0BA]">
              {city.networkCodes
                .filter(code => networkCodes.has(code))
                .slice(0, 8)
                .join(', ')}
            </p>
          </div>
        )}

      <div className="flex gap-2 rounded-lg border border-white/10 bg-[#070C12] p-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>

        <p className="text-xs leading-5 text-[#A7B0BA]">
          Approximate city/region of the laptop's heartbeat network. VPNs, proxies and mobile networks can show another city. This does not confirm the employee's physical presence. Latest estimate expires after 24 hours.
        </p>
      </div>

      {administrator && !device.revokedAt && (
        <div className="border-t border-white/10 pt-4 space-y-3">
          <button
            type="button"
            disabled={pending || !device.enrolledAt || device.ipCitySchemaReady === false}
            className="inline-flex items-center gap-2 rounded-lg border border-[#67E8F9]/35 bg-[#67E8F9]/10 px-4 py-2.5 text-sm font-semibold text-[#67E8F9] transition-all duration-200 hover:border-[#67E8F9]/60 hover:bg-[#67E8F9]/15 hover:shadow-[0_0_20px_rgba(103,232,249,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() =>
              onChange(device.id, 'city-estimate', {
                enabled: !device.ipCityEnabled
              })
            }
          >
            <span className="text-base">{device.ipCityEnabled ? '−' : '+'}</span>
            {device.ipCityEnabled ? 'Disable city estimate' : 'Enable city estimate'}
          </button>

          {!device.enrolledAt && (
            <p className="text-xs text-[#E8D89B]">
              Enroll this assigned laptop first.
            </p>
          )}

          <p className="text-xs leading-5 text-[#7F8A96]">
            Uses existing Windows, Linux and macOS agents; no kit update or OS Location permission needed.{' '}
            {provider === 'db-ip-lite'
              ? "When enabled under your company's disclosed monitoring policy, the heartbeat public IP is looked up in the backend's local database; it is not sent to an external location API."
              : provider
                ? `When enabled under your company's disclosed monitoring policy, the public IP is sent to ${provider}.`
                : 'Select a supported location provider in backend settings before lookups can run.'}{' '}
            Disabling clears the saved estimate.
          </p>
        </div>
      )}
    </div>
  );
}

import React from 'react';

const statuses={disabled:'City estimate is off',revoked:'Device revoked',paused:'Monitoring paused',
  'migration-required':'City estimates need a backend database update. Existing devices and monitoring remain available.',
  'awaiting-heartbeat':'Waiting for the next authenticated laptop heartbeat',
  'provider-not-configured':'Location API is not configured on the backend',
  'public-ip-unavailable':'Public laptop IP unavailable; check the backend proxy configuration',
  'lookup-unavailable':'Location API unavailable; heartbeat monitoring continues',
  'rate-limited':'Location API rate limited; automatic retry on later heartbeats',expired:'Previous city estimate expired'};
const reasons={
  'invalid-api-key':'Location provider rejected the API key. Verify the selected provider and its key in backend settings.',
  'authentication-failed':'Location provider authentication failed. Verify that the API key belongs to the selected provider.',
  'access-denied':'Location provider refused access. Check the provider account and API permissions.',
  'quota-exceeded':'Location provider quota exceeded. Requests are paused temporarily before retrying.',
  timeout:'Location provider timed out. Monitoring continues; a later heartbeat will retry.',
  'network-error':'Backend could not reach the location provider. A later heartbeat will retry.',
  'invalid-response':'Location provider returned an invalid response. Monitoring continues.',
  'response-ip-mismatch':'Location provider returned a different IP; its location was discarded.',
  'location-unavailable':'Location provider has no location for this network.',
  'provider-http-error':'Location provider returned an HTTP error. Check the backend provider diagnostic.',
  'provider-rejected-query':'Location provider rejected the lookup. Check the backend provider diagnostic.',
  'unsupported-provider':'Backend location provider setting is invalid. Choose ipapi.co or ipapi.is.'
};
const supportedProvider=value=>['ipapi.co','ipapi.is'].includes(value)?value:null;
export function EndpointCity({device,administrator,pending,onChange}) {
  const city=device.ipCity||{status:device.ipCityEnabled?'awaiting-heartbeat':'disabled'};
  const provider=supportedProvider(device.ipCityProvider===undefined?'ipapi.co':device.ipCityProvider);
  const available=city.status==='available',stale=available&&(city.stale||device.connectionStatus!=='CONNECTED');
  return <div aria-label="Estimated device city" className="rounded-lg border border-cyan-300/20 bg-slate-900/40 p-3 space-y-2 text-sm">
    <p className="font-medium text-cyan-200">Estimated city</p>
    <p className="text-xs text-slate-400">Configured provider: {provider||'not configured'}{supportedProvider(city.provider)&&city.provider!==provider?` · Last lookup: ${city.provider}`:''}</p>
    {available?<>
      <p><strong>{city.city||'City unavailable'}</strong>{[city.region,city.country||city.countryCode].filter(Boolean).length>0?` · ${[city.region,city.country||city.countryCode].filter(Boolean).join(', ')}`:''}</p>
      <p role="status" className={stale?'text-amber-200':'text-slate-300'}>{stale?'Last known estimate; not current':'Recent network estimate'} · Last updated: {new Date(city.observedAt).toLocaleString()}</p>
      <p className="text-xs text-slate-400">IP database lookup: {new Date(city.resolvedAt).toLocaleString()}</p>
    </>:<p role="status">{reasons[city.reason]||statuses[city.status]||'City estimate unavailable'}{Number.isInteger(city.httpStatus)&&city.httpStatus>=400&&city.httpStatus<=599?` (HTTP ${city.httpStatus})`:''}</p>}
    <p className="text-xs text-slate-400">Approximate city/region of the laptop's heartbeat network. VPNs, proxies and mobile networks can show another city. This does not confirm the employee's physical presence. Latest estimate expires after 24 hours.</p>
    {administrator&&!device.revokedAt&&<>
      <button type="button" disabled={pending||!device.enrolledAt||device.ipCitySchemaReady===false} className="text-cyan-300 disabled:opacity-50" onClick={()=>onChange(device.id,'city-estimate',{enabled:!device.ipCityEnabled})}>{device.ipCityEnabled?'Disable city estimate':'Enable city estimate'}</button>
      {!device.enrolledAt&&<p className="text-xs text-slate-400">Enroll this assigned laptop first.</p>}
      <p className="text-xs text-slate-400">Uses existing Windows, Linux and macOS agents; no kit update or OS Location permission needed. {provider?`When enabled under your company's disclosed monitoring policy, the public IP is sent to ${provider}.`:'Select a supported location provider in backend settings before lookups can run.'} Disabling clears the saved estimate.</p>
    </>}
  </div>;
}

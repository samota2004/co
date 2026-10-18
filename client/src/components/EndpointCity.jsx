import React from 'react';

const statuses={disabled:'City estimate is off',revoked:'Device revoked',paused:'Monitoring paused',
  'awaiting-heartbeat':'Waiting for the next authenticated laptop heartbeat',
  'provider-not-configured':'Location API is not configured on the backend',
  'public-ip-unavailable':'Public laptop IP unavailable; check the backend proxy configuration',
  'lookup-unavailable':'Location API unavailable; heartbeat monitoring continues',
  'rate-limited':'Location API rate limited; automatic retry on later heartbeats',expired:'Previous city estimate expired'};
export function EndpointCity({device,administrator,pending,onChange}) {
  const city=device.ipCity||{status:device.ipCityEnabled?'awaiting-heartbeat':'disabled'};
  const available=city.status==='available',stale=available&&(city.stale||device.connectionStatus!=='CONNECTED');
  return <div aria-label="Estimated device city" className="rounded-lg border border-cyan-300/20 bg-slate-900/40 p-3 space-y-2 text-sm">
    <p className="font-medium text-cyan-200">Estimated city</p>
    {available?<>
      <p><strong>{city.city||'City unavailable'}</strong>{[city.region,city.country||city.countryCode].filter(Boolean).length>0?` · ${[city.region,city.country||city.countryCode].filter(Boolean).join(', ')}`:''}</p>
      <p role="status" className={stale?'text-amber-200':'text-slate-300'}>{stale?'Last known estimate; not current':'Recent network estimate'} · Last updated: {new Date(city.observedAt).toLocaleString()}</p>
      <p className="text-xs text-slate-400">IP database lookup: {new Date(city.resolvedAt).toLocaleString()}</p>
    </>:<p role="status">{statuses[city.status]||'City estimate unavailable'}</p>}
    <p className="text-xs text-slate-400">Approximate city/region of the laptop's heartbeat network. VPNs, proxies and mobile networks can show another city. This does not confirm the employee's physical presence. Latest estimate expires after 24 hours.</p>
    {administrator&&!device.revokedAt&&<>
      <button type="button" disabled={pending||!device.enrolledAt} className="text-cyan-300 disabled:opacity-50" onClick={()=>onChange(device.id,'city-estimate',{enabled:!device.ipCityEnabled})}>{device.ipCityEnabled?'Disable city estimate':'Enable city estimate'}</button>
      {!device.enrolledAt&&<p className="text-xs text-slate-400">Enroll this assigned laptop first.</p>}
      <p className="text-xs text-slate-400">Uses existing Windows, Linux and macOS agents; no kit update or OS Location permission needed. When enabled under your company's disclosed monitoring policy, the public IP is sent to ipapi.co. Disabling clears the saved estimate.</p>
    </>}
  </div>;
}

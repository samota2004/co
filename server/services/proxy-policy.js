import {isIP} from 'node:net';
import {publicAddress} from './endpoint-city.js';

// Published Cloudflare ingress ranges, checked 2026-10-19. These are proxies,
// never a source of employee identity or proof of physical location.
// https://www.cloudflare.com/ips-v4  https://www.cloudflare.com/ips-v6
const cloudflareIngress=Object.freeze([
  '173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22',
  '141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20',
  '197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13',
  '104.24.0.0/14','172.64.0.0/13','131.0.72.0/22',
  '2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32',
  '2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32'
]);
const subnetNames=new Set(['loopback','linklocal','uniquelocal']);
function validProxy(entry) {
  if(subnetNames.has(entry)||isIP(entry))return true;
  const parts=entry.split('/');if(parts.length!==2)return false;
  const version=isIP(parts[0]);
  return Boolean(version)&&/^\d+$/.test(parts[1])&&Number(parts[1])>0&&Number(parts[1])<=(version===4?32:128);
}
export function configureProxy(app,env=process.env) {
  const configured=(env.TRUST_PROXY||'').trim();let entries=[],mode='direct';
  if(configured==='render') {
    // Explicit opt-in, limited to Render public web services. In this deployment
    // private ingress must be controlled by the operator; don't use this preset
    // where untrusted clients can connect directly over the private network.
    if(env.RENDER!=='true'||env.RENDER_SERVICE_TYPE!=='web')throw new Error('TRUST_PROXY=render requires a Render web service. Use explicit proxy IPs/subnets on other hosts.');
    entries=['loopback','linklocal','uniquelocal',...cloudflareIngress];mode='render';
  }else if(configured) {
    entries=configured.split(',').map(value=>value.trim());
    if(entries.length>64||entries.some(entry=>!validProxy(entry)))throw new Error('TRUST_PROXY must contain verified IPs, CIDR subnets, loopback/linklocal/uniquelocal, or the Render-only render preset. Trust-all and numeric hop counts are not supported.');
    mode='explicit';
  }
  // Express walks the socket/XFF chain from right to left, stopping at the first
  // untrusted peer. Never take the leftmost XFF value or trust all headers.
  app.set('trust proxy',entries.length?entries:false);
  const policy={mode,entries:entries.length};app.locals.proxyPolicy=policy;return policy;
}
function addressClass(value) {
  if(!value||!isIP(value))return 'invalid';
  return publicAddress(value)?'public':'non-public';
}
export function cityRequestAddress(req) {
  const address=req.ip;
  // If every supplied hop was trusted, the final address may still be a CDN
  // or load balancer. Do not present that proxy's city as the laptop's city.
  if(publicAddress(address)&&req.app.get('trust proxy fn')?.(address,req.ips.length))return null;
  return address;
}
export function cityAddressDiagnostics(req) {
  const raw=req.get('x-forwarded-for')||'';
  const bounded=raw.length<=4096,chain=bounded?raw.split(',').map(value=>value.trim()).filter(Boolean):[];
  return {
    policy:req.app.locals.proxyPolicy?.mode||'external',
    socket:addressClass(req.socket.remoteAddress),selected:addressClass(cityRequestAddress(req)),
    forwarded:!raw?'absent':!bounded||chain.length>32?'oversized':chain.some(ip=>!isIP(ip))?'invalid':'present',
    forwardedHops:Math.min(chain.length,32),
    forwardedClasses:chain.slice(-8).map(addressClass)
  };
}
// One safe diagnostic per minute, only after an authenticated, opted-in lookup
// reports a missing public address. No IPs, headers, tokens or device IDs logged.
export function createCityAddressReporter({warn=message=>console.warn(message),now=Date.now}={}) {
  let next=0;
  return context=>{if(!context||now()<next)return;next=now()+60000;
    const category=(value,allowed)=>allowed.includes(value)?value:'unknown';
    warn('[endpoint-city-ip] '+JSON.stringify({code:'PUBLIC_IP_UNAVAILABLE',
      policy:category(context.policy,['direct','explicit','render','external']),
      socket:category(context.socket,['public','non-public','invalid']),
      selected:category(context.selected,['public','non-public','invalid']),
      forwarded:category(context.forwarded,['absent','present','invalid','oversized']),
      forwardedHops:Number.isInteger(context.forwardedHops)?Math.min(32,Math.max(0,context.forwardedHops)):0,
      forwardedClasses:Array.isArray(context.forwardedClasses)?context.forwardedClasses.slice(-8).map(value=>category(value,['public','non-public','invalid'])):[]
    }));
  };
}
export const reportCityAddress=createCityAddressReporter();

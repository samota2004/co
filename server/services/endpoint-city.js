import {BlockList,isIP} from 'node:net';
import {cityFetcher,cityNetworkFailure} from './city-network.js';

const excluded=new BlockList(),globalV6=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])excluded.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])excluded.addSubnet(ip,bits,'ipv6');
globalV6.addSubnet('2000::',3,'ipv6');
export function publicAddress(value) {
  if(typeof value!=='string'||value.includes('%')||!isIP(value))return null;
  let ip=value;
  if(isIP(ip)===6) {
    ip=new URL(`http://[${ip}]/`).hostname.slice(1,-1);
    const mapped=/^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(ip);
    if(mapped){const n=parseInt(mapped[1],16)*65536+parseInt(mapped[2],16);ip=[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
  }
  const family=isIP(ip)===4?'ipv4':'ipv6';
  return excluded.check(ip,family)||(family==='ipv6'&&!globalV6.check(ip,family))?null:ip;
}
const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120):'';
export const CITY_RETENTION_MS=86400000;
const providers=new Set(['ipapi.co','ipapi.is']);
export function configuredCityProvider(env=process.env) {
  const provider=(env.IPAPI_PROVIDER||'ipapi.co').trim();return providers.has(provider)?provider:null;
}
async function readProviderJson(response) {
  if(!response.body)throw new SyntaxError('Empty provider response');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new SyntaxError('Provider response limit');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data))throw new SyntaxError('Invalid provider object');return data;
}
function providerFailure(provider,httpStatus,data) {
  const failure={status:'lookup-unavailable',provider,httpStatus};
  if(httpStatus===429||['ERR_QUOTA_EXCEEDED','ERR_FREE_TIER_EXHAUSTED'].includes(data?.error_code)||data?.reason==='RateLimited')return {...failure,status:'rate-limited',reason:'quota-exceeded'};
  if(data?.error_code==='ERR_FORBIDDEN_INVALID_API_KEY')return {...failure,reason:'invalid-api-key'};
  if(httpStatus===401||(provider==='ipapi.co'&&httpStatus===403))return {...failure,reason:'authentication-failed'};
  if(httpStatus===403)return {...failure,reason:'access-denied'};
  return {...failure,reason:httpStatus>=400?'provider-http-error':'provider-rejected-query'};
}
export class CityLookup {
  constructor({fetcher=cityFetcher,env=process.env,now=Date.now,warn=message=>console.warn(message)}={}) {
    this.fetcher=fetcher;this.env=env;this.now=now;this.warn=warn;this.cache=new Map();this.pending=new Map();this.calls=0;this.window=0;
    this.generation=0;this.settings=null;this.blockedUntil=0;this.nextDiagnostic=0;
  }
  get provider(){return configuredCityProvider(this.env);}
  async lookup(address) {
    if(this.env.ENDPOINT_CITY_ENABLED!=='true'||(this.env.NODE_ENV==='production'&&!this.env.IPAPI_API_KEY))return {status:'provider-not-configured'};
    const settings={provider:this.provider,key:this.env.IPAPI_API_KEY||''};
    if(!settings.provider)return {status:'provider-not-configured',reason:'unsupported-provider'};
    if(settings.provider==='ipapi.is'&&!settings.key)return {status:'provider-not-configured'};
    const ip=publicAddress(address);if(!ip)return {status:'public-ip-unavailable'};
    if(!this.settings||this.settings.provider!==settings.provider||this.settings.key!==settings.key){
      this.settings=settings;this.generation++;this.cache.clear();this.pending.clear();this.blockedUntil=0;
    }
    const now=this.now();
    if(now<this.blockedUntil)return this.blockedResult;
    for(const [key,item] of this.cache)if(item.until<=now)this.cache.delete(key);
    if(this.cache.has(ip))return this.cache.get(ip).value;
    if(this.pending.has(ip))return this.pending.get(ip);
    if(now-this.window>=60000){this.calls=0;this.window=now;}
    if(this.calls>=60||this.pending.size>=60)return {status:'rate-limited'};
    this.calls++;
    const generation=this.generation;
    const task=this.resolve(ip,this.settings).then(value=>{
      if(generation!==this.generation)return value;
      if(this.cache.size>=512)this.cache.delete(this.cache.keys().next().value);
      this.cache.set(ip,{value,until:this.now()+(value.status==='available'?300000:60000)});
      if(value.status!=='available'&&this.now()>=this.nextDiagnostic){
        this.nextDiagnostic=this.now()+60000;
        this.warn('[endpoint-city-provider] '+JSON.stringify({provider:settings.provider,status:value.status,reason:value.reason,...(value.httpStatus?{httpStatus:value.httpStatus}:{}),...(value.networkCodes?{networkCodes:value.networkCodes}:{})}));
      }
      return value;
    }).finally(()=>{if(this.pending.get(ip)===task)this.pending.delete(ip);});
    this.pending.set(ip,task);return task;
  }
  async resolve(ip,settings={provider:this.provider,key:this.env.IPAPI_API_KEY||''}) {
    try {
      // Fixed host and explicit client IP: never geolocate the backend itself.
      const {provider,key}=settings;
      if(!providers.has(provider))return {status:'provider-not-configured',reason:'unsupported-provider'};
      const url=new URL(provider==='ipapi.is'?'https://api.ipapi.is/':`https://ipapi.co/${ip}/json/`);
      const options={redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}};
      if(provider==='ipapi.is') {
        // Official single-IP POST keeps the key out of the URL. Never fall back
        // to another provider or a keyless tier on authentication/quota errors.
        options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify({q:ip,key});
      }else if(key)url.searchParams.set('key',key);
      const response=await this.fetcher(url,options);
      let data;
      try{data=await readProviderJson(response);}catch(error){if(response.ok)throw error;}
      if(!response.ok||data?.error||data?.error_code) {
        const value=providerFailure(provider,response.status,data);
        if(this.settings===settings&&(value.status==='rate-limited'||['invalid-api-key','authentication-failed','access-denied'].includes(value.reason))) {
          const retry=response.headers.get('retry-after');
          const seconds=retry&&/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-this.now();
          this.blockedUntil=this.now()+Math.min(86400000,Math.max(300000,Number.isFinite(seconds)?seconds:0));this.blockedResult=value;
        }
        return value;
      }
      if(publicAddress(data.ip)!==ip)return {status:'lookup-unavailable',provider,reason:'response-ip-mismatch'};
      const location=provider==='ipapi.is'?data.location:{city:data.city,state:data.region,country:data.country_name,country_code:data.country_code};
      if(!location)return {status:'lookup-unavailable',provider,reason:'location-unavailable'};
      if(!/^[A-Z]{2}$/.test(location.country_code))return {status:'lookup-unavailable',provider,reason:'invalid-response'};
      return {status:'available',source:'heartbeat-public-ip',provider,city:clean(location.city),region:clean(location.state),country:clean(location.country),countryCode:location.country_code,resolvedAt:new Date(this.now()).toISOString()};
    }catch(error){return {status:'lookup-unavailable',provider:settings.provider,...cityNetworkFailure(error)};}
  }
}
export const cityLookup=new CityLookup();
export function cityView(device,now=Date.now()) {
  if(device.revokedAt)return {status:'revoked'};
  if(!device.ipCityEnabled)return {status:'disabled'};
  if(device.config?.paused||device.health?.paused)return {status:'paused'};
  const value=device.ipCity;
  if(!value)return {status:'awaiting-heartbeat'};
  if(value.status!=='available')return value;
  const age=now-Date.parse(value.observedAt);
  if(!Number.isFinite(age)||age<0||age>CITY_RETENTION_MS)return {status:'expired'};
  return {...value,stale:age>300000};
}

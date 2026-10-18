import {BlockList,isIP} from 'node:net';

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
export class CityLookup {
  constructor({fetcher=fetch,env=process.env,now=Date.now}={}) {
    this.fetcher=fetcher;this.env=env;this.now=now;this.cache=new Map();this.pending=new Map();this.calls=0;this.window=0;
  }
  async lookup(address) {
    if(this.env.ENDPOINT_CITY_ENABLED!=='true'||(this.env.NODE_ENV==='production'&&!this.env.IPAPI_API_KEY))return {status:'provider-not-configured'};
    const ip=publicAddress(address);if(!ip)return {status:'public-ip-unavailable'};
    const now=this.now();
    for(const [key,item] of this.cache)if(item.until<=now)this.cache.delete(key);
    if(this.cache.has(ip))return this.cache.get(ip).value;
    if(this.pending.has(ip))return this.pending.get(ip);
    if(now-this.window>=60000){this.calls=0;this.window=now;}
    if(this.calls>=60||this.pending.size>=60)return {status:'rate-limited'};
    this.calls++;
    const task=this.resolve(ip).then(value=>{
      if(this.cache.size>=512)this.cache.delete(this.cache.keys().next().value);
      this.cache.set(ip,{value,until:this.now()+(value.status==='available'?300000:60000)});return value;
    }).finally(()=>this.pending.delete(ip));
    this.pending.set(ip,task);return task;
  }
  async resolve(ip) {
    try {
      // Fixed host and explicit client IP: never geolocate the backend itself.
      const url=new URL(`https://ipapi.co/${ip}/json/`);
      if(this.env.IPAPI_API_KEY)url.searchParams.set('key',this.env.IPAPI_API_KEY);
      const response=await this.fetcher(url,{redirect:'error',signal:AbortSignal.timeout(2000),headers:{Accept:'application/json'}});
      if(!response.ok)return {status:response.status===429?'rate-limited':'lookup-unavailable'};
      const reader=response.body.getReader(),chunks=[];let size=0;
      try {
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error('Response limit');}chunks.push(value);}
      }finally{reader.releaseLock();}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(data.error||publicAddress(data.ip)!==ip||!/^[A-Z]{2}$/.test(data.country_code))return {status:'lookup-unavailable'};
      return {status:'available',source:'heartbeat-public-ip',provider:'ipapi.co',city:clean(data.city),region:clean(data.region),country:clean(data.country_name),countryCode:data.country_code,resolvedAt:new Date(this.now()).toISOString()};
    }catch{return {status:'lookup-unavailable'};}
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

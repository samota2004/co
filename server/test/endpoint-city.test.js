import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CityLookup,publicAddress,cityView} from '../services/endpoint-city.js';

test('city lookups accept only public IPv4/IPv6, reject private, reserved, scoped and injected addresses',()=>{
  for(const ip of [null,'bad','1.2.3.4/path','127.0.0.1','10.0.0.1','100.64.0.1','172.16.0.1','192.168.1.2','169.254.2.3','203.0.113.5','198.18.0.1','224.1.1.1','::1','fc00::1','fe80::1%en0','2001:db8::1','2002:808:808::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),null,String(ip));
  assert.equal(publicAddress('::ffff:8.8.8.8'),'8.8.8.8');assert.equal(publicAddress('2606:4700:4700::1111'),'2606:4700:4700::1111');
});
test('explicit client IP over fixed HTTPS, bounded fields, coalesced cache and separate lookup time',async()=>{
  let calls=0,now=2000000;
  const provider=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_API_KEY:'unit-key'},now:()=>now,fetcher:async(url,options)=>{
    calls++;assert.equal(url.origin,'https://ipapi.co');assert.equal(url.pathname,'/8.8.8.8/json/');assert.equal(url.searchParams.get('key'),'unit-key');assert.equal(options.redirect,'error');
    return new Response(JSON.stringify({ip:'8.8.8.8',city:'Fixture\u0000 City',region:'Fixture Region',country_name:'India',country_code:'IN',latitude:28,longitude:77,postal:'omit',org:'omit'}));
  }});
  const [a,b]=await Promise.all([provider.lookup('8.8.8.8'),provider.lookup('8.8.8.8')]);assert.equal(calls,1);assert.deepEqual(a,b);
  assert.deepEqual(a,{status:'available',source:'heartbeat-public-ip',provider:'ipapi.co',city:'Fixture City',region:'Fixture Region',country:'India',countryCode:'IN',resolvedAt:new Date(now).toISOString()});
  await provider.lookup('8.8.8.8');assert.equal(calls,1);now+=300001;await provider.lookup('8.8.8.8');assert.equal(calls,2);
});
test('no API call without opt-in/production credentials or with private IP; explicit safe failure statuses',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw new Error('Sensitive provider URL must not escape');};
  for(const env of [{},{ENDPOINT_CITY_ENABLED:'true',NODE_ENV:'production'}])assert.equal((await new CityLookup({env,fetcher}).lookup('8.8.8.8')).status,'provider-not-configured');
  const p=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true'},fetcher});assert.equal((await p.lookup('127.0.0.1')).status,'public-ip-unavailable');assert.equal(calls,0);
  assert.equal((await p.lookup('8.8.8.8')).status,'lookup-unavailable');await p.lookup('8.8.8.8');assert.equal(calls,1);
  for(const payload of [{ip:'1.1.1.1',country_code:'IN'},{error:true},{ip:'8.8.8.8',country_code:'INVALID'}])assert.equal((await new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true'},fetcher:async()=>new Response(JSON.stringify(payload))}).lookup('8.8.8.8')).status,'lookup-unavailable');
});
test('rate limits and oversized provider responses remain bounded',async()=>{
  let calls=0;const p=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true'},fetcher:async()=>{calls++;return new Response('',{status:429});}});
  for(let i=1;i<=61;i++)assert.equal((await p.lookup(`8.8.1.${i}`)).status,'rate-limited');assert.equal(calls,60);
  const big=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true'},fetcher:async()=>new Response('x'.repeat(70000))});assert.equal((await big.lookup('8.8.8.8')).status,'lookup-unavailable');
});
test('API view labels stale data and excludes paused, disabled, revoked and expired city fields',()=>{
  const now=Date.now(),device={ipCityEnabled:true,config:{},ipCity:{status:'available',city:'Private estimate',observedAt:new Date(now-300001).toISOString()}};
  assert.equal(cityView(device,now).stale,true);
  assert.deepEqual(cityView({...device,ipCityEnabled:false},now),{status:'disabled'});
  assert.deepEqual(cityView({...device,config:{paused:true}},now),{status:'paused'});
  assert.deepEqual(cityView({...device,revokedAt:new Date()},now),{status:'revoked'});
  assert.deepEqual(cityView(device,now+86400000),{status:'expired'});
});

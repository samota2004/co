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
  for(let i=1;i<=61;i++)assert.equal((await p.lookup(`8.8.1.${i}`)).status,'rate-limited');assert.equal(calls,1,'Provider quota cooldown applies across IPs');
  const limited=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true'},fetcher:async url=>new Response(JSON.stringify({ip:url.pathname.split('/')[1],country_code:'IN'}))});
  for(let i=1;i<=60;i++)assert.equal((await limited.lookup(`8.8.1.${i}`)).status,'available');assert.equal((await limited.lookup('8.8.1.61')).status,'rate-limited');
  const big=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true'},fetcher:async()=>new Response('x'.repeat(70000))});assert.equal((await big.lookup('8.8.8.8')).status,'lookup-unavailable');
});

test('ipapi.is uses explicit-IP HTTPS POST with its own key and retains only city fields for IPv4/IPv6',async()=>{
  let calls=0;const locator=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'ipapi.is',IPAPI_API_KEY:'synthetic-is-key',NODE_ENV:'production'},fetcher:async(url,options)=>{
    calls++;assert.equal(url.href,'https://api.ipapi.is/');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers['Content-Type'],'application/json');const body=JSON.parse(options.body);assert.equal(body.key,'synthetic-is-key');
    assert.deepEqual(Object.keys(body).sort(),['key','q']);
    return new Response(JSON.stringify({ip:body.q,is_vpn:false,company:{name:'omit'},location:{city:'Fixture\u0000 City',state:'Fixture State',country:'India',country_code:'IN',latitude:28,longitude:77,zip:'omit',timezone:'omit'}}));
  }});
  assert.equal(locator.provider,'ipapi.is');
  for(const ip of ['8.8.8.8','2001:4860:4860::8888']) {
    const result=await locator.lookup(ip);assert.equal(result.provider,'ipapi.is');assert.equal(result.city,'Fixture City');assert.equal(result.region,'Fixture State');
    assert.deepEqual(Object.keys(result).sort(),['status','source','provider','city','region','country','countryCode','resolvedAt'].sort());
    assert.ok(!JSON.stringify(result).includes(ip));await locator.lookup(ip);
  }
  assert.equal(calls,2);
});

test('provider selection is explicit with no arbitrary host, keyless ipapi.is or fallback to another provider',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw new Error('Must not send key');};
  for(const env of [
    {ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'ipapi.is'},
    {ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'https://untrusted.invalid',IPAPI_API_KEY:'fixture'},
    {IPAPI_PROVIDER:'ipapi.is',IPAPI_API_KEY:'fixture'}
  ])assert.equal((await new CityLookup({env,fetcher}).lookup('8.8.8.8')).status,'provider-not-configured');
  assert.equal(calls,0);
  const seen=[];const locator=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'ipapi.is',IPAPI_API_KEY:'fixture'},warn:()=>{},fetcher:async url=>{seen.push(url.hostname);return new Response(JSON.stringify({error:'sensitive fixture',error_code:'ERR_FORBIDDEN_INVALID_API_KEY'}),{status:403});}});
  assert.equal((await locator.lookup('8.8.8.8')).reason,'invalid-api-key');assert.deepEqual(seen,['api.ipapi.is']);
});

test('provider errors yield redacted actionable diagnostics and respect global quota/auth cooldowns',async()=>{
  const cases=[
    ['ipapi.co',403,'', 'authentication-failed'],
    ['ipapi.is',403,{error:'sensitive-key-fixture',error_code:'ERR_FORBIDDEN_INVALID_API_KEY'},'invalid-api-key'],
    ['ipapi.is',403,'','access-denied'],
    ['ipapi.is',429,{error:'sensitive-key-fixture',error_code:'ERR_QUOTA_EXCEEDED'},'quota-exceeded'],
    ['ipapi.co',200,{error:true,reason:'RateLimited'},'quota-exceeded'],
    ['ipapi.co',503,'','provider-http-error']
  ];
  for(const [provider,status,payload,reason] of cases) {
    const logs=[];let calls=0,now=1000;
    const locator=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:provider,IPAPI_API_KEY:'sensitive-key-fixture'},now:()=>now,warn:line=>logs.push(line),fetcher:async()=>{
      calls++;return new Response(typeof payload==='string'?payload:JSON.stringify(payload),{status,headers:{'Retry-After':'3600'}});
    }});
    const result=await locator.lookup('8.8.8.8');assert.equal(result.reason,reason);assert.equal(result.httpStatus,status);
    assert.equal(result.status,reason==='quota-exceeded'?'rate-limited':'lookup-unavailable');assert.equal(logs.length,1);
    assert.doesNotMatch(JSON.stringify({result,logs}),/sensitive-key-fixture|8\.8\.8\.8|https:\/\//);
    if(status===403||reason==='quota-exceeded') {
      now+=60001;await locator.lookup('1.1.1.1');assert.equal(calls,1,'Do not repeat refused requests on another IP');
      now+=3600000;await locator.lookup('1.1.1.1');assert.equal(calls,2);
    }
  }
});

test('timeouts, network failures, invalid responses and missing location are distinct without leaking provider exceptions',async()=>{
  const env={ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'ipapi.is',IPAPI_API_KEY:'secret-fixture'};
  const cases=[
    [()=>{throw Object.assign(new Error('https://secret-fixture'),{name:'TimeoutError'});},'timeout'],
    [()=>{throw new Error('https://secret-fixture');},'network-error'],
    [()=>new Response('<html>secret-fixture</html>'),'invalid-response'],
    [()=>new Response('x'.repeat(70000)),'invalid-response'],
    [()=>new Response(JSON.stringify({ip:'1.1.1.1',location:{country_code:'IN'}})),'response-ip-mismatch'],
    [()=>new Response(JSON.stringify({ip:'8.8.8.8',location:null})),'location-unavailable'],
    [()=>new Response(JSON.stringify({ip:'8.8.8.8',location:{country_code:'invalid'}})),'invalid-response']
  ];
  for(const [fetcher,reason] of cases) {
    const logs=[];const locator=new CityLookup({env,fetcher,warn:line=>logs.push(line)});
    const result=await locator.lookup('8.8.8.8');assert.equal(result.reason,reason);assert.doesNotMatch(JSON.stringify({result,logs}),/secret-fixture|8\.8\.8\.8|https:\/\//);
  }
});

test('provider/key changes clear cache and cooldown without mixing pending provider responses',async()=>{
  const env={ENDPOINT_CITY_ENABLED:'true',IPAPI_API_KEY:'co-fixture'};let finish,calls=0;
  const locator=new CityLookup({env,fetcher:async(url,options)=>{
    calls++;
    if(url.hostname==='ipapi.co')return new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({ip:'8.8.8.8',city:'Old provider fixture',country_code:'IN'})));});
    assert.equal(JSON.parse(options.body).key,'is-fixture');return new Response(JSON.stringify({ip:'8.8.8.8',location:{city:'New provider fixture',country_code:'IN'}}));
  }});
  const old=locator.lookup('8.8.8.8');env.IPAPI_PROVIDER='ipapi.is';env.IPAPI_API_KEY='is-fixture';
  assert.equal((await locator.lookup('8.8.8.8')).city,'New provider fixture');finish();await old;
  assert.equal((await locator.lookup('8.8.8.8')).city,'New provider fixture');assert.equal(calls,2);
});
test('API view labels stale data and excludes paused, disabled, revoked and expired city fields',()=>{
  const now=Date.now(),device={ipCityEnabled:true,config:{},ipCity:{status:'available',city:'Private estimate',observedAt:new Date(now-300001).toISOString()}};
  assert.equal(cityView(device,now).stale,true);
  assert.deepEqual(cityView({...device,ipCityEnabled:false},now),{status:'disabled'});
  assert.deepEqual(cityView({...device,config:{paused:true}},now),{status:'paused'});
  assert.deepEqual(cityView({...device,revokedAt:new Date()},now),{status:'revoked'});
  assert.deepEqual(cityView(device,now+86400000),{status:'expired'});
});

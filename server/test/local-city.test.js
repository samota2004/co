import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {LocalCityLookup,validateCityDatabase,cityDatabasePath,verifiedCityReader} from '../services/local-city.js';
import {CityLookup} from '../services/endpoint-city.js';
const now=Date.parse('2026-10-20T12:00:00Z');
const record={city:{names:{en:'Fixture City'}},country:{iso_code:'IN',names:{en:'India'}},subdivisions:[{names:{en:'Fixture Region'}}],location:{latitude:20,longitude:80},postal:{code:'sensitive'}};
const reader=(get=()=>record)=>({metadata:{databaseType:'DBIP-City-Lite',buildEpoch:new Date(now-86400000)},get});

test('local mode uses no external API or API key and retains only city metadata',async()=>{
  let loads=0,gets=0;
  const local=new LocalCityLookup({now:()=>now,load:async()=>{loads++;return reader(ip=>{assert.equal(ip,'8.8.8.8');gets++;return record;});}});
  const lookup=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'db-ip-lite',NODE_ENV:'production'},local,now:()=>now,fetcher:()=>assert.fail('Local mode must not contact any location API')});
  const [a,b]=await Promise.all([lookup.lookup('8.8.8.8'),lookup.lookup('8.8.8.8')]);
  assert.equal(a.status,'available');assert.deepEqual(a,b);assert.equal(loads,1);assert.equal(gets,1);
  assert.deepEqual(Object.keys(a).sort(),['status','source','provider','city','region','country','countryCode','resolvedAt','databaseDate','databaseRelease'].sort());
  assert.equal(a.city,'Fixture City');assert.equal(a.provider,'db-ip-lite');
  assert.equal(JSON.stringify(a).includes('8.8.8.8'),false);
  assert.equal((await lookup.lookup('127.0.0.1')).status,'public-ip-unavailable');assert.equal(loads,1);
});

test('missing, invalid, future and stale local databases report honest failure with bounded retries',async()=>{
  let clock=now,loads=0;
  const unavailable=new LocalCityLookup({now:()=>clock,load:async()=>{loads++;throw new Error('secret path or network details');}});
  const result=await unavailable.lookup('8.8.8.8');assert.deepEqual(result,{status:'lookup-unavailable',provider:'db-ip-lite',reason:'local-database-unavailable'});
  await unavailable.lookup('1.1.1.1');assert.equal(loads,1);clock+=60001;await unavailable.lookup('1.1.1.1');assert.equal(loads,2);
  for(const [metadata,reason] of [
    [{databaseType:'unrelated',buildEpoch:new Date(now)},'local-database-invalid'],
    [{databaseType:'DBIP-City-Lite',buildEpoch:new Date(now+2*86400000)},'local-database-invalid'],
    [{databaseType:'DBIP-City-Lite',buildEpoch:new Date(now-91*86400000)},'local-database-stale']
  ]){
    const local=new LocalCityLookup({now:()=>now,load:async()=>({...reader(),metadata})});
    assert.equal((await local.lookup('8.8.8.8')).reason,reason);
  }
  const noCity=new LocalCityLookup({now:()=>now,load:async()=>reader(()=>({country:record.country}))});
  assert.equal((await noCity.lookup('8.8.8.8')).reason,'location-unavailable');
});

test('IPv6 and mapped IPv4 lookups validate public addresses and coalesce database loading',async()=>{
  let loads=0;const addresses=[];
  const local=new LocalCityLookup({now:()=>now,load:async()=>{loads++;return reader(ip=>{addresses.push(ip);return record;});}});
  assert.equal((await local.lookup('10.2.3.4')).status,'public-ip-unavailable');assert.equal(loads,0);
  const results=await Promise.all([local.lookup('::ffff:8.8.8.8'),local.lookup('2001:4860:4860::8888')]);
  assert.equal(loads,1);assert.deepEqual(addresses,['8.8.8.8','2001:4860:4860::8888']);assert.ok(results.every(r=>r.status==='available'));
});

test('real verified DB-IP release resolves a public test IP without contacting a location API',{skip:!(await access(cityDatabasePath).then(()=>true).catch(()=>false))},async()=>{
  const db=await verifiedCityReader();validateCityDatabase(db);
  const lookup=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'db-ip-lite',NODE_ENV:'production'},local:new LocalCityLookup({load:async()=>db}),fetcher:()=>assert.fail('External location request is forbidden in local mode')});
  const a=await lookup.lookup('8.8.8.8');assert.equal(a.status,'available');assert.ok(a.city.length>0);assert.equal(a.countryCode,'US');
  assert.equal(a.provider,'db-ip-lite');assert.equal('location' in a,false);assert.equal('ip' in a,false);
  const v6=await lookup.lookup('2001:4860:4860::8888');assert.equal(v6.status,'available');assert.ok(v6.city);
});

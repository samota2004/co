import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {cityNetworkFailure,createCityFetcher,createIpv4ProviderRequest} from '../services/city-network.js';
import {CityLookup} from '../services/endpoint-city.js';
const failure=code=>Object.assign(new Error('secret-key-fixture https://private.invalid/?key=secret 8.8.8.8'),{code});
const body=JSON.stringify({q:'8.8.8.8',key:'secret-key-fixture'});

test('network diagnostics classify nested DNS/TLS/routing errors and discard all raw error details',()=>{
  for(const [code,reason] of [['ENOTFOUND','dns-error'],['EAI_AGAIN','dns-error'],['CERT_HAS_EXPIRED','tls-error'],['ERR_TLS_CERT_ALTNAME_INVALID','tls-error'],['ECONNREFUSED','connection-refused'],['ENETUNREACH','network-unreachable'],['EHOSTUNREACH','network-unreachable'],['UND_ERR_CONNECT_TIMEOUT','timeout'],['ECONNRESET','connection-reset']]) {
    const error=new TypeError('fetch failed',{cause:new AggregateError([failure(code),failure('unknown-sensitive-key')])});
    assert.deepEqual(cityNetworkFailure(error),{reason,networkCodes:[code]});
    assert.doesNotMatch(JSON.stringify(cityNetworkFailure(error)),/secret|8\.8\.8\.8|https:/);
  }
  const cyclic=failure('ENOTFOUND');cyclic.cause=cyclic;
  assert.deepEqual(cityNetworkFailure(cyclic),{reason:'dns-error',networkCodes:['ENOTFOUND']});
  assert.deepEqual(cityNetworkFailure(failure('secret-key-fixture')),{reason:'network-error'});
});

test('known pre-response connect failure retries once over IPv4 to the same provider with the same bounded request',async()=>{
  let first=0,retries=0,now=1000;const logs=[],signal=AbortSignal.timeout(5000);
  const fetcher=createCityFetcher({now:()=>now,warn:line=>logs.push(line),fetcher:async()=>{first++;throw new TypeError('fetch failed',{cause:failure('ENETUNREACH')});},ipv4Request:async(url,options)=>{
    retries++;assert.equal(url.href,'https://api.ipapi.is/');assert.equal(options.body,body);assert.equal(options.signal,signal);return new Response('{}');
  }});
  assert.equal((await fetcher(new URL('https://api.ipapi.is/'),{body,method:'POST',signal})).status,200);
  await fetcher('https://api.ipapi.is/',{body,method:'POST',signal});assert.equal(first,2);assert.equal(retries,2);assert.equal(logs.length,1);
  assert.match(logs[0],/retry-ipv4/);assert.doesNotMatch(logs[0],/secret|8\.8\.8\.8|https:/);
  now+=60000;await fetcher('https://api.ipapi.is/',{body,method:'POST',signal});assert.equal(logs.length,2);
});

test('no fallback on HTTP/auth/quota, TLS, ambiguous reset, expired deadlines or an unapproved destination',async()=>{
  let retries=0;const ipv4Request=async()=>{retries++;throw new Error('Must not retry');};
  for(const status of [200,302,403,429,503]) {
    const fetcher=createCityFetcher({fetcher:async()=>new Response('{}',{status}),ipv4Request});
    assert.equal((await fetcher('https://api.ipapi.is/',{})).status,status);
  }
  for(const code of ['CERT_HAS_EXPIRED','ECONNRESET','UND_ERR_HEADERS_TIMEOUT','unknown']) {
    const error=failure(code),fetcher=createCityFetcher({fetcher:async()=>{throw error;},ipv4Request});
    await assert.rejects(fetcher('https://api.ipapi.is/',{}),e=>e===error);
  }
  const error=failure('ENETUNREACH'),aborted=createCityFetcher({fetcher:async()=>{throw error;},ipv4Request});
  await assert.rejects(aborted('https://api.ipapi.is/',{signal:AbortSignal.abort()}),e=>e===error);
  const guarded=createCityFetcher({fetcher:async()=>{throw new Error('Must not connect');},ipv4Request});
  for(const url of ['http://api.ipapi.is/','https://other.invalid/','https://user:password@api.ipapi.is/','https://api.ipapi.is:444/'])await assert.rejects(guarded(url,{}),/origin is not allowed/);
  assert.equal(retries,0);
});

function fakeHttps({chunks=['{}'],status=200,error,headers={},inspect=()=>{}}={}) {
  return (url,options,callback)=>{
    const req=new EventEmitter();req.destroy=reason=>queueMicrotask(()=>req.emit('error',reason));
    req.end=sent=>{
      inspect(url,options,sent);
      queueMicrotask(()=>{
        if(error){req.emit('error',error);return;}
        const response=Readable.from(chunks.map(value=>Buffer.from(value)));
        response.statusCode=status;response.headers=headers;callback(response);
      });
    };return req;
  };
}
test('IPv4 transport enforces verified HTTPS, deadline, response size and no redirect following',async()=>{
  const signal=AbortSignal.timeout(5000);let requests=0;
  const request=createIpv4ProviderRequest({request:fakeHttps({status:302,headers:{location:'https://other.invalid','retry-after':'600'},inspect:(url,options,sent)=>{
    requests++;assert.equal(url.hostname,'api.ipapi.is');assert.equal(options.family,4);assert.equal(options.autoSelectFamily,false);
    assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'api.ipapi.is');assert.equal(options.agent,false);
    assert.equal(options.minVersion,'TLSv1.2');assert.equal(options.signal,signal);assert.equal(options.maxHeaderSize,8192);assert.equal(sent,body);
  }})});
  const response=await request('https://api.ipapi.is/',{method:'POST',body,signal});
  assert.equal(response.status,302);assert.equal(response.headers.get('retry-after'),'600');assert.equal(requests,1);
  const big=createIpv4ProviderRequest({request:fakeHttps({chunks:['x'.repeat(65536),'x']})});
  await assert.rejects(big('https://api.ipapi.is/',{}),SyntaxError);
  const error=failure('CERT_HAS_EXPIRED'),broken=createIpv4ProviderRequest({request:fakeHttps({error})});
  await assert.rejects(broken('https://api.ipapi.is/',{}),e=>e===error);
  await assert.rejects(request('https://api.ipapi.is/',{signal:AbortSignal.abort()}));assert.equal(requests,1);
});

test('IPv4 recovery reaches the normal city parser; failed recovery retains only safe network codes',async()=>{
  const env={ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'ipapi.is',IPAPI_API_KEY:'secret-key-fixture'};
  const connectError=new TypeError('fetch failed',{cause:failure('ENETUNREACH')});
  const response=JSON.stringify({ip:'8.8.8.8',location:{city:'Recovered fixture city',country:'India',country_code:'IN'}});
  const fetcher=createCityFetcher({fetcher:async()=>{throw connectError;},warn:()=>{},ipv4Request:createIpv4ProviderRequest({request:fakeHttps({chunks:[response]})})});
  const city=await new CityLookup({env,fetcher}).lookup('8.8.8.8');assert.equal(city.status,'available');assert.equal(city.city,'Recovered fixture city');
  const logs=[],broken=createCityFetcher({fetcher:async()=>{throw connectError;},warn:()=>{},ipv4Request:async()=>{throw failure('ECONNREFUSED');}});
  const result=await new CityLookup({env,fetcher:broken,warn:line=>logs.push(line)}).lookup('8.8.8.8');
  assert.equal(result.reason,'connection-refused');assert.deepEqual(result.networkCodes,['ECONNREFUSED','ENETUNREACH']);
  assert.doesNotMatch(JSON.stringify({result,logs}),/secret|8\.8\.8\.8|https:/);
  const large=createCityFetcher({fetcher:async()=>{throw connectError;},warn:()=>{},ipv4Request:createIpv4ProviderRequest({request:fakeHttps({chunks:['x'.repeat(65537)]})})});
  const oversized=await new CityLookup({env,fetcher:large,warn:()=>{}}).lookup('8.8.8.8');
  assert.equal(oversized.reason,'invalid-response','Report the final IPv4 response failure rather than its initial routing error');
});

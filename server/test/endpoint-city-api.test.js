import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointService} from '../services/endpoint-service.js';
import {cityLookup,CityLookup} from '../services/endpoint-city.js';
import {configureProxy} from '../services/proxy-policy.js';
import {expireCityEstimates} from '../services/endpoint-retention.js';
import {DEFAULT_CONFIG} from '../../agent/shared/contract.js';
const health={queueEvents:0,queueBytes:0,droppedEvents:0,paused:false,helperLastSeen:null,collectors:{}};
// Original pre-location agent body: no new consent/capability/config fields.
const heartbeat={agentVersion:'1.1.0',health};
const estimate={status:'available',source:'heartbeat-public-ip',provider:'ipapi.co',city:'Fixture City',region:'Fixture Region',country:'India',countryCode:'IN',resolvedAt:new Date().toISOString()};

test('unchanged Windows/Linux/macOS heartbeats drive isolated city estimates, trusted IPs, expiry and safe control races',{skip:!process.env.DATABASE_URL,timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse;const oldLookup=cityLookup.lookup;
  try {
    let calls=0,lastAddress;const locator={lookup:async address=>{calls++;lastAddress=address;return estimate;}};
    const service=new EndpointService(f.prisma,locator),enrolled=[];
    for(const [platform,identity] of [['win32','S-1-5-21-1234-5678-9012-1007'],['linux','uid:1943'],['darwin','uid:843']]) {
      const a=await service.assign(f.admin,{userId:f.employee.id,name:`${platform} assigned laptop`,platform,mappedIdentity:identity});
      await assert.rejects(service.changeCity(f.admin,a.deviceId,{enabled:true}),{status:409});
      const e=await service.enroll({token:a.enrollmentToken,platform,agentVersion:heartbeat.agentVersion});
      const original=await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}});enrolled.push({a,e,original});
      const before=calls;let reply=await service.heartbeat(e.credential,heartbeat,'8.8.8.8');assert.equal(calls,before);
      assert.deepEqual(Object.keys(reply).sort(),['config','accountControl','companyId','userId','deviceId'].sort());assert.deepEqual(reply.config,DEFAULT_CONFIG);
      await service.changeCity(f.admin,a.deviceId,{enabled:true});reply=await service.heartbeat(e.credential,heartbeat,'8.8.8.8');assert.equal(calls,before+1);
      assert.deepEqual(reply.config,DEFAULT_CONFIG);
      const d=(await service.dashboard(f.admin)).devices.find(d=>d.id===a.deviceId);assert.equal(d.ipCity.city,'Fixture City');assert.equal(d.userId,f.employee.id);
      const saved=await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}});assert.equal(saved.mappedIdentity,identity);assert.equal(saved.credentialHash,original.credentialHash);
      assert.ok(!JSON.stringify(saved.ipCity).includes('8.8.8.8'));assert.ok(!('latitude' in saved.ipCity));
    }
    const {a,e,original}=enrolled[0],saved=()=>f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}});
    assert.equal((await service.dashboard(f.otherAdmin)).devices.length,0);assert.equal((await service.dashboard(f.employee2)).devices.length,0);
    await assert.rejects(service.changeCity(f.otherAdmin,a.deviceId,{enabled:false}),{status:404});
    await assert.rejects(service.changeCity(f.employee,a.deviceId,{enabled:false}),{status:403});
    await assert.rejects(service.changeCity(f.admin,a.deviceId,{enabled:'yes'}),{status:400});
    const before=calls;await assert.rejects(service.heartbeat('invalid',heartbeat,'8.8.8.8'),{status:401});assert.equal(calls,before);

    // Real HTTP request: body IP and arbitrary XFF cannot select the location.
    cityLookup.lookup=locator.lookup;
    const {default:router}=await import('../routes/endpoint.js');sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api/endpoint',router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const post=async(xff='1.1.1.1')=>fetch(origin+'/api/endpoint/heartbeat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${e.credential}`,'X-Forwarded-For':xff,'X-Forwarded-Proto':'https'},body:JSON.stringify({...heartbeat,ip:'9.9.9.9',deviceId:'wrong'})});
    let r=await post();assert.equal(r.status,200);assert.equal(lastAddress,'127.0.0.1');assert.deepEqual(Object.keys(await r.json()).sort(),['success','config','accountControl'].sort());
    app.set('trust proxy',['loopback']);r=await post();assert.equal(r.status,200);assert.equal(lastAddress,'1.1.1.1');
    // Reproduce the deployed failure: loopback accepts the local TLS proxy but
    // stops at a private downstream hop. Switching to the explicit Render
    // policy must make the unchanged agent heartbeat update its dashboard city.
    let providerCalls=0;
    const provider=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_API_KEY:'synthetic-key',NODE_ENV:'production'},fetcher:async url=>{
      providerCalls++;assert.equal(url.pathname,'/8.8.8.8/json/');
      return new Response(JSON.stringify({ip:'8.8.8.8',city:'Render proxy fixture city',region:'Fixture Region',country_name:'India',country_code:'IN'}));
    }});
    cityLookup.lookup=address=>provider.lookup(address);
    const chain='9.9.9.9, 8.8.8.8, 172.64.1.10, 10.60.0.8';
    configureProxy(app,{TRUST_PROXY:'loopback'});
    r=await post(chain);assert.equal(r.status,200);assert.equal((await saved()).ipCity.status,'public-ip-unavailable');assert.equal(providerCalls,0);
    configureProxy(app,{TRUST_PROXY:'render',RENDER:'true',RENDER_SERVICE_TYPE:'web'});
    r=await post(chain);assert.equal(r.status,200);assert.equal(providerCalls,1);
    let displayed=(await service.dashboard(f.admin)).devices.find(device=>device.id===a.deviceId);
    assert.equal(displayed.ipCity.city,'Render proxy fixture city');assert.equal(displayed.ipCity.stale,false);assert.equal(displayed.connectionStatus,'CONNECTED');
    // The other supported provider has a different endpoint and nested response.
    // Test the actual unchanged-agent HTTP route, not just the provider parser.
    let isCalls=0;const isProvider=new CityLookup({env:{ENDPOINT_CITY_ENABLED:'true',IPAPI_PROVIDER:'ipapi.is',IPAPI_API_KEY:'synthetic-is-key',NODE_ENV:'production'},fetcher:async(url,options)=>{
      isCalls++;assert.equal(url.href,'https://api.ipapi.is/');assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).q,'8.8.8.8');
      return new Response(JSON.stringify({ip:'8.8.8.8',location:{city:'IPAPI IS fixture city',state:'Fixture State',country:'India',country_code:'IN',latitude:20,longitude:70}}));
    }});
    cityLookup.lookup=address=>isProvider.lookup(address);
    r=await post(chain);assert.equal(r.status,200);assert.equal(isCalls,1);
    const isService=new EndpointService(f.prisma,isProvider);
    displayed=(await isService.dashboard(f.admin)).devices.find(device=>device.id===a.deviceId);
    assert.equal(displayed.ipCityProvider,'ipapi.is');assert.equal(displayed.ipCity.provider,'ipapi.is');assert.equal(displayed.ipCity.city,'IPAPI IS fixture city');
    assert.equal('latitude' in displayed.ipCity,false);assert.equal('longitude' in displayed.ipCity,false);
    assert.equal((await saved()).credentialHash,original.credentialHash);assert.equal((await saved()).mappedIdentity,original.mappedIdentity);
    cityLookup.lookup=locator.lookup;
    const auth=(await import('../middleware/auth.js')).generateJwtToken;
    const control=(user,enabled)=>fetch(origin+`/api/endpoint/${a.deviceId}/city-estimate`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth(user,true)}`},body:JSON.stringify({enabled})});
    assert.equal((await control(f.otherAdmin,false)).status,404);assert.equal((await control(f.admin,false)).status,200);assert.deepEqual((await saved()).ipCity,{status:'disabled'});

    await service.changeCity(f.admin,a.deviceId,{enabled:true});
    await service.change(f.admin,a.deviceId,{config:{...original.config,paused:true}});assert.equal((await saved()).ipCity.status,'paused');
    const pausedCalls=calls;await service.heartbeat(e.credential,heartbeat,'8.8.8.8');assert.equal(calls,pausedCalls);
    await service.change(f.admin,a.deviceId,{config:original.config});
    service.locator={lookup:async()=>{throw new Error('Sensitive provider failure');}};
    assert.equal((await service.heartbeat(e.credential,heartbeat,'8.8.8.8')).deviceId,a.deviceId);assert.equal((await saved()).ipCity.status,'lookup-unavailable');

    // Older pending lookups must not overwrite a newer result or resurrect data
    // after disable/re-enable or pause/resume, even in the same millisecond.
    let finish,start;const ready=()=>new Promise(resolve=>start=resolve);
    let waiting=ready();service.locator={lookup:()=>{start();return new Promise(resolve=>finish=resolve);}};
    let pending=service.heartbeat(e.credential,heartbeat,'8.8.8.8');await waiting;
    service.locator=locator;await service.heartbeat(e.credential,heartbeat,'1.1.1.1');finish({...estimate,city:'Obsolete City'});await pending;assert.equal((await saved()).ipCity.city,'Fixture City');
    for(const change of ['disable','pause','revoke']) {
      waiting=ready();service.locator={lookup:()=>{start();return new Promise(resolve=>finish=resolve);}};
      pending=service.heartbeat(e.credential,heartbeat,'8.8.8.8');await waiting;
      if(change==='disable'){await service.changeCity(f.admin,a.deviceId,{enabled:false});await service.changeCity(f.admin,a.deviceId,{enabled:true});}
      if(change==='pause'){await service.change(f.admin,a.deviceId,{config:{...original.config,paused:true}});await service.change(f.admin,a.deviceId,{config:original.config});}
      if(change==='revoke')await service.change(f.admin,a.deviceId,{},true);
      finish({...estimate,city:'Obsolete City'});await pending;assert.notEqual((await saved()).ipCity.city,'Obsolete City');
    }
    await assert.rejects(service.heartbeat(e.credential,heartbeat,'8.8.8.8'),{status:401});
    const second=enrolled[1];await f.prisma.endpointDevice.update({where:{id:second.a.deviceId},data:{ipCity:{...estimate,observedAt:new Date(Date.now()-2*86400000).toISOString()}}});
    assert.equal((await service.dashboard(f.admin)).devices.find(d=>d.id===second.a.deviceId).ipCity.status,'expired');await expireCityEstimates(f.prisma);
    assert.deepEqual((await f.prisma.endpointDevice.findUnique({where:{id:second.a.deviceId}})).ipCity,{status:'expired'});
    // Existing ingest traffic must not cancel a foreground-independent lookup.
    waiting=ready();service.locator={lookup:()=>{start();return new Promise(resolve=>finish=resolve);}};
    pending=service.heartbeat(second.e.credential,heartbeat,'8.8.8.8');await waiting;
    await service.ingest(second.e.credential,{events:[{version:1,eventId:randomUUID(),deviceId:second.a.deviceId,type:'HEARTBEAT',occurredAt:new Date().toISOString(),metadata:{uptimeSeconds:1,freeMemoryBytes:100}}]});
    finish(estimate);await pending;assert.equal((await f.prisma.endpointDevice.findUnique({where:{id:second.a.deviceId}})).ipCity.city,'Fixture City');
  }finally{cityLookup.lookup=oldLookup;if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});

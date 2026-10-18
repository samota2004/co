import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {configureProxy,cityAddressDiagnostics,cityRequestAddress,createCityAddressReporter} from '../services/proxy-policy.js';

const renderEnv={TRUST_PROXY:'render',RENDER:'true',RENDER_SERVICE_TYPE:'web'};
test('proxy policy defaults to direct and accepts bounded explicit subnets without trust-all or guessed hop counts',()=>{
  const app=express();assert.deepEqual(configureProxy(app,{}),{mode:'direct',entries:0});assert.equal(app.get('trust proxy fn')('127.0.0.1',0),false);
  configureProxy(app,{TRUST_PROXY:'loopback,10.60.0.0/16,fd12::/48,192.168.1.20'});
  const trust=app.get('trust proxy fn');
  assert.equal(trust('::ffff:10.60.5.8',0),true);assert.equal(trust('fd12::1',0),true);
  assert.equal(trust('10.61.1.1',0),false);assert.equal(trust('8.8.8.8',0),false);
  for(const value of ['true','1','2','*','0.0.0.0/0','::/0','10.0.0.0/33','::1/129','loopback,','unknown','render,loopback'])assert.throws(()=>configureProxy(express(),{TRUST_PROXY:value}),/TRUST_PROXY/);
  assert.throws(()=>configureProxy(express(),{TRUST_PROXY:'render'}),/Render web service/);
  assert.throws(()=>configureProxy(express(),{...renderEnv,RENDER_SERVICE_TYPE:'worker'}),/Render web service/);
});

async function withRequestServer(run) {
  const app=express();let env={},socket='127.0.0.1';
  app.use((req,res,next)=>{
    // Synthetic network peers are set by the test harness, never a production
    // header or request parameter. Exercise Express's real chain algorithm.
    configureProxy(app,env);Object.defineProperty(req.socket,'remoteAddress',{configurable:true,value:socket});next();
  });
  app.get('/',(req,res)=>res.json({address:cityRequestAddress(req),secure:req.secure,diagnostic:cityAddressDiagnostics(req)}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const request=async(environment,peer,xff,extra={})=>{
    env=environment;socket=peer;
    const res=await fetch(`http://127.0.0.1:${server.address().port}/`,{headers:{'X-Forwarded-Proto':'https',...(xff?{'X-Forwarded-For':xff}:{}),...extra}});
    assert.equal(res.status,200);return res.json();
  };
  try{await run(request);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('Render private and Cloudflare hops resolve IPv4/IPv6 and ignore forged leftmost/client-IP headers',async()=>withRequestServer(async request=>{
  let r=await request({TRUST_PROXY:'loopback'},'127.0.0.1','8.8.8.8, 10.60.0.8');
  assert.equal(r.address,'10.60.0.8');assert.equal(r.diagnostic.selected,'non-public');
  r=await request(renderEnv,'10.60.0.7','9.9.9.9, 8.8.8.8, 172.64.1.10, 10.60.0.8',{'CF-Connecting-IP':'1.1.1.1','True-Client-IP':'1.1.1.1'});
  assert.equal(r.address,'8.8.8.8');assert.equal(r.secure,true);
  assert.deepEqual(r.diagnostic,{policy:'render',socket:'non-public',selected:'public',forwarded:'present',forwardedHops:4,forwardedClasses:['public','public','public','non-public']});
  r=await request(renderEnv,'::ffff:10.60.0.7','2001:4860:4860::8888, 2606:4700::1234, fd12::2');assert.equal(r.address,'2001:4860:4860::8888');
  // A shorter route with a single client address remains supported.
  r=await request(renderEnv,'10.60.0.7','8.8.8.8');assert.equal(r.address,'8.8.8.8');
  // Stop at an unknown public intermediate; never jump left past it.
  r=await request(renderEnv,'10.60.0.7','8.8.8.8, 9.9.9.9, 172.64.1.10');assert.equal(r.address,'9.9.9.9');
}));
test('untrusted direct peers, missing/invalid chains and proxy-only chains cannot select an arbitrary laptop city',async()=>withRequestServer(async request=>{
  let r=await request({},'9.9.9.9','8.8.8.8');assert.equal(r.address,'9.9.9.9');assert.equal(r.secure,false);
  r=await request(renderEnv,'9.9.9.9','8.8.8.8, 172.64.1.10');assert.equal(r.address,'9.9.9.9');assert.equal(r.secure,false);
  r=await request(renderEnv,'10.60.0.7',null,{'CF-Connecting-IP':'8.8.8.8'});assert.equal(r.address,'10.60.0.7');assert.equal(r.diagnostic.forwarded,'absent');
  r=await request(renderEnv,'10.60.0.7','172.64.1.10');assert.equal(r.address,null);assert.equal(r.diagnostic.selected,'invalid');
  r=await request(renderEnv,'10.60.0.7','8.8.8.8, not-an-ip, 172.64.1.10');assert.equal(r.address,'not-an-ip');assert.equal(r.diagnostic.forwarded,'invalid');
}));
test('city IP diagnostics are bounded, redact sensitive input and log at most once per minute',()=>{
  let now=1000;const logs=[],report=createCityAddressReporter({now:()=>now,warn:line=>logs.push(line)});
  report();assert.equal(logs.length,0);
  report({policy:'render',socket:'non-public',selected:'non-public',forwarded:'present',forwardedHops:2,forwardedClasses:['public','non-public'],credential:'secret-fixture',ip:'8.8.8.8'});
  report({policy:'render'});assert.equal(logs.length,1);
  assert.doesNotMatch(logs[0],/secret-fixture|8\.8\.8\.8|credential/);
  assert.match(logs[0],/PUBLIC_IP_UNAVAILABLE/);
  now+=60000;report({policy:'secret-fixture',socket:'8.8.8.8',forwardedClasses:['secret-fixture'],forwardedHops:Infinity});
  assert.equal(logs.length,2);assert.doesNotMatch(logs[1],/secret-fixture|8\.8\.8\.8|Infinity/);
});

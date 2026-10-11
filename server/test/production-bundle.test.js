import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {deviceFixture,projectRoot} from './device-fixture.js';

test('production source server loads generated Prisma and serves actual scoped API and SPA',{timeout:60000},async()=>{
 const f=await deviceFixture();let child;
 try{
  const {generateJwtToken}=await import('../middleware/auth.js');
  child=spawn(process.execPath,['server/server.js'],{cwd:projectRoot,windowsHide:true,env:{...process.env,DATABASE_URL:f.url,NODE_ENV:'production',PORT:'0',TRUST_PROXY:'',DISABLE_HMR:'true'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const port=await new Promise((resolve,reject)=>{
   const timer=setInterval(()=>{const match=output.match(/Server running on http:\/\/localhost:(\d+)/);if(match){clearInterval(timer);clearTimeout(timeout);resolve(match[1]);}},100);
   const timeout=setTimeout(()=>{clearInterval(timer);reject(new Error('Production server startup timeout'));},30000);
   child.once('error',e=>{clearInterval(timer);clearTimeout(timeout);reject(e);});
   child.once('exit',code=>{clearInterval(timer);clearTimeout(timeout);reject(new Error('Production server exited before startup: '+code));});
  });
  const origin='http://127.0.0.1:'+port,headers={Authorization:'Bearer '+generateJwtToken(f.admin,true)};
  const users=await fetch(origin+'/api/users',{headers});assert.equal(users.status,200);assert.equal((await users.json()).users.length,3);
  const metrics=await fetch(origin+'/api/ml/metrics',{headers});assert.equal(metrics.status,200);assert.equal((await metrics.json()).featureSchema.feature_count,21);
  const unknown=await fetch(origin+'/api/not-an-endpoint',{headers});assert.equal(unknown.status,404);assert.equal((await unknown.json()).error.code,'API_NOT_FOUND');
  const spa=await fetch(origin+'/security-profile');assert.equal(spa.status,200);assert.match(await spa.text(),/\/assets\/index-/);
  assert.ok(spa.headers.get('content-security-policy'));
  const insecureEndpoint=await fetch(origin+'/api/endpoint/dashboard',{headers});assert.equal(insecureEndpoint.status,426);
 }finally{child?.kill();await f.close();}
});

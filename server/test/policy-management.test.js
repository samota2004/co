import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

test('policy preview is read-only and saved policy history is tenant-scoped and audited',{timeout:90000},async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const url=`http://127.0.0.1:${server.address().port}/api`,headers={Authorization:`Bearer ${generateJwtToken(f.admin,true)}`,'Content-Type':'application/json'};
  const call=async(path,method='GET',body)=>{const response=await fetch(url+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};};
  const before=await f.prisma.auditLog.count({where:{companyId:'A',action:'POLICY_UPDATED'}});
  const preview=await call('/policies/preview','POST',{riskScore:95,config:{autoFreezeOnCritical:false}});
  assert.equal(preview.status,200);assert.equal(preview.data.preview,true);assert.equal(preview.data.readOnly,true);assert.equal(preview.data.action,'RESTRICT');
  assert.equal(await f.prisma.auditLog.count({where:{companyId:'A',action:'POLICY_UPDATED'}}),before,'preview creates no policy audit version');
  assert.equal((await call('/policies/preview','POST',{riskScore:101})).status,400);
  const saved=await call('/policies','PATCH',{offHoursPenalty:13});assert.equal(saved.status,200);
  const history=await call('/policies/history');assert.equal(history.status,200);assert.equal(history.data.versions.length,1);assert.equal(history.data.versions[0].config.offHoursPenalty,13);
  const foreign=await fetch(url+'/policies/history',{headers:{Authorization:`Bearer ${generateJwtToken(f.otherAdmin,true)}`}}).then(response=>response.json());
  assert.equal(foreign.versions.length,0);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});

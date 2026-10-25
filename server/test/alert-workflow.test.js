import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('authorized alert acknowledgment moves an incident to investigation and resolution is audited',{timeout:90000},async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  const {default:routes}=await import('../routes/index.js');const {generateJwtToken}=await import('../middleware/auth.js');sse=(await import('../services/sse.js')).sseManager;
  const incident=await f.prisma.incident.create({data:{incidentId:randomUUID(),title:'Synthetic alert fixture',userId:f.employee.id,userEmail:f.employee.email,severity:'HIGH',status:'OPEN',riskScore:65,contributingFactors:['test fixture']}});
  const app=express();app.use(express.json());app.use('/api',routes);server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url=`http://127.0.0.1:${server.address().port}/api/incidents/${incident.id}`,headers={Authorization:`Bearer ${generateJwtToken(f.admin,true)}`,'Content-Type':'application/json'};
  const acknowledged=await fetch(url,{method:'PATCH',headers,body:JSON.stringify({status:'INVESTIGATING',notes:'Acknowledged during test.'})});assert.equal(acknowledged.status,200);
  assert.equal((await acknowledged.json()).incident.status,'INVESTIGATING');
  const resolved=await fetch(url+'/resolve',{method:'POST',headers,body:JSON.stringify({newStatus:'RESOLVED',notes:'Synthetic test closed.'})});assert.equal(resolved.status,200);
  assert.equal((await resolved.json()).incident.status,'RESOLVED');
  assert.equal(await f.prisma.auditLog.count({where:{userId:f.employee.id,action:{in:['INCIDENT_INVESTIGATING','INCIDENT_RESOLVED']}}}),2);
  const other=await fetch(`${url}?companyId=B`,{method:'PATCH',headers:{Authorization:`Bearer ${generateJwtToken(f.otherAdmin,true)}`,'Content-Type':'application/json'},body:JSON.stringify({status:'INVESTIGATING'})});assert.equal(other.status,404);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});

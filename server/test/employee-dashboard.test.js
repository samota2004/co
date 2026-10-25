import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {DEFAULT_CONFIG} from '../../agent/shared/contract.js';

test('existing employee detail API returns only selected employee monitoring records', {skip:!process.env.DATABASE_URL,timeout:60000}, async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  const nine=await f.prisma.user.update({where:{id:f.employee.id},data:{name:'Nine',employeeId:'EMP-NINE',email:'nine@test.invalid',departmentCode:'ENGINEERING',assignedAdminId:f.admin.id,riskScore:44,trustScore:71}});
  const priyanka=await f.prisma.user.update({where:{id:f.employee2.id},data:{name:'Priyanka',employeeId:'EMP-PRIYANKA',email:'priyanka@test.invalid',departmentCode:'ENGINEERING',assignedAdminId:f.admin.id,riskScore:12,trustScore:94}});
  const resource=await f.prisma.resource.create({data:{resourceId:randomUUID(),companyId:'A',name:'Engineering archive',departmentCode:'ENGINEERING',sensitivity:'CONFIDENTIAL'}});
  const now=new Date();
  for(const user of [nine,priyanka,f.admin]){
   if(user!==f.admin)await f.prisma.session.create({data:{sessionToken:randomUUID(),userId:user.id,ip:'127.0.0.1',userAgent:`Synthetic browser for ${user.name}`,expiresAt:new Date(now.getTime()+3600000)}});
   await f.prisma.auditLog.create({data:{companyId:user.companyId,userId:user.id,userEmail:user.email,action:user===nine?'AUTH_LOGIN':'MFA_SUCCESS',category:'AUTH',severity:'INFO',details:'Synthetic profile test event'}});
   await f.prisma.activityEvent.create({data:{eventId:randomUUID(),userId:user.id,userEmail:user.email,userRole:user.roleCode,type:'RESOURCE_ACCESS',resourceName:`${user.name} resource`,timestamp:now,ip:'127.0.0.1',location:'Synthetic fixture',severity:'LOW',riskContribution:3,metadata:{source:'synthetic-test'}}});
   await f.prisma.incident.create({data:{incidentId:randomUUID(),title:`${user.name} incident`,userId:user.id,userEmail:user.email,severity:'LOW',status:'OPEN',riskScore:user.riskScore,contributingFactors:['SYNTHETIC_TEST_FIXTURE']}});
   await f.prisma.accessRequest.create({data:{requestId:randomUUID(),userId:user.id,resourceId:resource.id,justification:`${user.name} synthetic request`,riskAtRequest:user.riskScore}});
  }
  const nineDevice=await f.prisma.device.create({data:{deviceId:randomUUID(),userId:nine.id,name:'Nine logical browser',os:'Windows',browser:'Chrome',ip:'127.0.0.1',location:'Synthetic fixture'}});
  const agent=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:nine.id,name:'Nine endpoint',platform:'win32',config:DEFAULT_CONFIG}});
  await f.prisma.endpointEvent.create({data:{eventId:randomUUID(),deviceId:agent.id,companyId:'A',userId:nine.id,version:1,type:'APPLICATION_USAGE',occurredAt:now,metadata:{name:'Synthetic test editor',durationSeconds:45}}});

  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const call=async(actor,path)=>{const response=await fetch(base+path,{headers:{Authorization:`Bearer ${generateJwtToken(actor,true)}`}});return{status:response.status,body:await response.json()};};

  const nineResponse=await call(f.admin,`/users/${nine.id}`);
  assert.equal(nineResponse.status,200,JSON.stringify(nineResponse.body));assert.equal(nineResponse.body.user.id,nine.id);assert.equal(nineResponse.body.user.name,'Nine');
  assert.equal(nineResponse.body.user.riskScore,null,'a manually populated number without risk history is not shown as measured');
  assert.equal(nineResponse.body.user.trustScore,null,'registration trust without an assessed update is not shown as measured');
  assert.equal((await call(f.admin,`/risk/users/${nine.id}`)).body.riskScore,null);
  assert.equal((await call(f.admin,`/trust/${nine.id}`)).body.trustScore,null);
  assert.deepEqual(nineResponse.body.devices.map(row=>row.id),[nineDevice.id]);
  assert.equal(nineResponse.body.sessions.length,1);assert.equal(nineResponse.body.sessions[0].status,'ACTIVE');
  assert.ok(nineResponse.body.loginHistory.every(row=>row.action==='AUTH_LOGIN'));
  assert.ok(nineResponse.body.incidents.every(row=>row.userId===nine.id));
  assert.ok(nineResponse.body.accessRequests.every(row=>row.justification.startsWith('Nine')));
  assert.ok(nineResponse.body.events.every(row=>row.resourceName==='Nine resource'));
  assert.ok(nineResponse.body.auditEvents.every(row=>row.action==='AUTH_LOGIN'));
  assert.equal(JSON.stringify(nineResponse.body).includes('Priyanka'),false);
  assert.equal(JSON.stringify(nineResponse.body).includes(f.admin.email),false);

  const priyankaResponse=await call(f.admin,`/users/${priyanka.id}`);
  assert.equal(priyankaResponse.status,200);assert.equal(priyankaResponse.body.user.id,priyanka.id);assert.equal(priyankaResponse.body.user.name,'Priyanka');
  assert.equal(priyankaResponse.body.devices.length,0);assert.equal(priyankaResponse.body.sessions.length,1);
  assert.ok(priyankaResponse.body.incidents.every(row=>row.userId===priyanka.id));
  assert.equal(JSON.stringify(priyankaResponse.body).includes('Nine'),false);

  const endpoint=await call(f.admin,`/endpoint/dashboard?userId=${nine.id}&eventType=APPLICATION_USAGE`);
  assert.equal(endpoint.status,200);assert.deepEqual(endpoint.body.devices.map(device=>device.userId),[nine.id]);
  assert.ok(endpoint.body.events.every(event=>event.userId===nine.id&&event.deviceId===agent.id));
  const noAgent=await call(f.admin,`/endpoint/dashboard?userId=${priyanka.id}&eventType=APPLICATION_USAGE`);
  assert.equal(noAgent.status,200);assert.deepEqual(noAgent.body.devices,[]);assert.equal(noAgent.body.events.length,0);
  assert.equal((await call(f.admin,`/users/${f.foreign.id}`)).status,404,'cross-company employee IDs are concealed');
  assert.equal((await call(f.employee,`/users/${nine.id}`)).status,401,'employee console login remains intentionally disabled');
  assert.equal((await call(f.admin,`/devices`)).status,200,'Device Trust API remains available');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(sse){for(const client of sse.clients)client.end();clearInterval(sse.heartbeatInterval);}
  await f.close();
 }
});

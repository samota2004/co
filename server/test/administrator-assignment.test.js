import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('employee and manager activity follows assigned administrator, including reassignment', {timeout:60000},async()=>{
  const f=await deviceFixture();let server;
  try{
    const {default:routes}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const {DEFAULT_CONFIG}=await import('../../agent/shared/contract.js');
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base='http://127.0.0.1:'+server.address().port+'/api';
    await f.prisma.role.create({data:{code:'SYSTEM_ADMIN',name:'System administrator'}});
    const adminA=await f.prisma.user.create({data:{name:'Assigned admin A',email:randomUUID()+'@test.invalid',employeeId:randomUUID(),companyId:'A',roleCode:'SECURITY_ADMIN',status:'ACTIVE'}});
    const adminB=await f.prisma.user.create({data:{name:'Assigned admin B',email:randomUUID()+'@test.invalid',employeeId:randomUUID(),companyId:'A',roleCode:'SYSTEM_ADMIN',status:'ACTIVE'}});
    await f.prisma.role.create({data:{code:'MANAGER',name:'Manager'}});
    const manager=await f.prisma.user.update({where:{id:f.employee.id},data:{roleCode:'MANAGER',assignedAdminId:adminA.id}});
    const employee=await f.prisma.user.update({where:{id:f.employee2.id},data:{managerId:manager.id,assignedAdminId:adminA.id}});
    const unassigned=await f.prisma.user.create({data:{name:'Unassigned employee',email:randomUUID()+'@test.invalid',employeeId:randomUUID(),companyId:'A',roleCode:'EMPLOYEE',status:'ACTIVE'}});
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:employee.id,name:'Fixture laptop',platform:'win32',config:DEFAULT_CONFIG}});
    await f.prisma.endpointEvent.create({data:{eventId:randomUUID(),deviceId:device.id,companyId:'A',userId:employee.id,version:1,type:'APPLICATION_USAGE',occurredAt:new Date(),metadata:{name:'Notepad',durationSeconds:4}}});
    await f.prisma.activityEvent.createMany({data:[manager,employee,unassigned].map(u=>({eventId:randomUUID(),userId:u.id,userEmail:u.email,userRole:u.roleCode,type:'APPLICATION_USAGE',ip:'127.0.0.1',location:'Fixture',metadata:{name:'Notepad'}}))});
    const headers=user=>({Authorization:'Bearer '+generateJwtToken(user,true),'Content-Type':'application/json'});
    const request=async(user,path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:headers(user),...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
    for(const id of [manager.id,employee.id]){
      assert.equal((await request(adminA,'/users/'+id)).status,200);
      assert.equal((await request(adminB,'/users/'+id)).status,404);
      assert.equal((await request(f.admin,'/users/'+id)).status,200);
    }
    assert.equal((await request(adminA,'/users/'+unassigned.id)).status,404);
    assert.equal((await request(f.admin,'/users/'+unassigned.id)).status,200);
    const aUsers=await request(adminA,'/users');
    assert.deepEqual(new Set(aUsers.body.users.map(u=>u.id)),new Set([manager.id,employee.id]));
    assert.equal((await request(adminB,'/users')).body.users.length,0);
    assert.equal((await request(adminA,'/activity')).body.events.length,2);
    assert.equal((await request(adminB,'/activity')).body.events.length,0);
    assert.equal((await request(f.admin,'/activity')).body.events.length,3);
    assert.equal((await request(adminA,'/endpoint/dashboard?deviceId='+device.id)).body.events.length,1);
    assert.equal((await request(adminB,'/endpoint/dashboard?deviceId='+device.id)).status,404);
    assert.equal((await request(adminB,'/events')).body.events.length,0);
    assert.equal((await request(adminB,'/dashboard/summary')).body.summary.activeUsers,1);
    const {sseManager}=await import('../services/sse.js');
    const streamA={messages:[],writableEnded:false,destroyed:false,write(message){this.messages.push(message);},end(){this.writableEnded=true;}};
    const streamB={messages:[],writableEnded:false,destroyed:false,write(message){this.messages.push(message);},end(){this.writableEnded=true;}};
    for(const [stream,admin] of [[streamA,adminA],[streamB,adminB]]){
      sseManager.clients.add(stream);sseManager.scopes.set(stream,{user:admin,expiresAt:Date.now()+60000});
    }
    sseManager.broadcastActivity({userId:employee.id,companyId:'A',type:'APPLICATION_USAGE'});
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(streamA.messages.length,1);assert.equal(streamB.messages.length,0);
    assert.equal((await request(adminB,'/users/'+employee.id,'PATCH',{assignedAdminId:adminB.id})).status,404);
    assert.equal((await request(adminA,'/users/'+employee.id,'PATCH',{assignedAdminId:adminB.id})).status,400);
    assert.equal((await request(f.admin,'/users/'+employee.id,'PATCH',{assignedAdminId:adminB.id})).status,400);
    assert.equal((await request(f.admin,'/users/'+manager.id,'PATCH',{assignedAdminId:adminB.id})).status,200);
    const changed=await request(f.admin,'/users/'+employee.id,'PATCH',{assignedAdminId:adminB.id});
    assert.equal(changed.status,200);
    assert.equal((await request(adminA,'/endpoint/dashboard?deviceId='+device.id)).status,404);
    assert.equal((await request(adminB,'/endpoint/dashboard?deviceId='+device.id)).body.events.length,1);
    assert.equal((await request(adminA,'/activity')).body.events.length,0);
    assert.equal((await request(adminB,'/activity')).body.events.length,2);
    assert.equal((await request(adminA,'/users/'+manager.id)).status,404);
    assert.equal((await request(adminB,'/users/'+manager.id)).status,200);
    assert.equal((await request(adminB,'/users/'+employee.id)).status,200);
    sseManager.broadcastActivity({userId:employee.id,companyId:'A',type:'APPLICATION_USAGE'});
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(streamA.messages.length,1);assert.equal(streamB.messages.length,1);
    for(const stream of [streamA,streamB])sseManager.clients.delete(stream);
    const profile=(suffix,role)=>({name:'New '+suffix,email:randomUUID()+'@test.invalid',employeeId:randomUUID(),department:'ENGINEERING',role,status:'ACTIVE',assignedAdminId:adminB.id});
    const createdManager=await request(f.admin,'/users','POST',profile('manager','MANAGER'));
    assert.equal(createdManager.status,200);
    const createdEmployee=await request(f.admin,'/users','POST',{...profile('employee','EMPLOYEE'),managerId:createdManager.body.user.id});
    assert.equal(createdEmployee.status,200);
    assert.equal((await request(adminB,'/users/'+createdManager.body.user.id)).status,200);
    assert.equal((await request(adminB,'/users/'+createdEmployee.body.user.id)).status,200);
    assert.equal((await request(adminA,'/users/'+createdEmployee.body.user.id)).status,404);
    const missingManager=await request(f.admin,'/users','POST',profile('missing manager','EMPLOYEE'));
    assert.equal(missingManager.status,400);assert.equal(missingManager.body.error.code,'MANAGER_REQUIRED');
    const missingAdmin=profile('missing administrator','MANAGER');delete missingAdmin.assignedAdminId;
    assert.equal((await request(f.admin,'/users','POST',missingAdmin)).body.error.code,'ADMINISTRATOR_REQUIRED');
    const ownManagerProfile=profile('own manager','MANAGER');delete ownManagerProfile.assignedAdminId;
    const ownManager=await request(adminA,'/users','POST',ownManagerProfile);
    assert.equal(ownManager.status,200);
    const ownProfile=profile('own employee','EMPLOYEE');delete ownProfile.assignedAdminId;ownProfile.managerId=ownManager.body.user.id;
    const own=await request(adminA,'/users','POST',ownProfile);
    assert.equal(own.status,200);assert.equal(own.body.user.assignedAdminId,adminA.id);
    assert.equal((await request(adminB,'/users','POST',ownProfile)).body.error.code,'INVALID_MANAGER');
    const options=await request(adminA,'/assignment-options');
    assert.deepEqual(options.body.administrators.map(a=>a.id),[adminA.id]);
    assert.ok(options.body.managers.some(m=>m.id===ownManager.body.user.id));
    assert.ok(options.body.managers.every(m=>m.assignedAdminId===adminA.id));
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    const {sseManager}=await import('../services/sse.js');for(const client of sseManager.clients)client.end();
    await f.close();
  }
});

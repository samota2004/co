import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('admin dashboard queries contain administrator records only while employee monitoring remains scoped', {timeout:60000}, async()=>{
  const f=await deviceFixture();let server;
  try{
    await f.prisma.role.create({data:{code:'SYSTEM_ADMIN',name:'System administrator'}});
    await f.prisma.role.create({data:{code:'MANAGER',name:'Manager'}});
    await f.prisma.department.createMany({data:[{code:'SECURITY',name:'Security'},{code:'IT',name:'Information Technology'}]});
    const admin=await f.prisma.user.create({data:{name:'Dashboard security admin',email:randomUUID()+'@test.invalid',employeeId:randomUUID(),companyId:'A',roleCode:'SECURITY_ADMIN',departmentCode:'SECURITY',status:'ACTIVE',riskScore:72,trustScore:59,riskLevel:'HIGH',trustUpdatedAt:new Date()}});
    const systemAdmin=await f.prisma.user.create({data:{name:'Dashboard system admin',email:randomUUID()+'@test.invalid',employeeId:randomUUID(),companyId:'A',roleCode:'SYSTEM_ADMIN',departmentCode:'IT',status:'RESTRICTED',riskScore:18,trustScore:22,riskLevel:'LOW',trustUpdatedAt:new Date()}});
    const employee=await f.prisma.user.update({where:{id:f.employee.id},data:{name:'Employee Must Stay Hidden',email:'employee-hidden@test.invalid',assignedAdminId:admin.id,riskScore:99,trustScore:1,riskLevel:'CRITICAL'}});
    const manager=await f.prisma.user.update({where:{id:f.employee2.id},data:{name:'Manager Must Stay Hidden',email:'manager-hidden@test.invalid',roleCode:'MANAGER',assignedAdminId:admin.id,riskScore:97,trustScore:2,riskLevel:'CRITICAL'}});
    const now=new Date();
    await f.prisma.session.create({data:{sessionToken:randomUUID(),userId:admin.id,ip:'127.0.0.1',expiresAt:new Date(now.getTime()+3600000),mfaVerifiedAt:now}});
    await f.prisma.session.create({data:{sessionToken:randomUUID(),userId:systemAdmin.id,ip:'127.0.0.1',expiresAt:new Date(now.getTime()-1000),mfaVerifiedAt:new Date(now.getTime()-86400000)}});
    for(const user of [admin,employee,manager]){
      await f.prisma.activityEvent.create({data:{eventId:randomUUID(),userId:user.id,userEmail:user.email,userRole:user.roleCode,type:'MASS_DOWNLOAD',timestamp:now,ip:'127.0.0.1',location:'Synthetic test fixture',severity:'CRITICAL',riskContribution:99}});
      await f.prisma.riskScore.create({data:{userId:user.id,score:user.riskScore,level:'CRITICAL',factors:['SYNTHETIC_TEST_FIXTURE'],timestamp:now}});
    }
    await f.prisma.riskScore.create({data:{userId:systemAdmin.id,score:18,level:'LOW',factors:['SYNTHETIC_TEST_FIXTURE'],timestamp:now}});
    for(const user of [admin,employee])await f.prisma.incident.create({data:{incidentId:randomUUID(),title:`Incident for ${user.name}`,userId:user.id,userEmail:user.email,severity:'CRITICAL',status:'OPEN',riskScore:user.riskScore,contributingFactors:['SYNTHETIC_TEST_FIXTURE']}});
    for(const user of [admin,employee,manager])await f.prisma.auditLog.create({data:{companyId:'A',userId:user.id,userEmail:user.email,action:'MFA_SUCCESS',category:'MFA',severity:'INFO',details:'Synthetic dashboard fixture'}});
    const resource=await f.prisma.resource.create({data:{resourceId:randomUUID(),companyId:'A',name:'Synthetic approval test resource',departmentCode:'ENGINEERING'}});
    for(const user of [admin,employee])await f.prisma.accessRequest.create({data:{requestId:randomUUID(),userId:user.id,resourceId:resource.id,justification:'Synthetic dashboard fixture'}});

    const {default:routes}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const request=async(actor,path)=>{const response=await fetch(base+path,{headers:{Authorization:`Bearer ${generateJwtToken(actor,true)}`}});return{status:response.status,body:await response.json()};};

    const main=await request(f.admin,'/dashboard/summary');
    assert.equal(main.status,200);
    assert.deepEqual(new Set(main.body.administrators.map(user=>user.id)),new Set([f.admin.id,admin.id,systemAdmin.id]));
    assert.ok(main.body.administrators.every(user=>['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(user.roleCode)));
    assert.equal(main.body.summary.users,3);
    assert.equal(main.body.summary.highRiskUsers,1,'employee and manager risk must not affect administrator KPI');
    assert.equal(main.body.summary.restrictedAccounts,1);
    assert.equal(main.body.summary.pendingApprovals,1,'only the administrator pending request contributes');
    assert.equal(main.body.summary.criticalAlerts,1,'employee incident must not affect administrator KPI');
    assert.ok(main.body.administrators.some(user=>user.id===admin.id&&user.riskScore===72&&user.trustScore===59&&user.trustState==='SENSITIVE_APPROVAL_REQUIRED'&&user.status==='ACTIVE'&&user.sessionState==='ACTIVE'&&user.lastLoginAt));
    assert.ok(main.body.administrators.some(user=>user.id===admin.id&&user.assessmentStatus==='ASSESSED'));
    assert.ok(main.body.administrators.some(user=>user.id===systemAdmin.id&&user.trustState==='FRESH_MFA_REQUIRED'&&user.sessionState==='INACTIVE'));
    assert.ok(main.body.administrators.some(user=>user.id===f.admin.id&&user.riskScore===null&&user.trustScore===null&&user.trustState==='NOT_ASSESSED'));
    assert.deepEqual(new Set(main.body.departments.map(row=>row.name)),new Set(['SECURITY','IT','ENGINEERING']));
    assert.equal(main.body.authenticationActivity.length,1);
    assert.ok(main.body.authenticationActivity.every(event=>['AUTH_LOGIN','AUTH_FAILED','MFA_SUCCESS','MFA_FAILED'].includes(event.eventType)));
    assert.ok(main.body.alerts.every(event=>event.userName!=='Employee Must Stay Hidden'&&event.userName!=='Manager Must Stay Hidden'));
    assert.ok(main.body.incidents.every(incident=>incident.userName!=='Employee Must Stay Hidden'&&incident.userName!=='Manager Must Stay Hidden'));
    const responseText=JSON.stringify(main.body);
    assert.equal(responseText.includes('Employee Must Stay Hidden'),false);
    assert.equal(responseText.includes('Manager Must Stay Hidden'),false);
    assert.equal(responseText.includes('employee-hidden@test.invalid'),false);
    assert.equal(responseText.includes('manager-hidden@test.invalid'),false);

    const distribution=await request(f.admin,'/dashboard/risk-distribution');
    assert.equal(distribution.body.distribution.reduce((sum,row)=>sum+row._count._all,0),2,'unassessed registration is excluded from risk distribution');
    assert.equal(distribution.body.distribution.find(row=>row.riskLevel==='CRITICAL')?._count._all||0,0,'employee and manager critical risk must not appear');
    const trends=await request(f.admin,'/dashboard/risk-trends');
    assert.ok(trends.body.history.every(row=>[f.admin.id,admin.id,systemAdmin.id].includes(row.userId)));
    assert.equal(trends.body.history.length,2);
    const alertSection=await request(f.admin,'/dashboard/recent-alerts');
    assert.ok(alertSection.body.incidents.every(row=>![employee.id,manager.id].includes(row.userId)));

    const assignedAdmin=await request(admin,'/dashboard/summary');
    assert.equal(assignedAdmin.status,200);
    assert.deepEqual(assignedAdmin.body.administrators.map(user=>user.id),[admin.id]);
    assert.equal(JSON.stringify(assignedAdmin.body).includes('Employee Must Stay Hidden'),false);
    const foreign=await request(f.otherAdmin,'/dashboard/summary');
    assert.equal(foreign.status,200);
    assert.deepEqual(foreign.body.administrators.map(user=>user.id),[f.otherAdmin.id]);
    assert.equal(JSON.stringify(foreign.body).includes(admin.email),false);

    const employeeMonitoring=await request(admin,'/users');
    assert.equal(employeeMonitoring.status,200);
    assert.deepEqual(new Set(employeeMonitoring.body.users.map(user=>user.id)),new Set([employee.id,manager.id]));
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    const {sseManager}=await import('../services/sse.js');for(const client of sseManager.clients)client.end();
    await f.close();
  }
});

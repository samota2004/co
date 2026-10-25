import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {deviceFixture} from './device-fixture.js';

test('deleted staff and administrators stay removed after fresh list requests', {timeout:60000},async()=>{
  const f=await deviceFixture();let server;
  try{
    const {default:routes}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const call=async(path,method='GET',actor=f.admin,body={})=>{
      const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+generateJwtToken(actor,true),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
      return{status:response.status,data:await response.json()};
    };
    const history=await f.prisma.activityEvent.create({data:{eventId:randomUUID(),userId:f.employee.id,userEmail:f.employee.email,userRole:'EMPLOYEE',type:'APPLICATION_USAGE',ip:'127.0.0.1',location:'Deletion test'}});
    assert.equal((await call('/users/'+f.employee.id,'DELETE')).status,200);
    for(let reload=0;reload<2;reload++)assert.ok(!(await call('/users')).data.users.some(u=>u.id===f.employee.id));
    assert.ok((await f.prisma.user.findUnique({where:{id:f.employee.id}})).deletedAt);
    assert.ok(await f.prisma.activityEvent.findUnique({where:{id:history.id}}));
    assert.equal((await call('/users/'+f.employee.id)).status,404);
    assert.equal((await call('/users/'+f.employee.id+'/unfreeze','POST',f.admin,{reason:'Verify deleted account remains unavailable'})).status,404);
    assert.ok((await call('/users')).data.users.some(u=>u.id===f.disabled.id),'An ordinary disabled account is not treated as deleted');

    await f.prisma.role.create({data:{code:'MANAGER',name:'Manager'}});
    const manager=await f.prisma.user.create({data:{employeeId:randomUUID(),name:'Delete manager fixture',email:randomUUID()+'@test.invalid',companyId:'A',roleCode:'MANAGER',assignedAdminId:f.admin.id}});
    await f.prisma.user.update({where:{id:f.employee2.id},data:{managerId:manager.id}});
    assert.equal((await call('/users/'+manager.id,'DELETE')).status,200);
    assert.ok(!(await call('/users')).data.users.some(u=>u.id===manager.id));
    assert.equal((await f.prisma.user.findUnique({where:{id:f.employee2.id}})).managerId,null);
    assert.ok((await call('/users')).data.users.some(u=>u.id===f.employee2.id));

    const admin=await f.prisma.user.create({data:{employeeId:randomUUID(),name:'Delete admin fixture',email:randomUUID()+'@test.invalid',companyId:'A',roleCode:'SECURITY_ADMIN'}});
    await f.prisma.user.update({where:{id:f.employee2.id},data:{assignedAdminId:admin.id}});
    assert.equal((await call('/admins/'+admin.id,'DELETE',f.otherAdmin)).status,403);
    assert.equal((await call('/admins/'+admin.id,'DELETE')).status,200);
    for(let reload=0;reload<2;reload++)assert.ok(!(await call('/admins')).data.admins.some(u=>u.id===admin.id));
    assert.equal((await f.prisma.user.findUnique({where:{id:f.employee2.id}})).assignedAdminId,null);
    assert.equal((await call('/users','GET',admin)).status,401);
    assert.equal((await call('/admins/'+f.admin.id,'DELETE')).status,403);

    // Reusing deleted identifiers creates a new identity, never restores access/history.
    const managerInput={name:manager.name,email:manager.email,employeeId:manager.employeeId,roleCode:'MANAGER',departmentCode:'ENGINEERING',assignedAdminId:f.admin.id};
    const replacement=await call('/users','POST',f.admin,managerInput);
    assert.equal(replacement.status,200,JSON.stringify(replacement.data));
    assert.notEqual(replacement.data.user.id,manager.id);
    const employeeInput={name:f.employee.name,email:f.employee.email,employeeId:f.employee.employeeId,roleCode:'EMPLOYEE',departmentCode:'ENGINEERING',managerId:replacement.data.user.id};
    const newEmployee=await call('/users','POST',f.admin,employeeInput);
    assert.equal(newEmployee.status,200,JSON.stringify(newEmployee.data));
    assert.notEqual(newEmployee.data.user.id,f.employee.id);
    assert.equal((await f.prisma.activityEvent.findUnique({where:{id:history.id}})).userId,f.employee.id);
    assert.equal((await f.prisma.user.findUnique({where:{id:f.employee.id}})).status,'DISABLED');
    assert.equal((await call('/users','POST',f.admin,managerInput)).status,409,'Live duplicates remain blocked');
    assert.equal((await call('/users','POST',f.admin,{...managerInput,email:f.disabled.email,employeeId:randomUUID()})).status,409,'Disabled but undeleted accounts retain identifiers');
    const restoredAdmin=await call('/admins','POST',f.admin,{name:admin.name,email:admin.email,roleCode:'SECURITY_ADMIN',password:randomUUID()});
    assert.equal(restoredAdmin.status,200,JSON.stringify(restoredAdmin.data));
    assert.notEqual(restoredAdmin.data.admin.id,admin.id);
    assert.equal((await call('/users','GET',admin)).status,401,'Old admin credentials stay invalid');
    const archiveAudit=await f.prisma.auditLog.findFirst({where:{userId:manager.id,action:'ACCOUNT_IDENTIFIERS_ARCHIVED'}});
    assert.equal(archiveAudit.metadata.originalEmail,manager.email);
    assert.equal(archiveAudit.metadata.originalEmployeeId,manager.employeeId);
    const freshUsers=(await call('/users')).data.users;
    assert.ok(freshUsers.some(u=>u.id===replacement.data.user.id));
    assert.ok(!freshUsers.some(u=>u.id===manager.id));
    // A failed create must not modify the deleted row whose email it tried to reuse.
    const archived=await f.prisma.user.create({data:{employeeId:randomUUID(),name:'Archived rollback',email:randomUUID()+'@test.invalid',companyId:'A',roleCode:'EMPLOYEE',status:'DISABLED',deletedAt:new Date()}});
    assert.equal((await call('/users','POST',f.admin,{...managerInput,email:archived.email})).status,409);
    assert.equal((await f.prisma.user.findUnique({where:{id:archived.id}})).email,archived.email);
    const foreignArchived=await f.prisma.user.create({data:{employeeId:randomUUID(),name:'Other company archive',email:randomUUID()+'@test.invalid',companyId:'B',roleCode:'EMPLOYEE',status:'DISABLED',deletedAt:new Date()}});
    assert.equal((await call('/users','POST',f.admin,{...managerInput,email:foreignArchived.email,employeeId:randomUUID()})).status,409);
    assert.equal((await f.prisma.user.findUnique({where:{id:foreignArchived.id}})).email,foreignArchived.email);

    // Upgrade existing disabled records only when their audit trail records Delete.
    const legacy=await f.prisma.user.create({data:{employeeId:randomUUID(),name:'Previously deleted',email:randomUUID()+'@test.invalid',companyId:'A',roleCode:'EMPLOYEE',status:'DISABLED'}});
    await f.prisma.auditLog.create({data:{companyId:'A',userId:legacy.id,action:'ACCOUNT_RESTRICTED',category:'ACCOUNT',severity:'INFO',details:'Legacy deletion fixture',metadata:{status:'DISABLED'}}});
    const migration=await readFile(new URL('../../prisma/migrations/20261011093000_persistent_account_deletion/migration.sql',import.meta.url),'utf8');
    for(const statement of migration.split(';').slice(1).map(s=>s.trim()).filter(Boolean))await f.prisma.$executeRawUnsafe(statement);
    assert.ok((await f.prisma.user.findUnique({where:{id:legacy.id}})).deletedAt);
    assert.equal((await f.prisma.user.findUnique({where:{id:f.disabled.id}})).deletedAt,null);
    assert.ok(!(await call('/users')).data.users.some(u=>u.id===legacy.id));
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await f.close();
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyUnixAccountControl,UnixAccounts} from '../src/unix-account-control.js';
import {reconcileAccountControl} from '../src/account-control.js';

const deviceId='00000000-0000-4000-8000-000000000001';
function fixture(platform='linux') {
  let journal=null,calls=[];
  const employee={uid:1001,name:'employee',admin:false,local:true,interactive:true,disabled:false,expiry:'22000',locked:false,fingerprint:'original'};
  const recovery={uid:1002,name:'recovery',admin:true,local:true,interactive:true,disabled:false};
  const accounts={inspect:async uid=>({...uid===1001?employee:recovery}),
    block:async()=>{calls.push('block');Object.assign(employee,{disabled:true,locked:true,expiry:'1',fingerprint:'blocked'});},
    allow:async(user,before)=>{calls.push('allow');Object.assign(employee,{disabled:false,locked:false,expiry:before.expiry,fingerprint:'original'});},
    endSessions:async()=>{calls.push('logoff');return true;}};
  const request={action:'BLOCK',deviceId,employeeIdentity:'uid:1001',recoveryAdminIdentity:'uid:1002',stateDirectory:process.cwd()};
  const options={platform,root:()=>true,accounts,read:async()=>structuredClone(journal),write:async(_,value)=>{journal=structuredClone(value);}};
  return {request,options,employee,recovery,calls,get journal(){return journal;},set journal(value){journal=value;},run(action){return applyUnixAccountControl({...request,action},options);}};
}
for(const platform of ['linux','darwin']) {
  test(`${platform}: agent-owned block/logoff persists, repeated block is idempotent, unfreeze restores previous expiry`,async()=>{
    const f=fixture(platform);
    assert.equal((await f.run('BLOCK')).code,'BLOCKED');assert.equal(f.journal.phase,'BLOCKED');
    assert.equal((await f.run('BLOCK')).code,'BLOCKED');assert.deepEqual(f.calls,['block','logoff','logoff']);
    assert.equal((await f.run('ALLOW')).code,'ALLOWED');assert.equal(f.journal,null);assert.equal(f.employee.expiry,'22000');
    assert.equal((await f.run('ALLOW')).code,'ALLOWED');assert.equal(f.calls.filter(x=>x==='allow').length,1);
  });
  test(`${platform}: never enables an externally disabled, changed, or partially journaled account`,async()=>{
    let f=fixture(platform);f.employee.disabled=true;
    for(const action of ['BLOCK','ALLOW'])assert.equal((await f.run(action)).code,'EXTERNALLY_DISABLED');
    assert.deepEqual(f.calls,[]);
    for(const change of [state=>state.phase='PREPARED',state=>state.deviceId='other',state=>state.employeeIdentity='uid:9000',state=>state.blockedFingerprint='different']) {
      f=fixture(platform);await f.run('BLOCK');change(f.journal);
      assert.equal((await f.run('ALLOW')).code,'RECOVERY_REQUIRED');assert.ok(!f.calls.includes('allow'));
    }
    f=fixture(platform);await f.run('BLOCK');f.employee.fingerprint='externally reset password';
    assert.equal((await f.run('ALLOW')).code,'RECOVERY_REQUIRED');
  });
  test(`${platform}: fails closed without root, a standard local employee, and an enabled recovery administrator`,async()=>{
    for(const change of [f=>f.options.root=()=>false,f=>f.employee.admin=true,f=>f.employee.local=false,f=>f.employee.interactive=false,f=>f.recovery.admin=false,f=>f.recovery.disabled=true,f=>f.request.recoveryAdminIdentity='uid:1001',f=>f.request.employeeIdentity='uid:0']) {
      const f=fixture(platform);change(f);
      assert.notEqual((await f.run('BLOCK')).code,'BLOCKED');assert.deepEqual(f.calls,[]);assert.equal(f.journal,null);
    }
  });
  test(`${platform}: unfinished logoff is reported, native failures do not leak output or grant access`,async()=>{
    const f=fixture(platform);f.options.accounts.endSessions=async()=>false;
    assert.equal((await f.run('BLOCK')).code,'LOGOFF_PENDING');
    f.options.accounts.allow=async()=>{throw new Error('sensitive native detail');};
    assert.equal((await f.run('ALLOW')).code,'RECOVERY_REQUIRED');assert.ok(f.journal);
  });
}
test('Unix control requires a fresh command for the enrolled UID before any native operation',async()=>{
  const f=fixture(),local={dataDirectory:process.cwd(),unixAccountControl:{enabled:true,employeeIdentity:'uid:1001',recoveryAdminIdentity:'uid:1002',recoveryLoginVerified:true}};
  const secrets={deviceId,mappedIdentity:'uid:1001'};
  for(const command of [undefined,{deviceId,identity:'uid:1002',action:'BLOCK',issuedAt:new Date().toISOString()},{deviceId,identity:'uid:1001',action:'BLOCK',issuedAt:new Date(0).toISOString()}])
    assert.match(await reconcileAccountControl(local,secrets,command,undefined,'linux'),/^refused:/);
  assert.match(await reconcileAccountControl(local,secrets,{deviceId,identity:'uid:1001',action:'HOLD',issuedAt:new Date().toISOString()},undefined,'darwin'),/^unchanged:/);
});
test('Linux native adapter locks password AND expires account; restore uses only saved expiry',async()=>{
  const calls=[],adapter=new UnixAccounts('linux',async(...args)=>{calls.push(args);return '';});
  await adapter.block({name:'employee'});await adapter.allow({name:'employee'},{expiry:'22000'});
  assert.deepEqual(calls,[['/usr/sbin/usermod',['--expiredate','1','--lock','employee']],['/usr/sbin/usermod',['--expiredate','22000','--unlock','employee']]]);
});
test('macOS native adapter uses per-user local policy, never a global login disable',async()=>{
  const calls=[],adapter=new UnixAccounts('darwin',async(...args)=>{calls.push(args);return '';});
  await adapter.block({name:'employee'});await adapter.allow({name:'employee'},{});
  assert.deepEqual(calls.map(x=>x[1]),[['-n','/Local/Default','-u','employee','-disableuser'],['-n','/Local/Default','-u','employee','-enableuser']]);
});

test('Linux inspection detects direct sudo grants and refuses an unavailable sudo-policy check',async()=>{
  const read=async file=>file==='/etc/passwd'?'employee:x:1001:1001::/home/employee:/bin/bash':'employee:$6$testhash:20000:0:99999:7:::';
  let directGrant=true;
  const run=async(file)=>{
    if(file==='/usr/bin/id')return 'employee';
    if(directGrant)return 'User employee may run the following commands on host:\n    (ALL : ALL) ALL';
    const e=new Error();e.code=1;e.stderr='User employee is not allowed to run sudo on host.';throw e;
  };
  const adapter=new UnixAccounts('linux',run,read);
  assert.equal((await adapter.inspect(1001)).admin,true);
  assert.equal((await adapter.inspect(1001)).recoveryCapable,true);
  directGrant=false;assert.equal((await adapter.inspect(1001)).admin,false);
  adapter.run=async()=>{throw new Error('sudo unavailable');};
  await assert.rejects(adapter.inspect(1001));
});
test('macOS inspection refuses mobile/SecureToken accounts and detects disabled local policy',async()=>{
  let attrs='AuthenticationAuthority: ;ShadowHash;\nUserShell: /bin/zsh',disabled=false;
  const adapter=new UnixAccounts('darwin',async(file,args)=>{
    if(file==='/usr/bin/id')return 'staff';
    if(file==='/usr/bin/pwpolicy')return disabled?'isDisabled=1':'isDisabled=0';
    return args[1]==='-list'?'employee 1001':attrs;
  });
  assert.equal((await adapter.inspect(1001)).local,true);
  disabled=true;assert.equal((await adapter.inspect(1001)).disabled,true);
  for(const marker of ['LocalCachedUser','SecureToken']) {
    attrs=`AuthenticationAuthority: ;${marker};\nUserShell: /bin/zsh`;
    assert.equal((await adapter.inspect(1001)).local,false);
  }
});

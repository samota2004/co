import {test} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {acknowledgeAdminCommand,acknowledgeStopCommand,administrativeStopState,pendingAdminCommandReport,pendingStopReport,receiveAdminCommand,receiveStopCommand} from '../src/remote-stop.js';

test('remote Windows stop command is device-bound, short-lived, persistent and replay-safe',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-stop-'));
  try{
    const secrets={deviceId:randomUUID(),mappedIdentity:'S-1-5-21-10-20-30-1001'},now=Date.now();
    const command={commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,action:'STOP_AGENT',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};
    assert.equal((await receiveStopCommand(directory,{...secrets,deviceId:randomUUID()},command,now)).accepted,false,'another device cannot consume it');
    assert.equal((await receiveStopCommand(directory,secrets,{...command,expiresAt:new Date(now-1).toISOString()},now)).accepted,false,'expired command rejected');
    const received=await receiveStopCommand(directory,secrets,command,now);assert.equal(received.accepted,true);assert.equal(received.report.resultCode,'STOP_ACCEPTED');
    assert.equal(received.adminStopped,true);
    assert.deepEqual(await pendingStopReport(directory,now+1000),received.report,'restart preserves the pending receipt');
    assert.equal((await receiveStopCommand(directory,secrets,command,now+1000)).accepted,true,'same pending receipt is idempotent');
    assert.equal(await acknowledgeStopCommand(directory,command.commandId),true);
    assert.equal(await pendingStopReport(directory,now+2000),null);
    assert.equal(await administrativeStopState(directory),true,'acknowledgement clears only the receipt, not the durable admin stop');
    assert.equal(await administrativeStopState(directory),true,'a new service process reads the durable stop state after reboot');
    assert.equal((await receiveStopCommand(directory,secrets,command,now+2000)).accepted,false,'acknowledged command cannot replay');
    assert.equal(await acknowledgeStopCommand(directory,randomUUID()),false);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('administrator resume clears persistent stop only for a fresh device-bound command and rejects replay/expiry',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-resume-'));
  try{
    const secrets={deviceId:randomUUID(),mappedIdentity:'S-1-5-21-10-20-30-1001'},now=Date.now();
    const stop={commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,action:'STOP_AGENT',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};
    assert.equal((await receiveAdminCommand(directory,secrets,stop,now)).adminStopped,true);
    await acknowledgeAdminCommand(directory,stop.commandId);
    const resume={...stop,commandId:randomUUID(),action:'START_AGENT',issuedAt:new Date(now+1000).toISOString(),expiresAt:new Date(now+121000).toISOString()};
    assert.equal((await receiveAdminCommand(directory,{...secrets,deviceId:randomUUID()},resume,now+1000)).accepted,false,'a different device cannot resume it');
    assert.equal((await receiveAdminCommand(directory,secrets,{...resume,expiresAt:new Date(now+500).toISOString()},now+1000)).accepted,false,'expired resume does not change state');
    assert.equal(await administrativeStopState(directory),true);
    const resumed=await receiveAdminCommand(directory,secrets,resume,now+1000);
    assert.equal(resumed.accepted,true);assert.equal(resumed.adminStopped,false);assert.equal(resumed.report.resultCode,'START_ACCEPTED');
    assert.equal((await receiveAdminCommand(directory,secrets,resume,now+2000)).accepted,true,'duplicate delivery of the current pending command is idempotent');
    const ack=await acknowledgeAdminCommand(directory,resume.commandId);assert.deepEqual(ack,{accepted:true,adminStopped:false});
    assert.equal(await administrativeStopState(directory),false,'resume persists across subsequent service start');
    assert.equal((await receiveAdminCommand(directory,secrets,resume,now+3000)).accepted,false,'consumed resume cannot be replayed');
    const laterStop={...stop,commandId:randomUUID(),issuedAt:new Date(now+4000).toISOString(),expiresAt:new Date(now+124000).toISOString()};
    await receiveAdminCommand(directory,secrets,laterStop,now+4000);
    const badResume={...resume,commandId:randomUUID(),issuedAt:new Date(now+5000).toISOString(),expiresAt:new Date(now+125000).toISOString()};
    const replacement=await receiveAdminCommand(directory,secrets,badResume,now+5000);
    assert.equal(replacement.accepted,true,'a new authenticated administrator command supersedes an older pending transition');
    assert.equal(await administrativeStopState(directory),false);
    assert.equal((await pendingAdminCommandReport(directory,now+5000)).resultCode,'START_ACCEPTED');
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {acknowledgeStopCommand,pendingStopReport,receiveStopCommand} from '../src/remote-stop.js';

test('remote Windows stop command is device-bound, short-lived, persistent and replay-safe',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-stop-'));
  try{
    const secrets={deviceId:randomUUID(),mappedIdentity:'S-1-5-21-10-20-30-1001'},now=Date.now();
    const command={commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,action:'STOP_AGENT',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};
    assert.equal((await receiveStopCommand(directory,{...secrets,deviceId:randomUUID()},command,now)).accepted,false,'another device cannot consume it');
    assert.equal((await receiveStopCommand(directory,secrets,{...command,expiresAt:new Date(now-1).toISOString()},now)).accepted,false,'expired command rejected');
    const received=await receiveStopCommand(directory,secrets,command,now);assert.equal(received.accepted,true);assert.equal(received.report.resultCode,'STOP_ACCEPTED');
    assert.deepEqual(await pendingStopReport(directory,now+1000),received.report,'restart preserves the pending receipt');
    assert.equal((await receiveStopCommand(directory,secrets,command,now+1000)).accepted,true,'same pending receipt is idempotent');
    assert.equal(await acknowledgeStopCommand(directory,command.commandId),true);
    assert.equal(await pendingStopReport(directory,now+2000),null);
    assert.equal((await receiveStopCommand(directory,secrets,command,now+2000)).accepted,false,'acknowledged command cannot replay');
    assert.equal(await acknowledgeStopCommand(directory,randomUUID()),false);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

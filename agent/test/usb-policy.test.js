import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {classifyUsbDevice,DEFAULT_USB_POLICY,validateUsbPolicy,signUsbPolicyCommand,receiveUsbPolicyCommand,acknowledgeUsbPolicyCommand,persistedUsbPolicy,reapplyPersistedUsbPolicy} from '../src/usb-policy.js';

test('Windows USB classifier keeps input devices outside storage policy categories',()=>{
  assert.equal(classifyUsbDevice({pnpDeviceId:'USB\\VID_1234',classGuid:'{4d36e967-e325-11ce-bfc1-08002be10318}'}),'USB_STORAGE');
  assert.equal(classifyUsbDevice({pnpDeviceId:'USB\\VID_1234',classGuid:'eec5ad98-8080-425f-922a-dabf3de3f69a'}),'PORTABLE_DEVICE');
  assert.equal(classifyUsbDevice({pnpDeviceId:'USB\\VID_1234',classGuid:'4d36e965-e325-11ce-bfc1-08002be10318'}),'CD_DVD');
  assert.equal(classifyUsbDevice({pnpDeviceId:'USB\\VID_1234',classGuid:'4d36e96b-e325-11ce-bfc1-08002be10318'}),'KEYBOARD');
  assert.equal(classifyUsbDevice({pnpDeviceId:'USB\\VID_1234',classGuid:'4d36e96f-e325-11ce-bfc1-08002be10318'}),'MOUSE');
  assert.equal(classifyUsbDevice({pnpDeviceId:'USB\\VID_1234',classGuid:'745a17a0-74d3-11d0-b6fe-00a0c90f57da'}),'HID_PERIPHERAL');
  assert.equal(classifyUsbDevice({pnpDeviceId:'PCI\\VID_1234',classGuid:'4d36e967-e325-11ce-bfc1-08002be10318'}),'OTHER');
});

test('authenticated USB policy survives acknowledgement and is reapplied after service restart',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-usb-restart-'));
  try{
    const credential=randomBytes(32).toString('base64url'),secrets={credential,deviceId:randomUUID(),mappedIdentity:'S-1-5-21-1-2-3-1001'},key=createHash('sha256').update(credential).digest();
    const policy={storage:'BLOCK',portable:'ALLOW',optical:'BLOCK'};
    const command={action:'SET_USB_POLICY',commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,issuedAt:new Date(100000).toISOString(),expiresAt:new Date(130000).toISOString(),policy};command.signature=signUsbPolicyCommand(key,command);
    const applied=await receiveUsbPolicyCommand(dir,secrets,command,async()=>({status:'POLICY_APPLIED_UNVERIFIED'}),110000);
    assert.equal(applied.accepted,true);
    assert.equal(await acknowledgeUsbPolicyCommand(dir,command.commandId),true);
    let calls=0;
    const restarted=await reapplyPersistedUsbPolicy(dir,async received=>{calls++;assert.deepEqual(received,policy);return{status:'POLICY_APPLIED_UNVERIFIED'};});
    assert.equal(calls,1);assert.equal(restarted.applied,true);assert.equal(restarted.status,'POLICY_APPLIED_UNVERIFIED');
    assert.deepEqual(await persistedUsbPolicy(dir),{policy,commandId:command.commandId});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('pre-existing version-one policy state remains readable and failed startup reapply remains unverified',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-usb-legacy-'));
  try{
    const policy={storage:'ALLOW',portable:'BLOCK',optical:'ALLOW'};
    await fs.writeFile(path.join(dir,'usb-policy-command.json'),JSON.stringify({version:1,seen:['legacy-command'],pending:null}));
    assert.equal((await persistedUsbPolicy(dir)),null);
    const noPolicy=await reapplyPersistedUsbPolicy(dir,async()=>{throw new Error('must not run');});
    assert.deepEqual(noPolicy,{applied:false,status:'NO_POLICY'});
    const credential=randomBytes(32).toString('base64url'),secrets={credential,deviceId:randomUUID(),mappedIdentity:'S-1-5-21-1-2-3-1001'},key=createHash('sha256').update(credential).digest();
    const command={action:'SET_USB_POLICY',commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,issuedAt:new Date(100000).toISOString(),expiresAt:new Date(130000).toISOString(),policy};command.signature=signUsbPolicyCommand(key,command);
    await receiveUsbPolicyCommand(dir,secrets,command,async()=>({status:'POLICY_APPLIED_UNVERIFIED'}),110000);
    const failed=await reapplyPersistedUsbPolicy(dir,async()=>{throw new Error('simulated native helper failure');});
    assert.equal(failed.status,'POLICY_FAILED');
    assert.deepEqual((await persistedUsbPolicy(dir)).policy,policy,'a transient reapply error does not erase the authenticated desired policy');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('USB policy command is device-bound, expiring, replay-protected and acknowledged',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-usb-policy-'));
  try{
    assert.deepEqual(DEFAULT_USB_POLICY,{storage:'ALLOW',portable:'ALLOW',optical:'ALLOW'});
    assert.throws(()=>validateUsbPolicy({storage:'BLOCK',portable:'ALLOW',optical:'ALLOW',input:'BLOCK'}));
    const credential=randomBytes(32).toString('base64url'),secrets={credential,deviceId:randomUUID(),mappedIdentity:'S-1-5-21-1-2-3-1001'},key=createHash('sha256').update(credential).digest();
    const command={action:'SET_USB_POLICY',commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,issuedAt:new Date(100000).toISOString(),expiresAt:new Date(130000).toISOString(),policy:{storage:'BLOCK',portable:'ALLOW',optical:'ALLOW'}};
    command.signature=signUsbPolicyCommand(key,command);
    let applications=0;
    const apply=async policy=>{applications++;assert.equal(policy.storage,'BLOCK');return{status:'POLICY_APPLIED_UNVERIFIED'};};
    const accepted=await receiveUsbPolicyCommand(dir,secrets,command,apply,110000);
    assert.equal(accepted.accepted,true);assert.equal(accepted.report.resultCode,'POLICY_APPLIED_UNVERIFIED');assert.equal(applications,1);
    const duplicate=await receiveUsbPolicyCommand(dir,secrets,command,apply,111000);
    assert.equal(duplicate.accepted,true);assert.equal(applications,1,'pending duplicate returns same report and does not reapply');
    const tampered={...command,commandId:randomUUID(),policy:{storage:'ALLOW',portable:'ALLOW',optical:'ALLOW'}};
    assert.equal((await receiveUsbPolicyCommand(dir,secrets,tampered,apply,111000)).reason,'invalid_signature');
    assert.equal(await acknowledgeUsbPolicyCommand(dir,command.commandId),true);
    const replay=await receiveUsbPolicyCommand(dir,secrets,command,apply,112000);assert.equal(replay.accepted,false);
    assert.equal((await receiveUsbPolicyCommand(dir,{...secrets,deviceId:randomUUID()},command,apply,112000)).accepted,false);
    assert.equal((await receiveUsbPolicyCommand(dir,secrets,{...command,commandId:randomUUID()},apply,131000)).accepted,false);
    const allowCommand={action:'SET_USB_POLICY',commandId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,issuedAt:new Date(140000).toISOString(),expiresAt:new Date(170000).toISOString(),policy:{storage:'ALLOW',portable:'BLOCK',optical:'ALLOW'}};allowCommand.signature=signUsbPolicyCommand(key,allowCommand);
    const allowed=await receiveUsbPolicyCommand(dir,secrets,allowCommand,async received=>{assert.deepEqual(received,allowCommand.policy);return{status:'POLICY_APPLIED_UNVERIFIED'};},150000);
    assert.equal(allowed.accepted,true);assert.equal(allowed.report.resultCode,'POLICY_APPLIED_UNVERIFIED','ALLOW/BLOCK combinations share the same honest verification state');
    const failedCommand={...allowCommand,commandId:randomUUID(),issuedAt:new Date(160000).toISOString(),expiresAt:new Date(190000).toISOString()};failedCommand.signature=signUsbPolicyCommand(key,failedCommand);
    const failed=await receiveUsbPolicyCommand(dir,secrets,failedCommand,async()=>({status:'POLICY_FAILED'}),170000);
    assert.equal(failed.report.resultCode,'POLICY_FAILED');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Windows policy helper scopes writes to removable storage class GUIDs only',async()=>{
  const source=await fs.readFile(new URL('../native/windows-usb-policy.ps1',import.meta.url),'utf8');
  assert.match(source,/RemovableStorageDevices/);
  assert.match(source,/53f5630d-b6bf-11d0-94f2-00a0c91efb8b/);
  assert.match(source,/6ac27878-a6fa-4155-ba85-f98f491d4f33/i);
  assert.match(source,/53f56308-b6bf-11d0-94f2-00a0c91efb8b/);
  assert.match(source,/supportedEditions/,'unsupported Windows editions fail closed before policy writes');
  assert.match(source,/CurrentBuildNumber/);assert.match(source,/\$ubr\s+-ge\s+1202/,'documented Windows 10 servicing prerequisite is checked');
  assert.match(source,/\$build\s+-ge\s+22000/,'Windows 11 supported build floor is checked');
  assert.doesNotMatch(source,/4d36e96b-e325-11ce-bfc1-08002be10318/i,'keyboard class is not touched by storage-only policy');
  assert.doesNotMatch(source,/4d36e96f-e325-11ce-bfc1-08002be10318/i,'mouse class is not touched by storage-only policy');
  assert.match(source,/POLICY_APPLIED_UNVERIFIED/,'registry match is not represented as proven device blocking');
});

test('manual Windows USB probe is standard-user-only and performs bounded non-destructive access checks',async()=>{
  const source=await fs.readFile(new URL('./windows-usb-access.integration.ps1',import.meta.url),'utf8');
  assert.match(source,/IsInRole\(\[Security\.Principal\.WindowsBuiltInRole\]::Administrator\)/,'elevated runs are rejected');
  assert.match(source,/\[string\]\$disk\.BusType\s+-ne\s+'USB'/,'selected medium must be identified as USB');
  assert.match(source,/FileSystemLabel -cne 'CYBERORBIT-USB-TEST'/,'only the explicitly labeled disposable volume is accepted');
  assert.match(source,/Get-ChildItem/);assert.match(source,/ReadAllText/);assert.match(source,/WriteAllText/);
  assert.doesNotMatch(source,/Set-ItemProperty|New-ItemProperty|Remove-ItemProperty|gpupdate|Disable-PnpDevice/,'probe never changes Windows policy or disables hardware');
  assert.match(source,/CYBERORBIT-USB-TEST-\[0-9a-f\]/,'probe only removes uniquely named test markers');
});

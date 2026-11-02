import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=relative=>fs.readFile(new URL(relative,root),'utf8');

test('Windows standard-user service ACL remains query-only and install/update preserve the same boundary',async()=>{
  const [install,startup,update]=await Promise.all(['packaging/windows/install.ps1','packaging/windows/configure-startup.ps1','packaging/windows/update-installed.ps1'].map(read));
  for(const source of [install,startup])assert.match(source,/D:P\(A;;0xF01FF;;;SY\)\(A;;0xF01FF;;;BA\)\(A;;0x2008D;;;BU\)/);
  assert.doesNotMatch(update,/sc\.exe\s+sdset|Set-Acl/i,'in-place updates do not replace service or filesystem ACLs');
  assert.match(install,/Run in an elevated PowerShell prompt/);
});

test('Windows uninstaller requests Main Admin authorization before destructive operations and verifies a device grant',async()=>{
  const source=await read('packaging/windows/uninstall.ps1');
  const request=source.indexOf('request-uninstall'),admin=source.indexOf('IsInRole'),consume=source.indexOf('consume-local-operation-grant'),serviceStop=source.indexOf('Stop-Service CyberOrbitAgent'),complete=source.indexOf('complete-local-operation'),remove=source.indexOf('Remove-Item -LiteralPath $installRoot');
  const taskRemoval=source.indexOf("Unregister-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor'");
  assert.ok(request>=0&&request<serviceStop,'without a grant, script only submits a request and exits');
  assert.ok(admin<consume&&consume<serviceStop&&serviceStop<complete&&complete<taskRemoval&&taskRemoval<remove,'grant validation precedes service stop; server credential revocation follows confirmed stop and precedes task/file removal');
  assert.match(source,/local-operation-grant\.json/);
  assert.match(source,/PurgeData/);
});

test('the Windows agent management request is a signed local IPC request and updater includes its runtime closure',async()=>{
  const [cli,service,client,auth,updater,scheduler]=await Promise.all(['src/cli.js','src/service.js','src/local-operation-client.js','src/local-operation-auth.js','packaging/windows/update-installed.ps1','native/windows-uninstall-schedule.ps1'].map(read));
  assert.match(cli,/request-stop/);assert.match(cli,/request-uninstall/);
  assert.match(client,/sendSample/);assert.match(service,/local-operation-request/);assert.match(service,/verify|persistVerifiedLocalOperationGrant/);
  for(const file of ['src/local-operation-auth.js','src/local-operation-client.js','native/windows-uninstall-schedule.ps1','packaging/windows/request-operation.ps1'])assert.ok(updater.includes(`'${file}'`),`${file} is in update allowlist`);
  assert.match(scheduler,/S-1-5-18/);assert.match(scheduler,/AGENT_UNINSTALL/);assert.match(scheduler,/SetSecurityDescriptor/);
  assert.doesNotMatch(`${cli}\n${service}\n${client}\n${scheduler}`,/Main Admin password|adminPassword|password.*prompt/i);
  assert.match(auth,/clearLocalOperationGrant/);assert.match(service,/clearLocalOperationGrant\(local\.dataDirectory\)/,'a consumed service-stop grant is removed before the service exits');
});

test('Main Admin UI uses the protected authorization review endpoint and surfaces fresh-MFA errors',async()=>{
  const page=await fs.readFile(new URL('../client/src/pages/AdminManagementPage.jsx',root),'utf8');
  assert.match(page,/local-operation-requests/);assert.match(page,/decision,reason/);assert.match(page,/Approve/);assert.match(page,/Reject/);assert.match(page,/getErrorMessage/);
});

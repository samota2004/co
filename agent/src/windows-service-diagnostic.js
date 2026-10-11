// Runs once under LocalSystem during an administrator-authorized code update.
// stdout/stderr from credential helpers never reach the report or console.
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec, powershell, nativeInput } from './native.js';
const [configFile, reportFile] = process.argv.slice(2);
const report = { context: {}, access: {}, original: {}, fixed: {} };
const failure = e => ({ ok: false, helper: e.helper || 'vault.ps1', exitCode: Number.isInteger(e.exitCode) ? e.exitCode : null, category: e.category || (['EACCES','EPERM'].includes(e.code) ? 'FILE_ACCESS' : 'INPUT_INVALID') });
try {
  const policyScript = "$system=([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq 'S-1-5-18'); @{system=$system;effectivePolicy=[string](Get-ExecutionPolicy);policies=@(Get-ExecutionPolicy -List | ForEach-Object {@{scope=[string]$_.Scope;policy=[string]$_.ExecutionPolicy}})} | ConvertTo-Json -Compress -Depth 4";
  report.context = JSON.parse((await exec(powershell,['-NoProfile','-NonInteractive','-Command',policyScript],{windowsHide:true,timeout:15000,maxBuffer:8192})).stdout);
  const config = JSON.parse((await fs.readFile(configFile,'utf8')).replace(/^\uFEFF/,''));
  const blob = await fs.readFile(path.join(config.dataDirectory,'credential.dpapi'),'utf8');
  report.access = { configReadable: true, credentialReadable: true };
  for (const [name, policyOverride] of [['original',false],['fixed',true]]) {
    try {
      const decoded = JSON.parse(await nativeInput('vault.ps1',{action:'unprotect',value:blob},{policyOverride}));
      const valid = /^[0-9a-f-]{36}$/i.test(decoded.deviceId) && /^[A-Za-z0-9_-]{43}$/.test(decoded.credential) && typeof decoded.queueKey==='string' && Buffer.from(decoded.queueKey,'base64').length===32;
      report[name].vault = { ok: valid, helper: 'vault.ps1', exitCode: 0, category: valid?'OK':'INPUT_INVALID' };
      if (valid) report.deviceId = decoded.deviceId;
    } catch(e) { report[name].vault = failure(e); }
  }
  if (report.fixed.vault.ok) {
    try { JSON.parse(await nativeInput('windows-snapshot.ps1',{processes:true,sessions:true,usb:true})); report.fixed.snapshot = {ok:true,helper:'windows-snapshot.ps1',exitCode:0,category:'OK'}; }
    catch(e) { report.fixed.snapshot = failure(e); }
  }
} catch(e) { report.failure = failure(e); }
await fs.writeFile(reportFile+'.tmp',JSON.stringify(report),{mode:0o600});
await fs.rename(reportFile+'.tmp',reportFile);

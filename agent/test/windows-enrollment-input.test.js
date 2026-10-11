import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { powershell } from '../src/native.js';

function inputCheck(input, fromClipboard) {
  // Do not read/replace the user's real clipboard or open an interactive prompt.
  // Exercise the actual installer helper with controlled host/clipboard input.
  const helper = process.env.CYBERORBIT_TEST_AGENT_ROOT
    ? path.join(process.env.CYBERORBIT_TEST_AGENT_ROOT,'packaging/windows/enrollment-input.ps1')
    : fileURLToPath(new URL('../packaging/windows/enrollment-input.ps1',import.meta.url));
  const script = "$ErrorActionPreference='Stop'; function Get-Clipboard {param([switch]$Raw,[string]$ErrorAction);[Console]::In.ReadToEnd()}; function Read-Host {param([string]$Prompt,[switch]$AsSecureString);ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force}; . $env:CYBERORBIT_TEST_INPUT_HELPER; try {$s=Read-CyberOrbitEnrollmentToken -FromClipboard:($env:CYBERORBIT_TEST_CLIPBOARD -eq 'true');$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try {$t=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p).Trim();@{length=$t.Length;valid=($t -cmatch '^[A-Za-z0-9_-]{43}$')} | ConvertTo-Json -Compress}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p);$s.Dispose();$t=$null}}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 1}";
  return new Promise((resolve,reject) => {
    const child=spawn(powershell,['-NoProfile','-NonInteractive','-Command',script],{
      windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,CYBERORBIT_TEST_INPUT_HELPER:helper,CYBERORBIT_TEST_CLIPBOARD:String(fromClipboard)},
    });
    let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('Windows input check timed out'));},10000);
    child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
    child.stdin.end(input);
  });
}

test('Windows installer validates clipboard/hidden input without disclosing tokens', {skip:process.platform!=='win32',timeout:45000}, async () => {
  const token=randomBytes(32).toString('base64url');
  for(const clipboard of [true,false]) {
    const result=await inputCheck(` ${token}\r\n`,clipboard);assert.equal(result.code,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),{length:43,valid:true});assert.ok(!result.stdout.includes(token));assert.ok(!result.stderr.includes(token));
  }
  for(const input of ['*',`"${token}"`,`Enrollment token: ${token}`,'']) {
    const result=await inputCheck(input,true);assert.equal(result.code,1);
    assert.ok(!result.stdout.includes(token));assert.ok(!result.stderr.includes(token));
    assert.match(result.stderr,input===''?/Clipboard has no enrollment token/:/Invalid enrollment token: received \d+ characters/);
  }
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const roots=['agent/src','agent/shared','agent/test','server/routes/endpoint.js','server/services/endpoint-service.js','server/routes/events.js','server/routes/telemetry.js','server/services/sse.js','server/repositories/user-repository.js','server/server.js'];
let count=0;
async function check(file) {
  if((await fs.stat(file)).isDirectory()){for(const name of await fs.readdir(file))await check(path.join(file,name));}
  else if(file.endsWith('.js')){execFileSync(process.execPath,['--check',file],{stdio:'pipe'});count++;}
}
for(const root of roots)await check(root);
if(process.platform==='win32') {
  const {powershell}=await import('../src/native.js');
  const script="$files=Get-ChildItem -LiteralPath agent -Filter *.ps1 -Recurse | Where-Object { $_.FullName -notlike '*\\dist\\*' }; foreach ($f in $files) { $t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile($f.FullName,[ref]$t,[ref]$e) | Out-Null; if($e.Count) { throw ('PowerShell parse failed: '+$f.FullName) } }; Write-Output ('Parsed '+$files.Count+' PowerShell scripts')";
  console.log(execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'}).trim());
}
console.log(`Syntax checked ${count} JavaScript files`);

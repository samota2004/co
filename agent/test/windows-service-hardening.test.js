import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>fs.readFile(path.join(root,file),'utf8');

test('Windows installer protects SCM, files and scheduled tasks from standard users',async()=>{
  const [install,startup,watchdog,host,updater,updateFiles]=await Promise.all([
    read('packaging/windows/install.ps1'),read('packaging/windows/configure-startup.ps1'),
    read('packaging/windows/desktop-watchdog.ps1'),read('packaging/windows/ServiceHost.cs'),
    read('packaging/windows/update-installed.ps1'),read('packaging/windows/update-source-files.ps1')
  ]);
  const serviceSddl="D:P(A;;0xF01FF;;;SY)(A;;0xF01FF;;;BA)(A;;0x2008D;;;BU)";
  assert.ok(install.includes(serviceSddl),'new installs apply SYSTEM/Admin full access and Users query-only service rights');
  assert.ok(startup.includes(serviceSddl),'startup configuration repairs service DACL on existing installs');
  assert.match(install,/Set-PrivateAcl\s+\$installRoot/);assert.match(install,/Set-PrivateAcl\s+\$dataRoot/);
  assert.match(install,/FileSystemAccessRule\([^\n]*'ReadAndExecute'/,'ordinary users receive read/execute but not write on binaries');
  assert.ok(startup.includes("$taskDacl = 'D:P(A;;GA;;;SY)(A;;GA;;;BA)'"),'employee cannot control helper or recovery scheduled tasks');
  assert.ok(startup.includes("SetSecurityDescriptor($taskDacl,16)"));
  assert.match(watchdog,/\$service\.Status\s+-eq\s+'Running'/);assert.match(watchdog,/\$task\.State\s+-eq\s+'Ready'/);
  assert.match(host,/worker\.ExitCode==0/);assert.match(host,/controller\.Stop\(\)/,'authorized child exit requests a normal SCM service stop');
  assert.match(updater,/'src\/remote-stop\.js'/,'existing installs receive the authenticated stop-command module');
  assert.match(updater,/\$updateSources\['CyberOrbitService\.exe'\]=\$compiledHost/,'existing installs receive a rebuilt graceful-stop service host');
  assert.match(updater,/Save-CyberOrbitUpdateFiles\s+-Sources\s+\$updateSources/,'all preflighted sources use the shared update transaction');
  assert.match(updateFiles,/ReadAllBytes\(\$Sources\[\$relative\]\)/,'transaction reads the validated source map');
  assert.match(updateFiles,/foreach\s*\(\$relative\s+in\s+\$State\.Saved\.Keys\)/,'a failed update restores prior installed code');
  assert.match(updateFiles,/SetSecurityDescriptorSddlForm\(\$State\.AclBefore\[\$relative\]\)/,'rollback restores each installed file security descriptor');
  assert.match(updateFiles,/foreach\s*\(\$target\s+in\s+\$State\.CreatedTargets\)/,'a failed update removes only files it created');
  assert.match(updater,/\$dataHashes\[\$file\.FullName\]/,'update verifies existing enrollment and queue data remain unchanged');
  assert.match(updater,/Remove-Item\s+-LiteralPath\s+\$compiledHost/,'temporary service host is cleaned up');
  assert.match(updater,/Restore-CyberOrbitUpdateFiles\s+-State\s+\$sourceTransaction/,'failed updater restores its source transaction');
  assert.match(updater,/\$restartService\s*=\s*\$service\.State\s+-eq\s+'Running'/,'updater preserves an intentionally stopped service');
  assert.match(updater,/param\(\[string\]\$ResultFile,\[switch\]\$AllowSourceReparsePoint\)/,'source reparse allowance is explicit and disabled by default');
  assert.match(updater,/\$sourceRootItem\.Attributes\s+-band\s+\[IO\.FileAttributes\]::ReparsePoint\)\s+-and\s+-not\s+\$AllowSourceReparsePoint/,'only the package root can use the explicit reparse allowance');
  assert.match(updater,/function\s+Resolve-ValidatedSource/,'each source is checked under the resolved source root');
  assert.match(updater,/CyberOrbitFinalPath\]::Resolve\(\$candidate\)/,'source reparse targets are resolved before containment validation');
  assert.match(updater,/Resolved update source escapes the intended package root/,'source links resolving outside the repository are rejected');
  assert.match(updater,/function\s+Assert-SafeDestination/,'every installed destination directory and target is checked');
  assert.match(updater,/foreach\s*\(\$root\s+in\s+@\(\$installRoot,\$dataRoot\)\)/,'installed and data roots remain unconditionally protected');
  assert.match(updater,/Reparse point inside protected agent data/,'nested data reparse points remain rejected');
  assert.match(updater,/Missing or reparse-point installed configuration/,'installed configuration reparse points remain rejected');
  assert.match(updater,/Missing or reparse-point installed runtime/,'installed runtime binary reparse points remain rejected');
  assert.match(updater,/\$serviceWasDisabled\s*=\s*\$service\.StartMode\s+-eq\s+'Disabled'/,'a disabled service state is recorded');
  assert.match(updater,/if\s*\(\$restartService\)\s*\{\s*Stop-Service CyberOrbitAgent/,'only a service that was already running is stopped');
  assert.match(updater,/if\s*\(\$restartService\)\s*\{\s*Start-Service CyberOrbitAgent/,'only a service that was running before the update is restarted');
  assert.match(updater,/\$desktopTask\s+-and\s+-not\s+\$serviceWasDisabled/,'disabled service state is not overwritten by startup configuration');
});

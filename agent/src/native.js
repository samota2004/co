import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const exec = promisify(execFile);
export const nativeDirectory = fileURLToPath(new URL('../native/', import.meta.url));
export const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export function nativeErrorCategory(stderr = '') {
  if (/CYBERORBIT_DESKTOP_ALREADY_RUNNING/.test(stderr)) return 'HELPER_ALREADY_RUNNING';
  if (/PSSecurityException|running scripts is disabled|execution[_\s-]*polic|not digitally signed|cannot run this script|AuthorizationManagerCheckFailed/i.test(stderr)) return 'EXECUTION_POLICY';
  if (/UnauthorizedAccessException|PermissionDenied|access.*denied/i.test(stderr)) return 'FILE_ACCESS';
  if (/FileNotFoundException|PathNotFound|does not exist|not found|not recognized.*script/i.test(stderr)) return 'HELPER_NOT_FOUND';
  if (/CryptographicException|Cryptographic|key not valid|Bad Data/i.test(stderr)) return 'DPAPI_FAILURE';
  if (/ConvertFrom-Json|Invalid vault action|ArgumentException/i.test(stderr)) return 'INPUT_INVALID';
  if (/Add-Type|CompilerError|SourceCodeError/i.test(stderr)) return 'NATIVE_COMPILE';
  return 'HELPER_EXIT';
}
export function nativeFailure(file, exitCode, category, signal = null) {
  const error = new Error(`Native helper ${path.basename(file)} failed (exit=${Number.isInteger(exitCode) ? exitCode : 'none'}, category=${category}${signal ? `, signal=${signal}` : ''})`);
  error.name = 'NativeHelperError'; error.helper = path.basename(file); error.exitCode = exitCode; error.category = category;
  return error;
}
export function windowsHelperArguments(file, policyOverride = true) {
  // Scoped to this child only; Group Policy still takes precedence. Never
  // mutate LocalMachine/CurrentUser policy or weaken DPAPI/file ACLs.
  return ['-NoProfile','-NonInteractive', ...(policyOverride ? ['-ExecutionPolicy','Bypass'] : []), '-File', path.join(nativeDirectory,file)];
}
export function nativeStderrCategory(child) {
  let stderr = '', bytes = 0;
  child.stderr.on('data', chunk => {
    if (bytes < 32768) stderr += chunk.subarray(0,32768-bytes).toString('utf8');
    bytes += chunk.length;
  });
  // Raw stderr can echo stdin/decrypted values. Return a fixed category only.
  return () => nativeErrorCategory(stderr);
}
export function nativeInput(file, input, { policyOverride = true } = {}) {
  if (!['vault.ps1','windows-snapshot.ps1','windows-desktop.ps1','windows-account-control.ps1','keychain','macos-desktop'].includes(file)) return Promise.reject(nativeFailure('unknown',null,'HELPER_NOT_ALLOWED'));
  let payload;
  try { payload = JSON.stringify(input); } catch { return Promise.reject(nativeFailure(file,null,'INPUT_INVALID')); }
  return new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn(powershell, windowsHelperArguments(file,policyOverride), { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
      : spawn(path.join(nativeDirectory,file), [], { stdio: ['pipe','pipe','pipe'] });
    let output = '', size = 0, settled = false;
    const category = nativeStderrCategory(child);
    const fail = (exitCode, cause, signal) => { if (!settled) { settled=true; clearTimeout(timer); reject(nativeFailure(file,exitCode,cause,signal)); } };
    const timer = setTimeout(() => { child.kill(); fail(null,'TIMEOUT'); }, file==='windows-snapshot.ps1' ? 45000 : file==='keychain' && process.getuid?.()>0 ? 120000 : 15000);
    child.stdout.on('data', b => { size += b.length; if (size > 1024*1024) { child.kill(); fail(null,'OUTPUT_LIMIT'); } else output += b; });
    child.on('error', error => fail(null,['EACCES','EPERM'].includes(error.code) ? 'FILE_ACCESS' : error.code==='ENOENT' ? 'HELPER_NOT_FOUND' : 'HELPER_STARTUP'));
    child.on('close', (code,signal) => {
      if (settled) return;
      if (code !== 0) return fail(code,category(),signal);
      settled=true;clearTimeout(timer);resolve(output.trim());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(payload);
  });
}

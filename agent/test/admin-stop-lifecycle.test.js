import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {desktopControls} from '../src/desktop-control.js';
import {windowsServiceControlState} from '../src/health.js';
import {validateHealth} from '../shared/contract.js';
import {heartbeatIntervalMs} from '../src/remote-stop.js';

test('accepted lifecycle commands trigger a prompt authenticated confirmation heartbeat',()=>{
  assert.equal(heartbeatIntervalMs(),30000,'ordinary telemetry keeps its normal interval');
  assert.equal(heartbeatIntervalMs({pendingCommandAck:true}),1000,'stop/resume acknowledgement is sent promptly');
});

test('persistent admin stop disables desktop collection controls without stopping the control service',()=>{
  const controls=desktopControls({paused:false,activeApplication:true,browserTitles:true},{adminStopped:true});
  assert.equal(controls.activeApplication,false);
  assert.equal(controls.browserTitles,false);
  assert.equal(controls.adminStopped,true);
});

test('Windows service-control query reports the SCM state and fails closed when unavailable',async()=>{
  const run=async()=>({stdout:'SERVICE_NAME: CyberOrbitAgent\r\n        STATE              : 4  RUNNING'});
  assert.equal(await windowsServiceControlState('win32',run),'RUNNING');
  assert.equal(await windowsServiceControlState('win32',async()=>({stdout:'STATE : 3 STOP_PENDING'})),'STOP_PENDING');
  assert.equal(await windowsServiceControlState('win32',async()=>{throw new Error('not installed');}),'UNVERIFIED');
  assert.equal(await windowsServiceControlState('darwin',run),'UNVERIFIED');
});

test('agent health contract accepts explicit lifecycle and SCM states and rejects unknown states',()=>{
  const health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false,administrativeState:'ADMIN_STOPPED',serviceControlState:'RUNNING'};
  assert.equal(validateHealth(health),health);
  assert.throws(()=>validateHealth({...health,administrativeState:'STOPPED'}),/administrative state/);
});

test('worker retains its authenticated heartbeat while suppressing collection and upload in ADMIN_STOPPED',async()=>{
  const source=await fs.readFile(new URL('../src/service.js',import.meta.url),'utf8');
  assert.match(source,/if\(!adminStopped && !config\.paused && !uploader\.revoked\)/);
  assert.match(source,/if\(adminStopped\)\{await sleep\(1000\);continue;\}/);
  assert.match(source,/transport\.post\('heartbeat'/);
  assert.match(source,/receiveAdminCommand\(/);
  assert.match(source,/acknowledgeAdminCommand\(/);
  assert.doesNotMatch(source,/acknowledged; stopping without deleting enrollment credentials[\s\S]{0,80}stop\(\)/);
});

test('desktop helper checks server control before spawning its native collector',async()=>{
  const source=await fs.readFile(new URL('../src/desktop-helper.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('await sendSample(grant,{kind:\'desktop-control\'')<source.indexOf('spawn(path.join(nativeDirectory,file)'));
  assert.match(source,/if\(process\.platform==='win32'&&initialReply\?\.adminStopped===true\).*return/);
  assert.match(source,/if\(process\.platform==='win32'&&reply\.adminStopped===true\).*child\.kill/);
});

test('Windows automatic startup and recovery cannot bypass the protected persistent stop flag',async()=>{
  const [install,startup,watchdog,service]=await Promise.all([
    fs.readFile(new URL('../packaging/windows/install.ps1',import.meta.url),'utf8'),
    fs.readFile(new URL('../packaging/windows/configure-startup.ps1',import.meta.url),'utf8'),
    fs.readFile(new URL('../packaging/windows/desktop-watchdog.ps1',import.meta.url),'utf8'),
    fs.readFile(new URL('../src/service.js',import.meta.url),'utf8')
  ]);
  assert.match(install,/Set-PrivateAcl \$dataRoot/,'ordinary users cannot change the persisted admin-stop state');
  assert.match(install,/StartupType Automatic/,'control worker is available after reboot to receive administrator resume');
  assert.match(install,/sc\.exe failure CyberOrbitAgent .*actions= restart/,'SCM recovery may restart only the worker, whose boot path reads the flag');
  assert.match(startup,/Set-Service -Name CyberOrbitAgent -StartupType Automatic/);
  assert.match(watchdog,/Start-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor'/,'watchdog launches only the helper, which checks authenticated adminStopped before collecting');
  assert.match(service,/const windowsService=process\.platform==='win32'&&local\.installMode!=='user';\s*let adminStopped=windowsService&&await administrativeStopState\(local\.dataDirectory\)/,'Windows service startup reloads durable administrative state before collection');
  assert.match(service,/if\(!adminStopped && !config\.paused && !uploader\.revoked\)/);
});

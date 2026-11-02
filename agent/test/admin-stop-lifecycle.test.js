import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {desktopControls} from '../src/desktop-control.js';
import {monitoringLifecycleState,windowsServiceControlState} from '../src/health.js';
import {validateHealth} from '../shared/contract.js';
import {heartbeatIntervalMs} from '../src/remote-stop.js';
import {SystemCollectors} from '../src/collectors/index.js';

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
  assert.equal(await windowsServiceControlState('win32',async()=>{throw new Error('not installed');}),'UNKNOWN');
  assert.equal(await windowsServiceControlState('darwin',run),'UNVERIFIED');
});

test('agent health contract accepts explicit lifecycle and SCM states and rejects unknown states',()=>{
  const health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false,administrativeState:'ADMIN_STOPPED',monitoringState:'PAUSED_BY_ADMIN',pauseReason:'ADMIN_STOP_COMMAND',serviceControlState:'RUNNING'};
  assert.equal(validateHealth(health),health);
  assert.throws(()=>validateHealth({...health,administrativeState:'STOPPED'}),/administrative state/);
  assert.throws(()=>validateHealth({...health,monitoringState:'STOPPED'}),/monitoring state/);
  assert.throws(()=>validateHealth({...health,serviceControlState:'PAUSED_BY_ADMIN'}),/service control state/);
});

test('lifecycle report separates Windows service operation from authorized monitoring state',()=>{
  assert.deepEqual(monitoringLifecycleState({adminStopped:true,collectionReady:false}),{monitoringState:'PAUSED_BY_ADMIN',pauseReason:'ADMIN_STOP_COMMAND'});
  assert.deepEqual(monitoringLifecycleState({configPaused:true,collectionReady:false}),{monitoringState:'PAUSED_BY_ADMIN',pauseReason:'ADMIN_CONFIGURATION'});
  assert.deepEqual(monitoringLifecycleState({resuming:true,collectionReady:false}),{monitoringState:'RESUMING',pauseReason:'COLLECTOR_STARTING'});
  assert.deepEqual(monitoringLifecycleState({collectionReady:false}),{monitoringState:'RESUMING',pauseReason:'COLLECTOR_STARTING'});
  assert.deepEqual(monitoringLifecycleState({collectionReady:true}),{monitoringState:'ACTIVE',pauseReason:'NONE'});
  assert.deepEqual(monitoringLifecycleState({revoked:true}),{monitoringState:'UNKNOWN',pauseReason:'CREDENTIAL_REVOKED'});
});

test('resumed system collectors establish a quiet baseline before reporting later changes',async()=>{
  let sources={
    processes:[{pid:1,startedAt:'t1',name:'before pause'}],
    sessions:[{sessionId:'s1',state:'unlocked'}],
    usb:[{hardwareId:'disk-1',name:'USB storage'}],
    network:[{protocol:'TCP',remoteAddress:'192.0.2.1',remotePort:443}]
  };
  const emitted=[];
  const snapshot=async request=>{const source=Object.keys(request).find(key=>key!=='userOnly');return{[source]:sources[source]};};
  const collectors=new SystemCollectors(async(type,metadata)=>emitted.push({type,metadata}),{}, {},snapshot);
  const config={processes:true,sessions:true,usb:true,network:true};
  await collectors.poll(config);
  collectors.reset();
  sources={processes:[{pid:2,startedAt:'t2',name:'during pause'}],sessions:[{sessionId:'s1',state:'locked'}],usb:[{hardwareId:'disk-2',name:'connected during pause'}],network:[{protocol:'TCP',remoteAddress:'192.0.2.2',remotePort:443}]};
  const afterStop=emitted.length;
  await collectors.poll(config,{baselineOnly:true});
  assert.equal(emitted.length,afterStop,'unobserved changes during admin pause are not timestamped as new activity on resume');
  sources={...sources,processes:[...sources.processes,{pid:3,startedAt:'t3',name:'after resume'}],usb:[...sources.usb,{hardwareId:'disk-3',name:'connected after resume'}],network:[...sources.network,{protocol:'TCP',remoteAddress:'192.0.2.3',remotePort:443}]};
  await collectors.poll(config);
  assert.ok(emitted.some(item=>item.type==='PROCESS_START'&&item.metadata.pid===3));
  assert.ok(emitted.some(item=>item.type==='USB_CONNECTED'&&item.metadata.hardwareId==='disk-3'));
  assert.equal(emitted.some(item=>item.type==='USB_CONNECTED'&&item.metadata.hardwareId==='disk-2'),false);
});

test('worker retains its authenticated heartbeat while suppressing collection and upload in ADMIN_STOPPED',async()=>{
  const source=await fs.readFile(new URL('../src/service.js',import.meta.url),'utf8');
  assert.match(source,/if\(!adminStopped && !config\.paused && !uploader\.revoked\)/);
  assert.match(source,/if\(adminStopped\)\{await sleep\(1000\);continue;\}/);
  assert.match(source,/transport\.post\('heartbeat'/);
  assert.match(source,/receiveAdminCommand\(/);
  assert.match(source,/acknowledgeAdminCommand\(/);
  assert.match(source,/monitoringLifecycleState\(\{adminStopped,configPaused:config\.paused,revoked:uploader\.revoked,resuming:resumeTransition,collectionReady:monitoringReady\}\)/);
  assert.match(source,/if\(adminStopped\)\{monitoringReady=false;resumeTransition=false;collectorBaselinePending=true;collectors\.reset\(\);files\.close\(\);files\.signature='';await usage\.reset\(\)/,'stop immediately suspends and resets collector baselines while leaving heartbeat worker alive');
  assert.match(source,/else \{monitoringReady=false;resumeTransition=true;\}/,'resume is reported as in progress until a collector cycle completes');
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

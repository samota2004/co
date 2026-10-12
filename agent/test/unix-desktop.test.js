import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {normalize,desktopAppMetadata,desktopAppChanged} from '../src/normalizer.js';
import {effectiveConfig} from '../src/config.js';
import {isBrowser} from '../shared/app-identity.js';
import {hostCredential} from '../src/linux-credentials.js';
import {options} from '../src/configure-unix.js';
import {UnixDesktopSupervisor} from '../src/unix-desktop-supervisor.js';
import {desktopDiagnosticStatus} from '../src/health.js';

test('Linux desktop IDs and macOS bundle IDs preserve arbitrary app identities and foreground usage',()=>{
  for(const sample of [{pid:10,name:'some-custom-app',appName:'Custom App',appId:'org.example.Custom.desktop',identitySource:'linux-desktop'},
    {pid:42,name:'Another App',appName:'Another App',appId:'com.example.app',identitySource:'macos-bundle'}]) {
    const e=normalize(randomUUID(),'APPLICATION_USAGE',{...sample,identity:'uid:1001',sessionId:'desktop:1001',durationSeconds:30});
    assert.equal(e.metadata.appId,sample.appId);assert.equal(desktopAppMetadata(sample).identitySource,sample.identitySource);
    assert.equal(desktopAppChanged(sample,{...sample,appId:sample.appId+'.other'}),true);
  }
});
test('browser titles work across platforms only with both approvals and a recognized browser identity',()=>{
  const local={locallyApprovedDirectories:[],browserTitles:true};
  assert.equal(effectiveConfig({browserTitles:true},local).browserTitles,true);
  assert.equal(effectiveConfig({browserTitles:true},{...local,browserTitles:false}).browserTitles,false);
  assert.equal(effectiveConfig({browserTitles:false},local).browserTitles,false);
  for(const sample of [{name:'Google Chrome',appId:'com.google.Chrome'},{name:'Safari',appId:'com.apple.Safari'},
    {name:'firefox',appId:'org.mozilla.firefox.desktop'},{name:'brave-browser',appId:'brave-browser.desktop'}]) {
    assert.equal(isBrowser(sample),true);
    assert.equal(normalize(randomUUID(),'APPLICATION_USAGE',{...sample,pid:1,sessionId:'1',durationSeconds:2,browserTitle:'Public example page'}).metadata.browserTitle,'Public example page');
  }
  assert.equal(isBrowser({name:'Editor',appId:'org.example.editor'}),false);
  assert.throws(()=>normalize(randomUUID(),'APPLICATION_USAGE',{name:'Editor',pid:1,sessionId:'1',durationSeconds:2,browserTitle:'document'}));
});
test('host encryption keeps secrets off argv and rejects native failures with a safe error',async()=>{
  const secret='private credential';
  for(const action of ['encrypt','decrypt']) {
    const run=(file,args)=>{
      assert.equal(file,'/usr/bin/systemd-creds');assert.ok(!args.join(' ').includes(secret));
      assert.equal(args[0],action);assert.ok(args.includes('--name=cyberorbit'));
      const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.kill=()=>{};
      let input='';child.stdin.on('data',b=>input+=b);child.stdin.on('finish',()=>{assert.equal(input,secret);child.stdout.write('protected output');child.emit('close',0);});return child;
    };
    assert.equal(await hostCredential(action,secret,run),'protected output');
  }
  await assert.rejects(hostCredential('encrypt',secret,()=>{
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.kill=()=>{};
    child.stdin.on('finish',()=>child.emit('error',new Error(secret)));return child;
  }),{message:'Host credential storage unavailable'});
});
test('Unix setup requires explicit named options and has no password/token command argument',()=>{
  assert.deepEqual(options(['--server','https://example.org','--employee','worker','--browser-titles']),{'--server':'https://example.org','--employee':'worker','--browser-titles':true});
  for(const args of [['--employee'],['--password','secret'],['--token','secret'],['--unknown']])assert.throws(()=>options(args));
});
test('desktop diagnostics use fixed unavailable categories without echoing private native errors',()=>{
  for(const code of ['unsupported-compositor','idle-state-unavailable','session-state-unavailable','desktop-query-failed'])assert.match(desktopDiagnosticStatus(code),/^unavailable:/);
  for(const code of ['secret native output','__proto__','constructor',{},null])assert.equal(desktopDiagnosticStatus(code),null);
});

function supervisorFixture(platform='linux') {
  const calls=[],children=[],killed=[],health={};let clock=100000,active=true,installed=false;
  const deps={platform,root:()=>true,now:()=>clock,
    run:async(file,args)=>{
      calls.push([file,args]);
      if(platform==='darwin') {
        if(args[0]==='print' && args[1].endsWith('/com.cyberorbit.desktop') && !installed)throw new Error('not loaded');
        if(args[0]==='bootstrap')installed=true;
        return {stdout:''};
      }
      if(args[0]==='list-sessions')return {stdout:'5 1002 other\n7 1001 employee\n'};
      return {stdout:`Id=7\nActive=${active?'yes':'no'}\nType=wayland\nDesktop=KDE\nDisplay=\nLeader=555\n`};
    },
    files:{readFile:async()=> 'employee:x:1001:1001::/home/employee:/bin/bash',readdir:async()=>['wayland-0'],stat:async()=>({isSocket:()=>true,uid:1001})},
    start:(file,args,opts)=>{const c=new EventEmitter();c.pid=9000+children.length;c.kill=()=>{};children.push({c,file,args,opts});return c;},
    kill:(pid,signal)=>{killed.push([pid,signal]);const child=children.find(x=>x.c.pid===-pid);child?.c.emit('close',1);}};
  const supervisor=new UnixDesktopSupervisor({superviseDesktop:true},'uid:1001',health,deps);
  return {supervisor,deps,calls,children,killed,health,advance:ms=>clock+=ms,setActive:value=>active=value};
}
test('Linux supervisor starts only the mapped GUI UID with cleared groups and no inherited environment',async()=>{
  const f=supervisorFixture();await f.supervisor.tick();
  assert.equal(f.children.length,1);
  const launched=f.children[0];assert.equal(launched.file,'/usr/bin/setpriv');
  assert.deepEqual(launched.args.slice(0,5),['--reuid','1001','--regid','1001','--clear-groups']);
  assert.equal(launched.opts.detached,true);assert.equal(launched.opts.env.XDG_SESSION_ID,'7');
  assert.equal(launched.opts.env.DBUS_SESSION_BUS_ADDRESS,'unix:path=/run/user/1001/bus');
  assert.equal(launched.opts.env.WAYLAND_DISPLAY,'wayland-0');assert.equal(launched.opts.env.NODE_OPTIONS,undefined);
  assert.ok(!f.calls.some(([,args])=>args[0]==='show-session' && args[1]==='5'));
  await f.supervisor.tick();assert.equal(f.children.length,1);
  f.setActive(false);await f.supervisor.tick();assert.equal(f.killed.length,1);
  assert.match(f.health.desktopStartup,/waiting/);
});
test('Linux supervisor replaces a stopped/stale helper but respects explicit service stop and local opt-out',async()=>{
  const f=supervisorFixture();await f.supervisor.tick();f.advance(46000);
  await f.supervisor.tick();assert.deepEqual(f.killed,[[-9000,'SIGKILL']]);
  await f.supervisor.tick();assert.equal(f.children.length,2);
  f.supervisor.stop();await f.supervisor.tick();assert.equal(f.children.length,2);
  const other=supervisorFixture();other.supervisor.local.superviseDesktop=false;
  await other.supervisor.tick();assert.deepEqual(other.calls,[]);
});
test('macOS supervisor bootstraps only the mapped launchd GUI domain and restarts a silent helper',async()=>{
  const f=supervisorFixture('darwin');await f.supervisor.tick();
  assert.ok(f.calls.some(([,args])=>args[0]==='bootstrap' && args[1]==='gui/1001'));
  assert.equal(f.children.length,0);f.advance(46000);await f.supervisor.tick();
  assert.ok(f.calls.some(([,args])=>args[0]==='kickstart' && args[2]==='gui/1001/com.cyberorbit.desktop'));
  f.supervisor.stop();assert.ok(f.calls.some(([,args])=>args[0]==='bootout' && args[1]==='gui/1001/com.cyberorbit.desktop'));
});
test('a non-root supervisor cannot enable, stop or launch a desktop helper',async()=>{
  for(const platform of ['linux','darwin']) {
    const f=supervisorFixture(platform);f.supervisor.root=()=>false;
    await f.supervisor.tick();f.supervisor.stop();assert.deepEqual(f.calls,[]);assert.deepEqual(f.children,[]);
  }
});

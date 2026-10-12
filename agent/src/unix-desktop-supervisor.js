import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {exec} from './native.js';

// The root service restarts the mapped session's helper. Helpers execute as that
// user, never as root; credentials and queue files stay outside its capability.
export class UnixDesktopSupervisor {
  constructor(local,identity,health,{platform=process.platform,root=()=>process.getuid?.()===0,run=exec,files=fs,start=spawn,kill=(pid,signal)=>process.kill(pid,signal),now=Date.now}={}) {
    Object.assign(this,{local,identity,health,platform,root,run,files,start,kill,now});
    this.child=null;this.sessionId=null;this.stopped=false;this.observedAt=now();this.attemptedAt=0;
  }
  killChild() {if(this.child)try{this.kill(-this.child.pid,'SIGKILL');}catch{this.child.kill('SIGKILL');}}
  async tick() {
    if(this.stopped || !this.local.superviseDesktop || !/^uid:[1-9]\d*$/.test(this.identity || '') || !this.root())return;
    const uid=Number(this.identity.slice(4));
    try {
      if(this.platform==='darwin') {
        await this.run('/bin/launchctl',['print','gui/'+uid],{timeout:5000,maxBuffer:1024*1024});
        await this.run('/bin/launchctl',['enable',`gui/${uid}/com.cyberorbit.desktop`],{timeout:5000});
        try{await this.run('/bin/launchctl',['print',`gui/${uid}/com.cyberorbit.desktop`],{timeout:5000});}
        catch{await this.run('/bin/launchctl',['bootstrap','gui/'+uid,'/Library/CYBERORBIT/packaging/macos/com.cyberorbit.desktop.plist'],{timeout:5000});this.attemptedAt=this.now();}
        if(this.now()-Math.max(this.observedAt,this.attemptedAt)>45000) {
          await this.run('/bin/launchctl',['kickstart','-k',`gui/${uid}/com.cyberorbit.desktop`],{timeout:5000});this.attemptedAt=this.now();
        }
        this.health.desktopStartup='healthy: launchd session supervision';return;
      }
      if(this.platform!=='linux')return;
      const {stdout}=await this.run('/usr/bin/loginctl',['list-sessions','--no-legend','--no-pager'],{timeout:5000});
      let session;
      for(const line of stdout.trim().split('\n')) {
        const cols=line.trim().split(/\s+/);if(Number(cols[1])!==uid || !/^[a-zA-Z0-9]+$/.test(cols[0]))continue;
        const raw=(await this.run('/usr/bin/loginctl',['show-session',cols[0],'-p','Id','-p','Active','-p','Type','-p','Desktop','-p','Display','-p','Leader'],{timeout:5000})).stdout;
        const s=Object.fromEntries(raw.trim().split('\n').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
        if(s.Active==='yes' && ['x11','wayland'].includes(s.Type)){session=s;break;}
      }
      if(!session){this.killChild();this.health.desktopStartup='waiting: mapped user graphical login';return;}
      if(this.child && this.sessionId===session.Id && this.now()-Math.max(this.observedAt,this.attemptedAt)<=45000)return;
      if(this.child){this.killChild();return;}
      const row=(await this.files.readFile('/etc/passwd','utf8')).split('\n').map(x=>x.split(':')).find(x=>Number(x[2])===uid && x.length===7);
      if(!row)throw new Error();
      const env={PATH:'/usr/bin:/bin',HOME:row[5],USER:row[0],LOGNAME:row[0],LANG:'C.UTF-8',XDG_RUNTIME_DIR:'/run/user/'+uid,
        DBUS_SESSION_BUS_ADDRESS:`unix:path=/run/user/${uid}/bus`,XDG_SESSION_ID:session.Id,XDG_SESSION_TYPE:session.Type,XDG_CURRENT_DESKTOP:session.Desktop};
      if(session.Type==='x11') {
        // Only display transport settings, never arbitrary process environment.
        if(/^:\d+(\.\d+)?$/.test(session.Display))env.DISPLAY=session.Display;
        const candidates=[path.join(row[5],'.Xauthority'),`/run/user/${uid}/gdm/Xauthority`];
        if(/^\d+$/.test(session.Leader))try {
          const leader='/proc/'+session.Leader;
          if((await this.files.stat(leader)).uid===uid)for(const entry of (await this.files.readFile(leader+'/environ','utf8')).split('\0')) {
            if(/^DISPLAY=:\d+(\.\d+)?$/.test(entry))env.DISPLAY=entry.slice(8);
            if(entry.startsWith('XAUTHORITY=/'))candidates.unshift(entry.slice(11));
          }
        }catch{}
        for(const candidate of candidates)try{const st=await this.files.stat(candidate);if(st.isFile() && st.uid===uid){env.XAUTHORITY=candidate;break;}}catch{}
      } else {
        env.QT_QPA_PLATFORM='wayland';
        for(const name of await this.files.readdir(env.XDG_RUNTIME_DIR))if(/^wayland-\d+$/.test(name)) {
          const stat=await this.files.stat(path.join(env.XDG_RUNTIME_DIR,name));
          if(stat.isSocket() && stat.uid===uid){env.WAYLAND_DISPLAY=name;break;}
        }
      }
      const cli=fileURLToPath(new URL('./cli.js',import.meta.url));
      // clear-groups prevents retaining root supplementary groups after setuid.
      const child=this.start('/usr/bin/setpriv',['--reuid',String(uid),'--regid',row[3],'--clear-groups',process.execPath,cli,'helper','/etc/cyberorbit/config.json'],{env,stdio:'ignore',detached:true});
      this.child=child;this.sessionId=session.Id;this.attemptedAt=this.now();
      child.on('error',()=>{this.health.desktopStartup='error: session helper launch failed';});
      child.on('close',()=>{if(this.child===child){this.child=null;if(!this.stopped)this.health.desktopStartup='error: session helper exited; retry pending';}});
      this.health.desktopStartup='healthy: root-supervised user helper';
    }catch{this.health.desktopStartup='unavailable: graphical session or helper installation';}
  }
  stop(){
    this.stopped=true;this.killChild();
    if(this.platform==='darwin' && this.root() && this.local.superviseDesktop && /^uid:[1-9]\d*$/.test(this.identity || '')) {
      this.run('/bin/launchctl',['bootout',`gui/${this.identity.slice(4)}/com.cyberorbit.desktop`],{timeout:5000}).catch(()=>{});
    }
  }
}

import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
// A child helper shares the employee's UID and is restarted with a bounded delay.
// No launchctl asuser, sudo, privileged account operation or cross-user environment.
export class UserDesktopSupervisor {
  constructor(local,health,{start=spawn,now=Date.now}={}) {Object.assign(this,{local,health,start,now});this.child=null;this.next=0;this.stopped=false;this.observedAt=now();}
  async tick() {
    if(this.stopped)return;
    if(this.child) {
      if(this.now()-this.observedAt>45000) this.child.kill('SIGTERM');
      return;
    }
    if(this.now()<this.next)return;
    this.next=this.now()+15000;this.observedAt=this.now();
    const child=this.start(process.execPath,[fileURLToPath(new URL('./cli.js',import.meta.url)),'helper',path.join(path.dirname(this.local.dataDirectory),'config.json')],
      {stdio:['ignore','ignore','inherit','ipc'],env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
    this.child=child;
    child.on('error',()=>{this.health.desktopStartup='error: user helper could not start';});
    child.on('close',()=>{if(this.child===child)this.child=null;this.health.desktopStartup='waiting: user helper restart';});
    this.health.desktopStartup='healthy: employee helper supervised';
  }
  suspend(){if(this.child)this.child.kill('SIGTERM');}
  stop(){this.stopped=true;this.suspend();}
}

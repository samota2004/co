export class SystemCollectors {
  constructor(emit,health,local={}) { this.emit=emit; this.health=health; this.local=local; this.previous={}; this.lastRunning=0; }
  async poll(config) {
    const platform = process.platform === 'win32' ? './windows.js' : process.platform === 'darwin' ? './macos.js' : './linux.js';
    const { snapshot } = await import(platform);
    // Each source runs independently, so unavailable privileges do not suppress other collectors.
    for (const source of ['processes','sessions','usb','network']) {
      if (!config[source]) { this.health[source]='disabled'; delete this.previous[source]; continue; }
      try {
        const data = (await snapshot({[source]:true, userOnly:this.local.installMode==='user'}))[source] || [];
        const key = x => source==='processes' ? `${x.pid}:${x.startedAt}` : source==='sessions' ? x.sessionId : source==='usb' ? x.hardwareId : JSON.stringify(x);
        const current=new Map(data.map(x=>[key(x),x])), prior=this.previous[source];
        const prefix = {processes:'PROCESS',sessions:'SESSION',usb:'USB'}[source];
        for (const [id,x] of current) {
          if (source==='network') { if (!prior?.has(id)) await this.emit('NETWORK_CONNECTION',x); }
          else if (prior && !prior.has(id)) await this.emit(`${prefix}_${source==='processes'?'START':source==='sessions'?'LOGIN':'CONNECTED'}`,x);
          else if (source==='sessions' && (!prior || prior.get(id)?.state!==x.state)) await this.emit(x.state==='locked'?'SESSION_LOCK':prior?.get(id)?.state==='locked'?'SESSION_UNLOCK':'SESSION_STATE',x);
          else if (source==='usb' && !prior) await this.emit('USB_CONNECTED',x);
          else if (source==='processes' && (!prior || Date.now()-this.lastRunning>300000)) await this.emit('PROCESS_RUNNING',x);
        }
        if (prior && source!=='network') for (const [id,x] of prior) if (!current.has(id)) await this.emit(`${prefix}_${source==='processes'?'STOP':source==='sessions'?'LOGOUT':'REMOVED'}`,x);
        this.previous[source]=current; if(source==='processes' && (!prior || Date.now()-this.lastRunning>300000)) this.lastRunning=Date.now();
        this.health[source]='healthy: polling';
      } catch { this.health[source]='error: OS query/permissions unavailable'; }
    }
  }
}

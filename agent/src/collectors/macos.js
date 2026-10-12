import { exec } from '../native.js';
export async function snapshot(c) {
  const out = {};
  if (c.processes) {
    const {stdout} = await exec('/bin/ps',['-axo','pid=,uid=,lstart=,comm='],{timeout:10000,maxBuffer:1048576});
    out.processes = stdout.trim().split('\n').map(l=> {
      const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/);
      return m ? {pid:Number(m[1]),identity:`uid:${m[2]}`,startedAt:new Date(m[3]).toISOString(),name:m[4].split('/').pop()} : null;
    }).filter(Boolean);
  }
  if (c.usb) {
    const {stdout} = await exec('/usr/sbin/system_profiler',['SPUSBDataType','-json'],{timeout:15000,maxBuffer:2097152});
    out.usb = [];
    const walk = items => { for (const x of items || []) { if (x.product_id) out.usb.push({hardwareId:`${x.location_id}:${x.vendor_id}:${x.product_id}`,name:x._name}); walk(x._items); } };
    walk(JSON.parse(stdout).SPUSBDataType);
  }
  if (c.sessions) {
    const {stdout}=await exec('/usr/bin/who',[],{timeout:5000,maxBuffer:131072});
    out.sessions=[];
    for(const line of stdout.trim().split('\n').slice(0,100)) {
      const [name,terminal]=line.trim().split(/\s+/);
      if(!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(name || '') || !/^(console|ttys\d+)$/.test(terminal || ''))continue;
      const uid=Number((await exec('/usr/bin/id',['-u',name],{timeout:3000})).stdout.trim());
      if(!Number.isSafeInteger(uid) || uid<0)continue;
      out.sessions.push({identity:`uid:${uid}`,sessionId:terminal==='console'?`desktop:${uid}`:`${terminal}:${uid}`,state:'connected'});
    }
    // Lock/unlock comes from the authenticated GUI helper, not `who`.
  }
  if (c.network) {
    const {stdout} = await exec('/usr/sbin/lsof',['-nP','-iTCP','-sTCP:ESTABLISHED','-Fpn'],{timeout:10000,maxBuffer:1048576});
    out.network = []; let pid = 0;
    for (const l of stdout.split('\n')) {
      if (l.startsWith('p')) pid=Number(l.slice(1));
      const m=l.match(/^n(.+):(\d+)->(.+):(\d+)$/);
      if (m) out.network.push({pid,protocol:'TCP',state:'ESTABLISHED',localAddress:m[1],localPort:Number(m[2]),remoteAddress:m[3],remotePort:Number(m[4])});
    }
  }
  return out;
}

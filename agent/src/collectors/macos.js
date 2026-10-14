import { exec } from '../native.js';
import os from 'node:os';
export function parseProcesses(stdout, uid=null) {
  return stdout.trim().split('\n').map(l=> {
    const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/);
    if(!m || (uid!==null && Number(m[2])!==uid))return null;
    const time=Date.parse(m[3]);if(!Number.isFinite(time))return null;
    return {pid:Number(m[1]),identity:`uid:${m[2]}`,startedAt:new Date(time).toISOString(),name:m[4].split('/').pop()};
  }).filter(Boolean);
}
export async function snapshot(c) {
  const out = {};
  if (c.processes) {
    const args=c.userOnly?['-U',String(process.getuid()),'-o','pid=,uid=,lstart=,comm=']:['-axo','pid=,uid=,lstart=,comm='];
    const {stdout} = await exec('/bin/ps',args,{timeout:10000,maxBuffer:1048576,env:{...process.env,LC_ALL:'C'}});
    out.processes=parseProcesses(stdout,c.userOnly?process.getuid():null);
  }
  if (c.usb) {
    if(c.userOnly) throw new Error('Device-wide USB monitoring unavailable in user mode');
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
      if(c.userOnly && name!==os.userInfo().username)continue;
      if(!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(name || '') || !/^(console|ttys\d+)$/.test(terminal || ''))continue;
      const uid=Number((await exec('/usr/bin/id',['-u',name],{timeout:3000})).stdout.trim());
      if(!Number.isSafeInteger(uid) || uid<0)continue;
      if(c.userOnly && uid!==process.getuid())continue;
      out.sessions.push({identity:`uid:${uid}`,sessionId:terminal==='console'?`desktop:${uid}`:`${terminal}:${uid}`,state:'connected'});
    }
    // Lock/unlock comes from the authenticated GUI helper, not `who`.
  }
  if (c.network) {
    if(c.userOnly) throw new Error('Device-wide network inspection unavailable in user mode');
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

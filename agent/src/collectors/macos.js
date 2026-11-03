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
export function parseUsbInventory(json) {
  const output=[];
  const walk=items=>{for(const item of items||[]){
    if(item.product_id&&item.vendor_id&&item.location_id){
      const hardwareId=`${item.location_id}:${item.vendor_id}:${item.product_id}`;
      const name=typeof item._name==='string'&&item._name.trim()?item._name.trim():'USB device';
      output.push({hardwareId,name});
    }
    walk(item._items);
  }};
  walk(json?.SPUSBDataType);
  return output;
}
export function parseNetworkConnections(stdout) {
  const output=[];let pid=0;
  for(const line of String(stdout||'').split('\n')){
    if(line.startsWith('p')){pid=Number(line.slice(1));continue;}
    const match=line.match(/^n(.+):(\d+)->(.+):(\d+)$/);
    if(match&&Number.isSafeInteger(pid)&&pid>0)output.push({pid,protocol:'TCP',state:'ESTABLISHED',localAddress:match[1],localPort:Number(match[2]),remoteAddress:match[3],remotePort:Number(match[4])});
  }
  return output;
}
export async function snapshot(c,{run=exec,uid=process.getuid?.(),username=os.userInfo().username}={}) {
  const out = {};
  if (c.processes) {
    const args=c.userOnly?['-U',String(uid),'-o','pid=,uid=,lstart=,comm=']:['-axo','pid=,uid=,lstart=,comm='];
    const {stdout} = await run('/bin/ps',args,{timeout:10000,maxBuffer:1048576,env:{...process.env,LC_ALL:'C'}});
    out.processes=parseProcesses(stdout,c.userOnly?uid:null);
  }
  if (c.usb) {
    const {stdout} = await run('/usr/sbin/system_profiler',['SPUSBDataType','-json'],{timeout:15000,maxBuffer:2097152});
    out.usb=parseUsbInventory(JSON.parse(stdout));
  }
  if (c.sessions) {
    const {stdout}=await run('/usr/bin/who',[],{timeout:5000,maxBuffer:131072});
    out.sessions=[];
    for(const line of stdout.trim().split('\n').slice(0,100)) {
      const [name,terminal]=line.trim().split(/\s+/);
      if(c.userOnly && name!==os.userInfo().username)continue;
      if(!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(name || '') || !/^(console|ttys\d+)$/.test(terminal || ''))continue;
      const sessionUid=Number((await run('/usr/bin/id',['-u',name],{timeout:3000})).stdout.trim());
      if(!Number.isSafeInteger(sessionUid) || sessionUid<0)continue;
      if(c.userOnly && sessionUid!==uid)continue;
      out.sessions.push({identity:`uid:${sessionUid}`,sessionId:terminal==='console'?`desktop:${sessionUid}`:`${terminal}:${sessionUid}`,state:'connected'});
    }
    // Lock/unlock comes from the authenticated GUI helper, not `who`.
  }
  if (c.network) {
    const args=['-nP','-iTCP','-sTCP:ESTABLISHED','-Fpn'];
    if(c.userOnly)args.push('-u',username);
    const {stdout} = await run('/usr/sbin/lsof',args,{timeout:10000,maxBuffer:1048576});
    out.network=parseNetworkConnections(stdout);
  }
  return out;
}

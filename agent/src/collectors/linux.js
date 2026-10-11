import fs from 'node:fs/promises';
import { exec } from '../native.js';
export async function snapshot(c) {
  const out = {};
  if (c.processes) {
    out.processes = [];
    for (const pid of (await fs.readdir('/proc')).filter(p=>/^\d+$/.test(p))) {
      try {
        const [stat,status,comm] = await Promise.all([fs.readFile(`/proc/${pid}/stat`,'utf8'),fs.readFile(`/proc/${pid}/status`,'utf8'),fs.readFile(`/proc/${pid}/comm`,'utf8')]);
        const fields = stat.slice(stat.lastIndexOf(')')+2).split(' '), uid = status.match(/^Uid:\s+(\d+)/m)?.[1];
        out.processes.push({pid:Number(pid),name:comm.trim(),startedAt:fields[19],sessionId:fields[3],identity:uid ? `uid:${uid}` : undefined});
      } catch { /* Process may have exited during snapshot. */ }
    }
  }
  if (c.usb) {
    out.usb = [];
    for (const name of await fs.readdir('/sys/bus/usb/devices')) try {
      const base = `/sys/bus/usb/devices/${name}`;
      const [vendor,product] = await Promise.all([fs.readFile(`${base}/idVendor`,'utf8'),fs.readFile(`${base}/idProduct`,'utf8')]);
      out.usb.push({hardwareId:`${name}:${vendor.trim()}:${product.trim()}`,name:await fs.readFile(`${base}/product`,'utf8').then(s=>s.trim()).catch(()=>'USB device')});
    } catch { /* Interface entry, not a USB device. */ }
  }
  if (c.sessions) {
    const {stdout} = await exec('loginctl',['list-sessions','--no-legend','--no-pager'],{timeout:10000,maxBuffer:262144});
    out.sessions = [];
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const [id,uid] = line.trim().split(/\s+/);
      const {stdout:state} = await exec('loginctl',['show-session',id,'-p','State','-p','LockedHint'],{timeout:5000});
      out.sessions.push({sessionId:id,identity:`uid:${uid}`,state:state.includes('LockedHint=yes') ? 'locked' : state.match(/State=(\w+)/)?.[1] || 'unknown'});
    }
  }
  if (c.network) {
    const {stdout} = await exec('ss',['-H','-t','-n','-p'],{timeout:10000,maxBuffer:1048576});
    out.network = stdout.trim().split('\n').filter(Boolean).map(line => {
      const f=line.trim().split(/\s+/), local=f[3].match(/^(.*):(\d+)$/), remote=f[4].match(/^(.*):(\d+)$/);
      return local && remote ? {pid:Number(line.match(/pid=(\d+)/)?.[1] || 0),protocol:'TCP',state:f[0],localAddress:local[1],localPort:Number(local[2]),remoteAddress:remote[1],remotePort:Number(remote[2])} : null;
    }).filter(Boolean);
  }
  return out;
}

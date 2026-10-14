import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {ownedPath} from './macos-user.js';
export async function renameDurably(source,target){
  // Windows antivirus/OneDrive can briefly hold a file after close. Retry the
  // atomic rename; never unlink its destination or discard a valid ciphertext.
  for(let attempt=0;;attempt++){
    try{return await fs.rename(source,target);}
    catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=8)throw error;await pause(Math.min(250,25*2**attempt));}
  }
}
export class EncryptedQueue {
  constructor(directory, key, { maxBytes = 50*1024*1024, maxEvents = 50000, retentionMs = 7*86400000, uid=null } = {}) {
    this.directory = directory; this.key = Buffer.from(key,'base64');
    if (this.key.length !== 32) throw new Error('Invalid queue key');
    this.maxBytes = maxBytes; this.maxEvents = maxEvents; this.retentionMs = retentionMs;
    this.entries = []; this.dropped = 0; this.serial = Promise.resolve();this.uid=uid;
  }
  encrypt(value) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from('CYBERORBIT queue v1'));
    const data = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),data]);
  }
  decrypt(data) {
    const d = createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));
    d.setAAD(Buffer.from('CYBERORBIT queue v1')); d.setAuthTag(data.subarray(12,28));
    return JSON.parse(Buffer.concat([d.update(data.subarray(28)),d.final()]).toString());
  }
  run(fn) { const result = this.serial.then(fn); this.serial = result.catch(() => {}); return result; }
  async atomic(file, data) {
    if(this.uid!==null) {
      await ownedPath(this.directory,this.uid,{directory:true});
      for(const target of [file,`${file}.tmp`])try{await ownedPath(target,this.uid);}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    await fs.writeFile(`${file}.tmp`,data,{mode:0o600}); const h = await fs.open(`${file}.tmp`,'r+'); try{await h.sync();}finally{await h.close();} await renameDurably(`${file}.tmp`,file);
    if(process.platform!=='win32') {const directory=await fs.open(this.directory,'r');try{await directory.sync();}finally{await directory.close();}}
  }
  async init() {
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    if(this.uid!==null) {
      await ownedPath(this.directory,this.uid,{directory:true});
      for(const file of await fs.readdir(this.directory))await ownedPath(path.join(this.directory,file),this.uid);
    }
    // Recover completed encrypted writes interrupted just before rename.
    for (const file of (await fs.readdir(this.directory)).filter(f=>f.endsWith('.tmp'))) {
      const target=file.slice(0,-4), data=await fs.readFile(path.join(this.directory,file));
      try {this.decrypt(data);}
      catch {await fs.unlink(path.join(this.directory,file));this.dropped++;continue;}
      await renameDurably(path.join(this.directory,file),path.join(this.directory,target));
    }
    try { this.dropped += this.decrypt(await fs.readFile(path.join(this.directory,'stats'))).dropped; } catch(e) { if (e.code !== 'ENOENT') throw new Error('Queue statistics corrupt; manual recovery required'); }
    for (const file of (await fs.readdir(this.directory)).filter(f => f.endsWith('.event')).sort()) {
      const data = await fs.readFile(path.join(this.directory,file));
      try { const event = this.decrypt(data); this.entries.push({file, bytes:data.length,event}); }
      catch { await fs.unlink(path.join(this.directory,file)); this.dropped++; }
    }
    await this.trim(); await this.stats(); return this;
  }
  async stats() { await this.atomic(path.join(this.directory,'stats'),this.encrypt({dropped:this.dropped})); }
  async trim() {
    for (const e of [...this.entries]) if(Date.parse(e.event.occurredAt)<Date.now()-this.retentionMs) {
      await fs.unlink(path.join(this.directory,e.file));this.entries.splice(this.entries.indexOf(e),1);this.dropped++;
    }
    while (this.entries.length && (this.entries.length > this.maxEvents || this.entries.reduce((n,e)=>n+e.bytes,0) > this.maxBytes)) {
      const e = this.entries[0]; await fs.unlink(path.join(this.directory,e.file)); this.entries.shift(); this.dropped++;
    }
  }
  append(event) { return this.run(async () => {
    if(this.entries.some(e=>e.event.eventId===event.eventId))return;
    const data = this.encrypt(event), file = `${Date.now().toString().padStart(16,'0')}-${event.eventId}.event`;
    await this.atomic(path.join(this.directory,file),data); this.entries.push({file,bytes:data.length,event});
    await this.trim(); await this.stats();
  }); }
  batch() { return this.run(async () => {
    await this.trim(); await this.stats(); let size = 0;
    return this.entries.slice(0,100).filter(e => { size += Buffer.byteLength(JSON.stringify(e.event)); return size < 240000; }).map(e=>e.event);
  }); }
  acknowledge(ids) { return this.run(async () => {
    const accepted = new Set(ids);
    for (const e of [...this.entries]) if (accepted.has(e.event.eventId)) { await fs.unlink(path.join(this.directory,e.file)); this.entries.splice(this.entries.indexOf(e),1); }
  }); }
  health() { return {queueEvents:this.entries.length,queueBytes:this.entries.reduce((n,e)=>n+e.bytes,0),droppedEvents:this.dropped}; }
}

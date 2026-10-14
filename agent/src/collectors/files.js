import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
export class FileCollector {
  constructor(emit,health,{uid=null}={}) { this.emit=emit; this.health=health; this.uid=uid; this.watchers=[]; this.signature=''; this.generation=0; }
  async configure(directories) {
    const sig=JSON.stringify(directories); if (sig===this.signature) return;
    this.close(); this.signature=sig;
    const generation=this.generation, watched=new Set(),ownedNames=new Set();
    const watchDirectory=async(root,directory)=> {
      if(this.generation!==generation || watched.has(directory)) return;
      if(watched.size>=2000){this.health.files='degraded: directory watcher limit reached';return;}
      const directoryStat=await fsp.lstat(directory);
      if(directoryStat.isSymbolicLink() || (this.uid!==null && directoryStat.uid!==this.uid))return;
      watched.add(directory);
      const watcher=fs.watch(directory,(change,filename)=> {
        if(!filename){this.health.files='degraded: unnamed filesystem event';return;}
        const candidate=path.resolve(directory,String(filename)), rel=path.relative(root,candidate);
        if(rel.startsWith('..') || path.isAbsolute(rel))return;
        (async()=>{
          if(this.generation!==generation)return;
          // Resolve the parent even for deletions; never follow a moved/symlinked directory.
          if(await fsp.realpath(directory)!==directory)return;
          const stat=await fsp.lstat(candidate).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
          if(stat?.isSymbolicLink())return;
          if(stat && this.uid!==null && stat.uid!==this.uid)return;
          if(this.uid!==null && !stat && !ownedNames.has(candidate))return;
          if(stat)ownedNames.add(candidate);else ownedNames.delete(candidate);
          await this.emit('FILE_CHANGE',{directory:root,relativePath:rel,change});
          if(stat?.isDirectory())await watchDirectory(root,candidate);
        })().catch(()=>{this.health.files='error: filesystem event or queue write failed';});
      });
      watcher.on('error',()=>{this.health.files='error: filesystem watcher failed';});this.watchers.push(watcher);
      for(const entry of await fsp.readdir(directory,{withFileTypes:true})) {
        if(entry.isSymbolicLink())continue;
        const child=path.join(directory,entry.name),st=await fsp.lstat(child).catch(()=>null);
        if(!st || (this.uid!==null && st.uid!==this.uid))continue;
        ownedNames.add(child);
        if(entry.isDirectory())await watchDirectory(root,child);
      }
    };
    for (const directory of directories) {
      try {
        const root=await fsp.realpath(directory);
        // Explicit per-directory recursion avoids following symlinks into unapproved roots.
        if((await fsp.lstat(directory)).isSymbolicLink())throw new Error('Symlink root');
        await watchDirectory(root,root);
        this.health.files=this.watchers.length?'healthy: OS change notifications (no reads)':'unavailable: approved directory ownership';
      } catch { this.health.files='unavailable: approved directory or recursive watcher'; }
    }
    if (!directories.length) this.health.files='disabled: no approved directories';
  }
  close() { this.generation++; this.watchers.forEach(w=>w.close()); this.watchers=[]; }
}

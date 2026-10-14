import {spawn} from 'node:child_process';
import path from 'node:path';
import {nativeDirectory} from './native.js';
export async function acquireUserLock(directory, onLost=()=>process.kill(process.pid,'SIGTERM')) {
  const child=spawn(path.join(nativeDirectory,'macos-lock'),[path.join(directory,'service.flock')],{stdio:['pipe','pipe','ignore']});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('User instance lock timed out'));},5000);
    child.once('error',()=>{clearTimeout(timer);reject(new Error('User instance lock unavailable'));});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('Agent is already running or instance lock is unsafe'));});
    child.stdout.once('data',data=>{clearTimeout(timer);data.toString().trim()==='locked'?resolve():reject(new Error('Invalid instance lock response'));});
  });
  child.stdin.on('error',()=>{});
  let released=false;
  child.once('exit',()=>{if(!released)onLost();});
  return ()=>{released=true;child.stdin.end();};
}

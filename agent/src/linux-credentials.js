import {spawn} from 'node:child_process';

// Host-key encryption works for a root system service before any GUI login.
// Secret material goes through pipes, never argv, the environment or logs.
export function hostCredential(action, value, spawnProcess=spawn) {
  if (!['encrypt','decrypt'].includes(action)) throw new Error('Invalid credential operation');
  return new Promise((resolve,reject)=>{
    const child=spawnProcess('/usr/bin/systemd-creds',[action,'--name=cyberorbit',...(action==='encrypt'?['--with-key=host']:[]),'-','-'],{stdio:['pipe','pipe','ignore']});
    let chunks=[],size=0,settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(new Error('Host credential storage unavailable')):resolve(result);};
    const timer=setTimeout(()=>{child.kill();finish(true);},15000);
    child.on('error',()=>finish(true));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>65536){child.kill();finish(true);}else chunks.push(chunk);});
    child.on('close',code=>finish(code!==0,Buffer.concat(chunks).toString('utf8')));
    child.stdin.on('error',()=>{});child.stdin.end(value);
  });
}

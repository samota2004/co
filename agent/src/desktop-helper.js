import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { exec, nativeDirectory, powershell, nativeInput, windowsHelperArguments, nativeStderrCategory, nativeFailure } from './native.js';
import { sendSample } from './ipc.js';
export async function runDesktopHelper(config) {
  let grant;
  if(process.platform==='win32') grant=JSON.parse(await nativeInput('vault.ps1',{action:'unprotect',value:await fs.readFile(path.join(config.dataDirectory,'helper.dpapi'),'utf8')}));
  else grant=JSON.parse(await fs.readFile(path.join(config.dataDirectory,'helper-capability.json'),'utf8'));
  console.log('CYBERORBIT desktop activity monitoring is enabled. On managed Windows installations, contact your administrator to disable monitoring.');
  if(config.browserTitles===true) console.log('Browser title monitoring enabled: active browser window titles may include private page names or search terms. No page bodies or URL history are collected.');
  if(process.platform==='linux') {
    if(!process.env.DISPLAY || process.env.XDG_SESSION_TYPE==='wayland') throw new Error('Linux foreground collector requires X11; Wayland unsupported');
    if(grant.identity!==`uid:${process.getuid()}`) throw new Error('Desktop identity mismatch');
    while(true) {
      try {
        const {stdout:window} = await exec('xprop',['-root','_NET_ACTIVE_WINDOW'],{timeout:3000});
        const id=window.match(/0x[0-9a-f]+/i)?.[0];if(!id || id==='0x0') {await new Promise(r=>setTimeout(r,2000));continue;}
        const {stdout:property}=await exec('xprop',['-id',id,'_NET_WM_PID'],{timeout:3000});
        const pid=Number(property.match(/=\s*(\d+)/)?.[1]);
        if(!pid) throw new Error('Foreground PID unavailable');
        const name=(await fs.readFile(`/proc/${pid}/comm`,'utf8')).trim();
        const {stdout:idle}=await exec('xprintidle',[],{timeout:3000});
        await sendSample(grant,{identity:grant.identity,sessionId:process.env.XDG_SESSION_ID || `desktop:${process.getuid()}`,pid,name,idleMilliseconds:Number(idle.trim())});
      }catch {console.error('Desktop sample unavailable; check X11 tools and background service.');}
      await new Promise(r=>setTimeout(r,2000));
    }
  }
  const file=process.platform==='win32'?'windows-desktop.ps1':'macos-desktop';
  const child=process.platform==='win32' ? spawn(powershell,[...windowsHelperArguments(file),'-Exclusive',...(config.browserTitles===true?['-BrowserTitles']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']}) : spawn(path.join(nativeDirectory,file),[],{stdio:['ignore','pipe','pipe']});
  const category=nativeStderrCategory(child);child.on('error',()=>console.error(nativeFailure(file,null,'HELPER_STARTUP').message));
  process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
  const lines=readline.createInterface({input:child.stdout});
  for await(const line of lines) try {
    const sample=JSON.parse(line);if(sample.identity!==grant.identity) throw new Error('Desktop identity mismatch');
    await sendSample(grant,sample);
  }catch {console.error('Desktop sample unavailable; check background service and assignment.');}
  throw nativeFailure(file,child.exitCode,category());
}

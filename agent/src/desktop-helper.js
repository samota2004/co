import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { nativeDirectory, powershell, nativeInput, windowsHelperArguments, nativeStderrCategory, nativeFailure } from './native.js';
import { sendSample } from './ipc.js';
import {nativeDesktopControl} from './desktop-control.js';
export async function runDesktopHelper(config) {
  let grant;
  if(process.platform==='win32') grant=JSON.parse(await nativeInput('vault.ps1',{action:'unprotect',value:await fs.readFile(path.join(config.dataDirectory,'helper.dpapi'),'utf8')}));
  else grant=JSON.parse(await fs.readFile(config.helperCapabilityFile || path.join(config.dataDirectory,'helper-capability.json'),'utf8'));
  console.log('CYBERORBIT desktop activity monitoring is enabled. Contact your administrator to change monitoring.');
  if(config.browserTitles===true) console.log('Browser title monitoring enabled: active browser window titles may include private page names or search terms. No page bodies or URL history are collected.');
  if(process.platform!=='win32' && grant.identity!==`uid:${process.getuid()}`) throw new Error('Desktop identity mismatch');
  const userPort=async()=>{
    if(config.installMode!=='user')return undefined;
    const port=Number(await fs.readFile(path.join(config.dataDirectory,'ipc-port'),'utf8'));
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local IPC port');
    return port;
  };
  // Bootstrap the signed control path before any native observation. A helper
  // with no foreground sample must still be able to receive enable controls.
  const initialPort=process.platform==='darwin'?await userPort():undefined;
  const initialReply=process.platform==='darwin'?await sendSample(grant,{kind:'desktop-control',identity:grant.identity},initialPort?{port:initialPort}:{}):null;
  const file=process.platform==='win32'?'windows-desktop.ps1':process.platform==='linux'?'linux-desktop.py':'macos-desktop';
  const titleArgs=config.browserTitles===true?['--browser-titles']:[];
  const child=process.platform==='win32'
    ? spawn(powershell,[...windowsHelperArguments(file),'-Exclusive',...(config.browserTitles===true?['-BrowserTitles']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']})
    : process.platform==='linux'
      ? spawn('/usr/bin/python3',[path.join(nativeDirectory,file),...titleArgs],{stdio:['ignore','pipe','pipe']})
      : spawn(path.join(nativeDirectory,file),titleArgs,{stdio:['pipe','pipe','pipe']});
  const category=nativeStderrCategory(child);child.on('error',()=>console.error(nativeFailure(file,null,'HELPER_STARTUP').message));
  child.stdin?.on('error',()=>{});
  if(initialReply) {
    const control=nativeDesktopControl(initialReply);child.stdin.write(JSON.stringify(control)+'\n');
    console.log(`CYBERORBIT desktop controls authenticated: activeApplication=${control.activeApplication}; browserTitles=${control.browserTitles}`);
  }
  process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
  if(config.installMode==='user')process.once('disconnect',()=>child.kill());
  let lastError=0;
  const lines=readline.createInterface({input:child.stdout});
  for await(const line of lines) try {
    const sample=JSON.parse(line);if(sample.identity!==grant.identity) throw new Error('Desktop identity mismatch');
    const port=await userPort();
    const reply=await sendSample(grant,sample,port?{port}:{});
    if(process.platform==='darwin' && child.stdin.writable) child.stdin.write(JSON.stringify(nativeDesktopControl(reply))+'\n');
  }catch {if(Date.now()-lastError>60000){console.error('Desktop sample unavailable; check background service and assignment.');lastError=Date.now();}}
  throw nativeFailure(file,child.exitCode,category());
}

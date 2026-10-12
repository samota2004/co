import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { nativeDirectory, powershell, nativeInput, windowsHelperArguments, nativeStderrCategory, nativeFailure } from './native.js';
import { sendSample } from './ipc.js';
export async function runDesktopHelper(config) {
  let grant;
  if(process.platform==='win32') grant=JSON.parse(await nativeInput('vault.ps1',{action:'unprotect',value:await fs.readFile(path.join(config.dataDirectory,'helper.dpapi'),'utf8')}));
  else grant=JSON.parse(await fs.readFile(config.helperCapabilityFile || path.join(config.dataDirectory,'helper-capability.json'),'utf8'));
  console.log('CYBERORBIT desktop activity monitoring is enabled. Contact your administrator to change monitoring.');
  if(config.browserTitles===true) console.log('Browser title monitoring enabled: active browser window titles may include private page names or search terms. No page bodies or URL history are collected.');
  if(process.platform!=='win32' && grant.identity!==`uid:${process.getuid()}`) throw new Error('Desktop identity mismatch');
  const file=process.platform==='win32'?'windows-desktop.ps1':process.platform==='linux'?'linux-desktop.py':'macos-desktop';
  const titleArgs=config.browserTitles===true?['--browser-titles']:[];
  const child=process.platform==='win32'
    ? spawn(powershell,[...windowsHelperArguments(file),'-Exclusive',...(config.browserTitles===true?['-BrowserTitles']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']})
    : process.platform==='linux'
      ? spawn('/usr/bin/python3',[path.join(nativeDirectory,file),...titleArgs],{stdio:['ignore','pipe','pipe']})
      : spawn(path.join(nativeDirectory,file),titleArgs,{stdio:['ignore','pipe','pipe']});
  const category=nativeStderrCategory(child);child.on('error',()=>console.error(nativeFailure(file,null,'HELPER_STARTUP').message));
  process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
  const lines=readline.createInterface({input:child.stdout});
  for await(const line of lines) try {
    const sample=JSON.parse(line);if(sample.identity!==grant.identity) throw new Error('Desktop identity mismatch');
    await sendSample(grant,sample);
  }catch {console.error('Desktop sample unavailable; check background service and assignment.');}
  throw nativeFailure(file,child.exitCode,category());
}

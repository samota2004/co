import fs from 'node:fs/promises';
import path from 'node:path';
import {readConfig} from './config.js';
import {sendSample} from './ipc.js';
import {userContext,ownedPath} from './macos-user.js';
import {fileURLToPath} from 'node:url';

export const browserHosts=Object.freeze({
  chrome:{appId:'com.google.Chrome',directory:'Google/Chrome/NativeMessagingHosts'},
  edge:{appId:'com.microsoft.edgemac',directory:'Microsoft Edge/NativeMessagingHosts'},
  chromium:{appId:'org.chromium.Chromium',directory:'Chromium/NativeMessagingHosts'},
  brave:{appId:'com.brave.Browser',directory:'BraveSoftware/Brave-Browser/NativeMessagingHosts'},
  firefox:{appId:'org.mozilla.firefox',directory:'Mozilla/NativeMessagingHosts'}
});
export function parseNativeMessages(buffer) {
  const messages=[];let offset=0;
  while(buffer.length-offset>=4) {
    const size=buffer.readUInt32LE(offset);if(size>4096)throw new Error('Native message exceeds limit');
    if(buffer.length-offset-4<size)break;
    messages.push(JSON.parse(buffer.subarray(offset+4,offset+4+size).toString('utf8')));offset+=size+4;
  }
  return {messages,rest:buffer.subarray(offset)};
}
async function main() {
  const [browser,...origins]=process.argv.slice(2),context=userContext(),host=browserHosts[browser];
  if(!host)throw new Error('Unsupported companion');
  const file=path.join(context.root,'config.json');await ownedPath(file,context.uid);
  const config=await readConfig(file), registered=config.browserCompanions?.[browser];
  const expected=browser==='firefox'?'cyberorbit-companion@cyberorbit.local':`chrome-extension://${registered}/`;
  if(!registered || !origins.includes(expected))throw new Error('Unregistered browser companion');
  const grant=JSON.parse(await fs.readFile(path.join(config.dataDirectory,'helper-capability.json'),'utf8'));
  let buffer=Buffer.alloc(0);
  for await(const chunk of process.stdin) {
    buffer=Buffer.concat([buffer,chunk]);if(buffer.length>65536)throw new Error('Native message exceeds limit');
    const parsed=parseNativeMessages(buffer);buffer=parsed.rest;
    for(const message of parsed.messages) {
      let accepted=false,browserTitles=false;
      try {
        const port=Number(await fs.readFile(path.join(config.dataDirectory,'ipc-port'),'utf8'));
        if(!Number.isInteger(port) || port<1 || port>65535)throw new Error();
        const control=await sendSample(grant,{kind:'browser-control',identity:grant.identity},{port});
        browserTitles=control.browserTitles===true;
        if(browserTitles && message.kind==='proof')await sendSample(grant,{kind:'browser-proof',identity:grant.identity,appId:host.appId,
          incognito:message.incognito,focused:message.focused,title:typeof message.title==='string'?message.title:undefined},{port});
        accepted=true;
      }catch{}
      const reply=Buffer.from(JSON.stringify({accepted,browserTitles})),size=Buffer.alloc(4);size.writeUInt32LE(reply.length);process.stdout.write(Buffer.concat([size,reply]));
    }
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('CYBERORBIT browser companion unavailable; check local enrollment and monitoring status.\n');process.exitCode=1;});

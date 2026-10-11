import {spawn} from 'node:child_process';
const browserPath=process.env.CYBERORBIT_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export async function browser(profile) {
  const child=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const url=await new Promise((resolve,reject)=>{
    let text='';const timer=setTimeout(()=>reject(new Error('Browser startup timeout')),20000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
  }).catch(e=>{child.kill();throw e;});
  const ws=new WebSocket(url);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map(),listeners=[];
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}
    else listeners.forEach(fn=>fn(m));
  });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const request=++id;const timer=setTimeout(()=>{pending.delete(request);reject(new Error(`Browser command timeout: ${method}`));},15000);
    pending.set(request,{resolve,reject,timer});ws.send(JSON.stringify({id:request,method,params,...(sessionId?{sessionId}:{})}));
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  const evaluate=async expression=>{
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const close=async()=>{try{await send('Browser.close');}catch{}ws.close();child.kill();};
  return {command,send,evaluate,listeners,close};
}
export async function waitUntil(b,expression,label) {
  for(let i=0;i<150;i++){if(await b.evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}
  const visible=await b.evaluate("document.body.innerText.slice(0,1200)");
  throw new Error(`Browser did not reach: ${label}. Visible page: ${visible.replace(/[A-Za-z0-9_-]{43,}|\b\d{6}\b/g,'<redacted>')}`);
}


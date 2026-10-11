import http from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const IPC_PORT = 47731;
export const sign = (key, text) => createHmac('sha256',Buffer.from(key,'base64')).update(text).digest('hex');
const equal = (a,b) => typeof a==='string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
export function startIpc(secrets, onSample, {port=IPC_PORT}={}) {
  const seen=new Map();
  const server=http.createServer(async (req,res)=> {
    if (req.method!=='POST' || req.url!=='/sample' || req.headers.origin || req.headers.host!==`127.0.0.1:${server.address().port}`) {res.writeHead(403).end();return;}
    const time=req.headers['x-orbit-time'], nonce=req.headers['x-orbit-nonce'];
    if (!/^\d{13}$/.test(time || '') || Math.abs(Date.now()-Number(time))>30000 || !/^[a-f0-9]{32}$/.test(nonce || '')) {res.writeHead(401).end();return;}
    let body='',bytes=0;
    try {
      for await (const b of req) { bytes+=b.length; if(bytes>4096) {res.writeHead(413).end();return;} body+=b; }
      if (!equal(req.headers['x-orbit-signature'],sign(secrets.helperKey,`${time}\n${nonce}\n${body}`))) {res.writeHead(401).end();return;}
      for(const [n,t] of seen) if(t<Date.now()-30000) seen.delete(n);
      if(seen.has(nonce) || seen.size>1000) {res.writeHead(409).end();return;} seen.set(nonce,Date.now());
      const data=JSON.parse(body);
      if (data.identity!==secrets.mappedIdentity) {res.writeHead(403).end();return;}
      await onSample({...data,identity:secrets.mappedIdentity});
      const reply=JSON.stringify({accepted:true});
      res.writeHead(200,{'Content-Type':'application/json','x-orbit-signature':sign(secrets.helperKey,`${nonce}\n${reply}`)}); res.end(reply);
    } catch { if(!res.headersSent) res.writeHead(400);res.end(); }
  });
  server.requestTimeout=5000; server.headersTimeout=5000; server.maxConnections=20;
  return new Promise((resolve,reject)=> {server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
export async function sendSample(grant, sample, {port=IPC_PORT}={}) {
  const time=String(Date.now()), nonce=randomBytes(16).toString('hex'), body=JSON.stringify(sample);
  const response=await fetch(`http://127.0.0.1:${port}/sample`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
    headers:{'Content-Type':'application/json','x-orbit-time':time,'x-orbit-nonce':nonce,'x-orbit-signature':sign(grant.key,`${time}\n${nonce}\n${body}`)},body});
  const reply=await response.text();
  if(!response.ok || !equal(response.headers.get('x-orbit-signature'),sign(grant.key,`${nonce}\n${reply}`))) throw new Error('Local service authentication failed');
}

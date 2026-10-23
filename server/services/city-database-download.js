import {get} from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Readable} from 'node:stream';

const LIMIT=160*1024*1024,PART=1024*1024;
const runFile=promisify(execFile);
function nativePart(url,options){
  return new Promise((resolve,reject)=>{
    const request=get(url,{...options,timeout:30000,family:4,autoSelectFamily:false,minVersion:'TLSv1.2'},resolve);
    request.on('timeout',()=>request.destroy(new Error('City database download inactive for 30 seconds')));
    request.on('error',reject);
  });
}
export function parseDatabasePart(buffer){
  const boundary=buffer.indexOf('\r\n\r\n');
  if(boundary<0||boundary>8192)throw new Error('Invalid city download headers');
  const lines=buffer.subarray(0,boundary).toString('ascii').split('\r\n');
  const statusCode=Number(/^HTTP\/[\d.]+ (\d{3})\b/.exec(lines.shift())?.[1]);
  const headers={};for(const line of lines){const colon=line.indexOf(':');if(colon>0)headers[line.slice(0,colon).toLowerCase()]=line.slice(colon+1).trim();}
  return Object.assign(Readable.from([buffer.subarray(boundary+4)]),{statusCode,headers});
}
export async function requestDatabasePart(url,options){
  // The OS curl transport is reliable on machines with a stalled Node HTTPS
  // route. Fixed URL and argument array, verified TLS, no redirects or shell.
  // No credentials or employee IPs are involved in this public build download.
  try{
    const {stdout}=await runFile('curl',['--ipv4','--fail','--silent','--show-error','--include','--suppress-connect-headers','--proto','=https','--tlsv1.2','--connect-timeout','10','--max-time','45','--header','Accept-Encoding: identity','--range',options.headers.Range.slice(6),url],{
      encoding:'buffer',maxBuffer:PART+16384,timeout:50000,signal:options.signal,windowsHide:true
    });
    return parseDatabasePart(stdout);
  }catch(cause){if(cause.code==='ENOENT')return nativePart(url,options);throw new Error('City database HTTPS part download failed',{cause});}
}
// Small ranges with at most four in flight avoid one stalled large transfer.
// Buffering is bounded to four MiB; emitted bytes stay in original order.
// The caller still
// verifies the SHA-1 of the entire compressed official release before use.
export async function* cityDatabaseChunks(url,{signal,requestPart=requestDatabasePart,onProgress=()=>{}}={}){
  if(!/^https:\/\/download\.db-ip\.com\/free\/dbip-city-lite-\d{4}-\d{2}\.mmdb\.gz$/.test(url))throw new Error('Invalid official city download URL');
  async function readRange(offset,total=null){
    signal?.throwIfAborted();
    const response=await requestPart(url,{signal,headers:{Accept:'application/octet-stream','Accept-Encoding':'identity',Range:`bytes=${offset}-${offset+PART-1}`}});
    const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range']||'');
    if(response.statusCode!==206||!match){response.destroy();throw new Error('City database server did not supply a verified byte range');}
    const [start,end,size]=match.slice(1).map(Number);
    if(start!==offset||!Number.isSafeInteger(size)||size<=0||size>LIMIT||(total!==null&&size!==total)||end!==Math.min(offset+PART-1,size-1)){
      response.destroy();throw new Error('City database response range is invalid');
    }
    let received=0;const chunks=[];
    try{
      for await(const chunk of response){received+=chunk.length;if(received>end-start+1)throw new Error('City database response exceeded requested range');chunks.push(chunk);}
      if(received!==end-start+1)throw new Error('City database response range was truncated');
    }finally{response.destroy();}
    return {total:size,end,bytes:Buffer.concat(chunks)};
  }
  const first=await readRange(0);yield first.bytes;let offset=first.end+1;onProgress(offset,first.total);
  while(offset<first.total){
    const tasks=[];for(let i=0;i<4&&offset+i*PART<first.total;i++)tasks.push(readRange(offset+i*PART,first.total));
    const results=await Promise.allSettled(tasks);
    const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    for(const {value} of results){yield value.bytes;offset=value.end+1;}
    onProgress(offset,first.total);
  }
}

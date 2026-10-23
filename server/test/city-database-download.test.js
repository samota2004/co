import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {cityDatabaseChunks,parseDatabasePart} from '../services/city-database-download.js';
const url='https://download.db-ip.com/free/dbip-city-lite-2026-10.mmdb.gz';
const part=(body,start,end,size,status=206)=>Object.assign(Readable.from([body]),{statusCode:status,headers:{'content-range':`bytes ${start}-${end}/${size}`}});
async function collect(options){const chunks=[];for await(const b of cityDatabaseChunks(url,options))chunks.push(b);return Buffer.concat(chunks);}

test('curl header parsing preserves binary bytes and exposes only the response range/status',async()=>{
  const bytes=Buffer.from([0,255,31,139,0]);
  const result=parseDatabasePart(Buffer.concat([Buffer.from('HTTP/2 206 Partial Content\r\nContent-Range: bytes 0-4/5\r\n\r\n'),bytes]));
  assert.equal(result.statusCode,206);assert.equal(result.headers['content-range'],'bytes 0-4/5');
  const chunks=[];for await(const b of result)chunks.push(b);assert.deepEqual(Buffer.concat(chunks),bytes);
  assert.throws(()=>parseDatabasePart(Buffer.from('invalid')));
});

test('official database ranges are sequential, bounded and preserve the exact compressed bytes',async()=>{
  const data=Buffer.alloc(1024*1024+17,123);let calls=0;
  const result=await collect({requestPart:async(target,options)=>{
    assert.equal(target,url);const expected=calls++===0?'bytes=0-1048575':'bytes=1048576-2097151';assert.equal(options.headers.Range,expected);
    assert.equal(options.headers['Accept-Encoding'],'identity');const start=calls===1?0:1048576,end=Math.min(start+1048575,data.length-1);
    return part(data.subarray(start,end+1),start,end,data.length);
  }});
  assert.equal(calls,2);assert.deepEqual(result,data);
});

test('database downloader rejects redirects, incorrect/truncated/oversized ranges and changed totals',async()=>{
  for(const requestPart of [
    async()=>part(Buffer.alloc(1),0,0,1,302),
    async()=>part(Buffer.alloc(1),1,1,1),
    async()=>part(Buffer.alloc(1),0,1,2),
    async()=>part(Buffer.alloc(3),0,1,2),
    async()=>part(Buffer.alloc(1),0,0,161*1024*1024)
  ])await assert.rejects(collect({requestPart}));
  let calls=0;
  await assert.rejects(collect({requestPart:async()=>++calls===1?part(Buffer.alloc(1048576),0,1048575,1048577):part(Buffer.alloc(2),1048576,1048577,1048578)}));
  let requested=false;await assert.rejects(async()=>{for await(const _ of cityDatabaseChunks('http://untrusted.invalid/db.gz',{requestPart:()=>{requested=true;}})){} });assert.equal(requested,false);
  const signal=AbortSignal.abort();await assert.rejects(collect({signal,requestPart:()=>{requested=true;}}));assert.equal(requested,false);
});

test('parallel database parts remain ordered with at most four in flight',async()=>{
  const size=5*1024*1024+17;let active=0,maximum=0;
  const result=await collect({requestPart:async(target,options)=>{
    const start=Number(/^bytes=(\d+)-/.exec(options.headers.Range)[1]),end=Math.min(start+1048575,size-1);
    active++;maximum=Math.max(maximum,active);
    const response=Readable.from((async function*(){
      try{await new Promise(resolve=>setTimeout(resolve,start===1048576?15:1));yield Buffer.alloc(end-start+1,Math.floor(start/1048576));}
      finally{active--;}
    })());
    return Object.assign(response,{statusCode:206,headers:{'content-range':`bytes ${start}-${end}/${size}`}});
  }});
  assert.equal(maximum,4);assert.equal(active,0);assert.equal(result.length,size);
  for(let offset=0;offset<size;offset+=1048576)assert.equal(result[offset],Math.floor(offset/1048576));
});

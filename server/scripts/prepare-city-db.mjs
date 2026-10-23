import {mkdir,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import path from 'node:path';
import dotenv from 'dotenv';
import {open as openDatabase} from 'maxmind';
import {cityDatabasePath,cityDatabaseInfoPath,releaseManifest,validateCityDatabase,verifiedCityReader} from '../services/local-city.js';
import {cityDatabaseChunks} from '../services/city-database-download.js';
dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});

if(process.env.IPAPI_PROVIDER!=='db-ip-lite'&&!process.argv.includes('--force')) {
  console.log('Local city database not selected; existing API provider build unchanged.');
}else {
  const {url,release,sha1}=releaseManifest;
  if(url!==`https://download.db-ip.com/free/dbip-city-lite-${release}.mmdb.gz`||!/^\d{4}-\d{2}$/.test(release)||!/^[a-f0-9]{40}$/.test(sha1))throw new Error('Invalid city release manifest');
  try{
    const existing=await verifiedCityReader();validateCityDatabase(existing);
    console.log('Verified local city database already prepared: '+release);
  }catch {
    const directory=path.dirname(cityDatabasePath);await mkdir(directory,{recursive:true});
    const temporary=path.join(directory,'.download-'+randomUUID()+'.mmdb'),infoTemporary=temporary+'.json';
    try {
      console.log('Preparing DB-IP Lite city database '+release+' from the official download.');
      const signal=AbortSignal.timeout(600000);
      const compressed=createHash('sha1'),uncompressed=createHash('sha256');let inputSize=0,outputSize=0;
      const input=new Transform({transform(chunk,encoding,next){inputSize+=chunk.length;if(inputSize>160*1024*1024)return next(new Error('City database download exceeded limit'));compressed.update(chunk);next(null,chunk);}});
      const output=new Transform({transform(chunk,encoding,next){outputSize+=chunk.length;if(outputSize>256*1024*1024)return next(new Error('City database expansion exceeded limit'));uncompressed.update(chunk);next(null,chunk);}});
      let lastProgress=0;
      const onProgress=(bytes,total)=>{if(bytes-lastProgress>=8*1024*1024||bytes===total){lastProgress=bytes;console.log(`City database download: ${Math.floor(bytes/1024/1024)}/${Math.ceil(total/1024/1024)} MiB`);}};
      await pipeline(Readable.from(cityDatabaseChunks(url,{signal,onProgress})),input,createGunzip(),output,createWriteStream(temporary,{flags:'wx',mode:0o644}),{signal});
      if(compressed.digest('hex')!==sha1)throw new Error('City database checksum does not match the pinned official release');
      const reader=await openDatabase(temporary,{cache:{max:100}}),databaseDate=validateCityDatabase(reader);
      const info={release,source:url,compressedSha1:sha1,sha256:uncompressed.digest('hex'),databaseDate,bytes:(await stat(temporary)).size};
      await writeFile(infoTemporary,JSON.stringify(info,null,2)+'\n',{flag:'wx',mode:0o644});
      // Only this fixed build artifact is replaced; employee data is unrelated.
      await rename(temporary,cityDatabasePath);await rename(infoTemporary,cityDatabaseInfoPath);
      console.log('Verified local city database ready: '+JSON.stringify({release,databaseDate,bytes:info.bytes}));
    }finally{await unlink(temporary).catch(()=>{});await unlink(infoTemporary).catch(()=>{});}
  }
}

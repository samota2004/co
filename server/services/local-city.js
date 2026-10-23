import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {open as openDatabase} from 'maxmind';
import {publicAddress} from './public-address.js';

export const cityDatabasePath=fileURLToPath(new URL('../data/geoip/dbip-city-lite.mmdb',import.meta.url));
export const cityDatabaseInfoPath=cityDatabasePath+'.json';
export const releaseManifest=JSON.parse(await readFile(new URL('../data/geoip-release.json',import.meta.url),'utf8'));
export const MAX_DATABASE_AGE_MS=90*86400000;
const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120):'';
function error(reason){return Object.assign(new Error('Local city database unavailable'),{localReason:reason});}
export function validateCityDatabase(reader,now=Date.now()) {
  const date=Number(new Date(reader.metadata?.buildEpoch));
  if(!/dbip.*city.*lite/i.test(reader.metadata?.databaseType||'')||!Number.isFinite(date)||date>now+86400000)throw error('local-database-invalid');
  if(now-date>MAX_DATABASE_AGE_MS)throw error('local-database-stale');
  return new Date(date).toISOString();
}
export async function verifiedCityReader(path=cityDatabasePath,infoPath=cityDatabaseInfoPath) {
  const infoSize=(await stat(infoPath)).size;if(infoSize>16384)throw error('local-database-invalid');
  const info=JSON.parse(await readFile(infoPath,'utf8'));
  if(info.release!==releaseManifest.release||info.source!==releaseManifest.url||info.compressedSha1!==releaseManifest.sha1||!/^[a-f0-9]{64}$/.test(info.sha256||''))throw error('local-database-invalid');
  const size=(await stat(path)).size;if(size<=0||size>256*1024*1024)throw error('local-database-invalid');
  // Hash one streamed copy; openDatabase then keeps one read-only buffer in RAM.
  const {createReadStream}=await import('node:fs');const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  if(hash.digest('hex')!==info.sha256)throw error('local-database-invalid');
  return openDatabase(path,{cache:{max:1000}});
}
export class LocalCityLookup {
  constructor({load=verifiedCityReader,now=Date.now}={}){this.load=load;this.now=now;this.reader=null;this.loading=null;this.retryAt=0;this.failure=null;}
  async lookup(address) {
    const ip=publicAddress(address);if(!ip)return {status:'public-ip-unavailable'};
    try {
      if(!this.reader) {
        if(this.now()<this.retryAt)throw error(this.failure);
        this.loading??=this.load();
        try{this.reader=await this.loading;}finally{this.loading=null;}
      }
      const databaseDate=validateCityDatabase(this.reader,this.now()),record=this.reader.get(ip);
      const city=clean(record?.city?.names?.en),countryCode=record?.country?.iso_code;
      if(!city||!/^[A-Z]{2}$/.test(countryCode||''))return {status:'lookup-unavailable',provider:'db-ip-lite',reason:'location-unavailable'};
      return {status:'available',source:'heartbeat-public-ip',provider:'db-ip-lite',city,
        region:clean(record.subdivisions?.[0]?.names?.en),country:clean(record.country.names?.en),countryCode,
        resolvedAt:new Date(this.now()).toISOString(),databaseDate,databaseRelease:releaseManifest.release};
    }catch(cause) {
      const reason=['local-database-invalid','local-database-stale'].includes(cause?.localReason)?cause.localReason:'local-database-unavailable';
      this.retryAt=this.now()+60000;this.failure=reason;
      return {status:'lookup-unavailable',provider:'db-ip-lite',reason};
    }
  }
}

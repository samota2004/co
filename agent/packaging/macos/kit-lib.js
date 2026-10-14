import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
export const architectures=['arm64','x64'];
export const commands=['Install-CYBERORBIT.command','Uninstall-CYBERORBIT.command','Check-CYBERORBIT.command','Show-Employee-Identity.command','Enable-Browser-Titles.command'];
export const helpers=['keychain','macos-desktop','macos-lock'];
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export function safeRelative(value) {
  if(typeof value!=='string' || !value || value.startsWith('/') || value.includes('\\') || value.includes(':') || /[\x00-\x1f\x7f]/.test(value) || value.split('/').some(p=>!p || p==='.' || p==='..'))throw new Error('Unsafe package path');
  return value;
}
export async function filesIn(root,prefix='') {
  const files=[];
  for(const entry of await fs.readdir(root,{withFileTypes:true})) {
    const name=prefix+entry.name,file=path.join(root,entry.name),st=await fs.lstat(file);
    safeRelative(name);
    if(st.isSymbolicLink() || (!st.isFile()&&!st.isDirectory()))throw new Error('Package links/special files are prohibited');
    if(st.isDirectory())files.push(...await filesIn(file,name+'/'));
    else files.push(name);
  }
  return files.sort();
}
export function assertMachO(bytes,arch) {
  const cpu={arm64:0x0100000c,x64:0x01000007}[arch];
  if(bytes.length<32 || bytes.readUInt32LE(0)!==0xfeedfacf || bytes.readUInt32LE(4)!==cpu || bytes.readUInt32LE(12)!==2)throw new Error(`Missing or wrong-architecture macOS executable (${arch}); source and Windows executables are not install payloads`);
}
export async function validatePayload(root,arch,version) {
  if(!architectures.includes(arch))throw new Error('Unsupported payload architecture');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  if(manifest.version!==version)throw new Error('Agent version differs between payloads');
  const contract=await fs.readFile(path.join(root,'shared/contract.js'),'utf8');
  if(!contract.includes(`AGENT_VERSION = '${version}'`))throw new Error('Stale shared contract');
  for(const binary of ['runtime/node',...helpers.map(h=>'native/'+h)])assertMachO(await fs.readFile(path.join(root,binary)),arch);
  for(const file of ['src/cli.js','src/macos-user-install.js','src/service.js','packaging/macos/install-user.sh','packaging/macos/uninstall-user.sh','browser-companion/chromium/background.js','browser-companion/firefox/background.js'])await fs.access(path.join(root,file));
}
export async function writeInventory(root) {
  const lines=[];
  for(const file of await filesIn(root))if(file!=='SHA256SUMS')lines.push(`${sha256(await fs.readFile(path.join(root,file)))}  ${file}`);
  await fs.writeFile(path.join(root,'SHA256SUMS'),lines.join('\n')+'\n');
}
export async function verifyKit(root,arch) {
  const manifest=JSON.parse(await fs.readFile(path.join(root,'kit-manifest.json'),'utf8'));
  if(manifest.format!==1 || manifest.kind!=='employee-install' || manifest.platform!=='darwin' || manifest.buildComplete!==true || JSON.stringify(manifest.architectures)!==JSON.stringify(architectures))throw new Error('This is not a complete built Mac employee kit');
  if(!architectures.includes(arch))throw new Error('Unsupported Mac architecture');
  const inventory=await fs.readFile(path.join(root,'SHA256SUMS'),'utf8'),seen=new Set();
  for(const line of inventory.trim().split('\n')) {
    const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match)throw new Error('Invalid package checksum record');
    const file=safeRelative(match[2]);if(seen.has(file) || file==='SHA256SUMS')throw new Error('Duplicate checksum record');seen.add(file);
    const st=await fs.lstat(path.join(root,file));if(!st.isFile()||st.isSymbolicLink())throw new Error('Unsafe package file');
    if(sha256(await fs.readFile(path.join(root,file)))!==match[1])throw new Error(`Package checksum failed: ${file}`);
  }
  const actual=(await filesIn(root)).filter(f=>f!=='SHA256SUMS');
  if(actual.length!==seen.size || actual.some(f=>!seen.has(f)))throw new Error('Package has missing or unexpected files');
  for(const file of [...commands,'README.txt','lib/employee-common.sh','lib/verify-kit.js','lib/kit-lib.js','kit-manifest.json','package.json'])if(!seen.has(file))throw new Error('Incomplete employee commands');
  const packageConfig=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  if(packageConfig.type!=='module')throw new Error('Employee kit requires ES module configuration');
  for(const target of architectures)await validatePayload(path.join(root,'payloads',target),target,manifest.agentVersion);
  return manifest;
}
const crcTable=Array.from({length:256},(_,value)=>{
  for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
function crc32(data) {let value=0xffffffff;for(const byte of data)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
export function executable(file) {return /\.(command|sh)$/.test(file)||/\/runtime\/node$/.test(file)||/\/native\/(keychain|macos-desktop|macos-lock)$/.test(file);}
// Dependency-free ZIP with Unix execute bits. Archive Utility can double-click
// .command files after extraction; PowerShell Compress-Archive loses those bits.
export async function createZip(root,destination,{folder=path.basename(root)}={}) {
  safeRelative(folder);const local=[],central=[];let offset=0;
  const now=new Date(),date=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2);
  const files=await filesIn(root);if(files.length>65535)throw new Error('ZIP entry limit exceeded');
  for(const file of files) {
    const name=Buffer.from(folder+'/'+file),data=await fs.readFile(path.join(root,file));
    if(data.length>256*1024*1024)throw new Error('Package file exceeds size limit');
    const compressed=deflateRawSync(data,{level:6}),crc=crc32(data),header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(time,10);header.writeUInt16LE(date,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    local.push(header,name,compressed);
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(0x0314,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(time,12);record.writeUInt16LE(date,14);
    record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);
    record.writeUInt32LE(((executable(folder+'/'+file)?0o100755:0o100644)<<16)>>>0,38);record.writeUInt32LE(offset,42);central.push(record,name);
    offset+=header.length+name.length+compressed.length;if(offset>0xffffffff)throw new Error('ZIP size limit exceeded');
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  await fs.writeFile(destination,Buffer.concat([...local,directory,end]),{flag:'wx',mode:0o600});
  const hash=sha256(await fs.readFile(destination));await fs.writeFile(destination+'.sha256',`${hash}  ${path.basename(destination)}\n`,{flag:'wx',mode:0o600});return {destination,files:files.length,sha256:hash};
}

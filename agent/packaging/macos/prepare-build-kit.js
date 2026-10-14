import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {architectures,sha256,filesIn,createZip} from './kit-lib.js';
const agent=fileURLToPath(new URL('../../',import.meta.url)),packaging=path.join(agent,'packaging/macos');
async function download(url) {
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Official runtime download failed (${response.status})`);
  const chunks=[];let size=0;
  for await(const chunk of response.body) {size+=chunk.length;if(size>100*1024*1024)throw new Error('Runtime archive exceeds download limit');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export async function prepare(args=[]) {
  let cache=path.join(agent,'dist/macos-runtime-cache');
  if(args.length) {if(args.length!==2||args[0]!=='--runtime-archives')throw new Error('Use --runtime-archives DIRECTORY for already downloaded official runtimes');cache=path.resolve(args[1]);}
  const spec=JSON.parse(await fs.readFile(path.join(packaging,'node-runtime.json'),'utf8'));
  await fs.mkdir(cache,{recursive:true,mode:0o700});
  for(const arch of architectures) {
    const archive=spec.archives[arch],file=path.join(cache,archive.file);
    let data;
    try {data=await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!data) {
      console.log(`Downloading official ${archive.file}...`);
      data=await download(`https://nodejs.org/dist/${spec.version}/${archive.file}`);
      if(sha256(data)!==archive.sha256)throw new Error('Downloaded Node archive does not match pinned official SHA-256');
      await fs.writeFile(file,data,{mode:0o600,flag:'wx'});
    }
    if(sha256(data)!==archive.sha256)throw new Error('Cached Node archive checksum mismatch; preserve/review it before rebuilding');
  }
  const root=path.join(agent,'dist/CYBERORBIT-macOS-Build-Kit');await fs.mkdir(root,{mode:0o700});
  await fs.mkdir(path.join(root,'agent'));
  // Explicit public-source allowlist. Never copy repository secrets, live data,
  // node_modules, Windows kits or enrolled local state.
  for(const name of ['src','shared','native','packaging','browser-companion'])await fs.cp(path.join(agent,name),path.join(root,'agent',name),{recursive:true});
  await fs.copyFile(path.join(agent,'package.json'),path.join(root,'agent/package.json'));
  await fs.mkdir(path.join(root,'agent/test'));
  for(const name of ['macos-user.test.js','macos-runtime.test.js','macos-kit.test.js'])await fs.copyFile(path.join(agent,'test',name),path.join(root,'agent/test',name));
  for(const browser of ['chromium','firefox'])await fs.copyFile(path.join(agent,'browser-companion/background.js'),path.join(root,'agent/browser-companion',browser,'background.js'));
  await fs.copyFile(path.join(packaging,'Build-Mac-Install-Kit.command'),path.join(root,'Build-Mac-Install-Kit.command'));
  await fs.copyFile(path.join(packaging,'BUILD-README.txt'),path.join(root,'README.txt'));
  await fs.copyFile(path.join(agent,'MACOS-VERIFICATION.md'),path.join(root,'MACOS-VERIFICATION.md'));
  await fs.mkdir(path.join(root,'runtime-archives'));
  const checksums=[];
  for(const arch of architectures) {
    const archive=spec.archives[arch];await fs.copyFile(path.join(cache,archive.file),path.join(root,'runtime-archives',archive.file));
    checksums.push(`${archive.sha256}  ${archive.file}`);
  }
  await fs.writeFile(path.join(root,'runtime-archives/SHA256SUMS'),checksums.join('\n')+'\n');
  await fs.writeFile(path.join(root,'build-kit-manifest.json'),JSON.stringify({format:1,kind:'macos-build',employeeInstallable:false,nodeVersion:spec.version,architectures,generatedOn:process.platform,generatedAt:new Date().toISOString()},null,2)+'\n');
  const files=await filesIn(root);
  if(files.some(f=>/(^|\/)(\.env[^/]*|credential\.(dpapi|host)(\.tmp)?|helper-capability\.json|queue|enrollment-marker)(\/|$)/.test(f)))throw new Error('Unexpected local state in build kit');
  const result=await createZip(root,path.join(agent,'dist/CYBERORBIT-macOS-Build-Kit.zip'));
  console.log(JSON.stringify({...result,employeeInstallable:false,next:'Extract on a Mac and double-click Build-Mac-Install-Kit.command'},null,2));return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepare(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});

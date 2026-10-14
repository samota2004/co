import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {architectures,commands,helpers,sha256,validatePayload,writeInventory,verifyKit,createZip} from './kit-lib.js';
const exec=promisify(execFile),agent=fileURLToPath(new URL('../../',import.meta.url)),packaging=path.join(agent,'packaging/macos');
export async function build(args) {
  if(process.platform!=='darwin' || process.getuid()===0)throw new Error('Build on a logged-in Mac with Apple Command Line Tools, without sudo. Windows cannot compile these helpers.');
  const options={};for(let i=0;i<args.length;i+=2){if(!['--runtime-archives','--output'].includes(args[i])||!args[i+1])throw new Error('Use --runtime-archives DIR --output DIR');options[args[i]]=path.resolve(args[i+1]);}
  const archives=options['--runtime-archives'],output=options['--output'] || path.join(agent,'dist/macos-install-kit-build');
  if(!archives)throw new Error('Verified runtime archives required; use Build-Mac-Install-Kit.command.');
  const runtime=JSON.parse(await fs.readFile(path.join(packaging,'node-runtime.json'),'utf8'));
  if(process.version!==runtime.version)throw new Error('Use the Node runtime bundled with the build kit.');
  await exec('/usr/bin/xcrun',['--find','swiftc'],{timeout:10000});
  await fs.mkdir(output,{recursive:false,mode:0o700});
  const kit=path.join(output,'CYBERORBIT-macOS-Install-Kit');await fs.mkdir(kit,{mode:0o755});
  for(const arch of architectures) {
    console.log(`Building ${arch} payload...`);
    const archive=runtime.archives[arch],archiveFile=path.join(archives,archive.file);
    if(sha256(await fs.readFile(archiveFile))!==archive.sha256)throw new Error('Official Node runtime checksum mismatch');
    const root=path.join(kit,'payloads',arch);await fs.mkdir(root,{recursive:true});
    for(const name of ['src','shared','native','packaging','browser-companion'])await fs.cp(path.join(agent,name),path.join(root,name),{recursive:true});
    await fs.copyFile(path.join(agent,'package.json'),path.join(root,'package.json'));
    await fs.mkdir(path.join(root,'runtime'));
    const extracted=path.join(output,`node-${arch}`);await fs.mkdir(extracted);
    await exec('/usr/bin/tar',['-xzf',archiveFile,'-C',extracted,'--strip-components=1'],{timeout:30000});
    await fs.copyFile(path.join(extracted,'bin/node'),path.join(root,'runtime/node'));await fs.chmod(path.join(root,'runtime/node'),0o755);
    await fs.copyFile(path.join(extracted,'LICENSE'),path.join(root,'runtime/LICENSE.node'));
    const swiftArch=arch==='arm64'?'arm64':'x86_64';
    for(const name of helpers) {
      await exec('/usr/bin/xcrun',['swiftc','-target',`${swiftArch}-apple-macosx13.0`,path.join(root,'native',name+'.swift'),'-o',path.join(root,'native',name)],{timeout:120000});
      await exec('/usr/bin/lipo',['-verify_arch',swiftArch,path.join(root,'native',name)],{timeout:5000});
      if(process.env.CYBERORBIT_SIGNING_IDENTITY)await exec('/usr/bin/codesign',['--force','--options','runtime','--sign',process.env.CYBERORBIT_SIGNING_IDENTITY,path.join(root,'native',name)],{timeout:30000});
    }
    for(const browser of ['chromium','firefox'])await fs.copyFile(path.join(root,'browser-companion/background.js'),path.join(root,'browser-companion',browser,'background.js'));
    const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));await validatePayload(root,arch,pkg.version);
    for(const file of ['src/cli.js','src/macos-user-install.js','src/service.js'])await exec(process.execPath,['--check',path.join(root,file)],{timeout:5000});
  }
  console.log('Running native and privacy tests on this build Mac (the other architecture requires its own runtime acceptance).');
  const tests=await exec(process.execPath,['--test',path.join(agent,'test/macos-user.test.js'),path.join(agent,'test/macos-runtime.test.js'),path.join(agent,'test/macos-kit.test.js')],{timeout:300000,maxBuffer:1024*1024});console.log(tests.stdout);
  await fs.mkdir(path.join(kit,'lib'));
  for(const name of ['kit-lib.js','verify-kit.js','employee-common.sh'])await fs.copyFile(path.join(packaging,name),path.join(kit,'lib',name));
  for(const name of commands) {await fs.copyFile(path.join(packaging,name),path.join(kit,name));await fs.chmod(path.join(kit,name),0o755);}
  await fs.writeFile(path.join(kit,'package.json'),JSON.stringify({private:true,type:'module'}));
  await fs.copyFile(path.join(packaging,'EMPLOYEE-README.txt'),path.join(kit,'README.txt'));
  const pkg=JSON.parse(await fs.readFile(path.join(agent,'package.json'),'utf8'));
  await fs.writeFile(path.join(kit,'kit-manifest.json'),JSON.stringify({format:1,kind:'employee-install',platform:'darwin',buildComplete:true,agentVersion:pkg.version,nodeVersion:runtime.version,minimumMacOS:runtime.minimumMacOS,architectures,builtAt:new Date().toISOString(),nativeTestsRunOn:process.arch,browserTitlesVerified:false},null,2)+'\n');
  await writeInventory(kit);await verifyKit(kit,process.arch);
  const result=await createZip(kit,path.join(output,'CYBERORBIT-macOS-Install-Kit.zip'));
  console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))build(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});

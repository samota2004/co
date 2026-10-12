import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {deviceFixture,projectRoot} from './device-fixture.js';

test('opt-in synthetic seed is idempotent and preserves existing accounts and credentials',{timeout:90000},async()=>{
 const f=await deviceFixture();
 try{
  const before=await f.prisma.user.findUnique({where:{id:f.admin.id}});
  const seed=()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['prisma/seed.js','--demo'],{cwd:projectRoot,windowsHide:true,env:{...process.env,DATABASE_URL:f.url,DEMO_PASSWORD:'Isolated-synthetic-demo-password'},stdio:['ignore','pipe','pipe']});
   let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Synthetic seed failed: '+output)));
  });
  await seed();const count=await f.prisma.activityEvent.count();await seed();
  assert.equal(await f.prisma.activityEvent.count(),count);assert.equal(count,2100);
  assert.equal(await f.prisma.user.count({where:{companyId:'cyberorbit-demo',roleCode:'EMPLOYEE'}}),100);
  assert.equal(await f.prisma.user.count({where:{companyId:'cyberorbit-demo',roleCode:'MANAGER'}}),10);
  assert.deepEqual(await f.prisma.user.findUnique({where:{id:f.admin.id}}),before);
  assert.ok((await f.prisma.activityEvent.findFirst()).metadata.synthetic);
 }finally{await f.close();}
});

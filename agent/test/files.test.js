import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileCollector } from '../src/collectors/files.js';
test('actual approved file changes report names only, with no contents or read events',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-files-')),events=[],health={};
  const collector=new FileCollector(async(type,metadata)=>events.push({type,metadata}),health);
  t.after(async()=>{collector.close();await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'nested'));await collector.configure([root]);
  await fs.writeFile(path.join(root,'nested','approved.txt'),'private contents never collected');
  for(let i=0;i<30&&!events.some(e=>e.metadata.relativePath.includes('approved.txt'));i++)await new Promise(r=>setTimeout(r,100));
  assert.ok(events.some(e=>e.type==='FILE_CHANGE'&&e.metadata.relativePath===path.join('nested','approved.txt')));
  assert.ok(!JSON.stringify(events).includes('private contents'));assert.ok(!events.some(e=>e.type==='FILE_READ'));
});

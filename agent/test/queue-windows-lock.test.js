import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {EncryptedQueue} from '../src/queue.js';

test('transient Windows rename lock retries; valid recovery ciphertext is never discarded',{skip:process.platform!=='win32'},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-locked-queue-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const q=new EncryptedQueue(directory,randomBytes(32).toString('base64'));
 await fs.writeFile(path.join(directory,'stats.tmp'),q.encrypt({dropped:7}));
 const rename=fs.rename;let attempts=0;
 t.mock.method(fs,'rename',async(...args)=>{if(attempts++<2){const error=new Error('controlled transient lock');error.code='EPERM';throw error;}return rename(...args);});
 await q.init();assert.equal(q.health().droppedEvents,7);assert.ok(attempts>=3);
 assert.deepEqual(q.decrypt(await fs.readFile(path.join(directory,'stats'))),{dropped:7});
 assert.equal((await fs.readdir(directory)).includes('stats.tmp'),false);
});

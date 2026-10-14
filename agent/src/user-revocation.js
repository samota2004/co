import fs from 'node:fs/promises';
import path from 'node:path';
export async function userRevoked(directory) {
  try {await fs.lstat(path.join(directory,'revoked'));return true;}
  catch(e){if(e.code==='ENOENT')return false;throw e;}
}
export async function markUserRevoked(directory) {
  try {await fs.writeFile(path.join(directory,'revoked'),new Date().toISOString(),{mode:0o600,flag:'wx'});}
  catch(e){if(e.code!=='EEXIST')throw e;}
}

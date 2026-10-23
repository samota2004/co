import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
const here=path.dirname(fileURLToPath(import.meta.url));
// Resolve the project root from server/services.
export const projectRoot=path.resolve(here,'../..');
dotenv.config({path:path.join(projectRoot,'.env'),quiet:true});
export function resolveModelDirectory(configured=process.env.CYBERORBIT_MODEL_DIR,root=projectRoot){
  if(!configured)return path.join(root,'ml','models');
  const expanded=configured==='~'?os.homedir():configured.startsWith('~/')||configured.startsWith('~\\')?path.join(os.homedir(),configured.slice(2)):configured;
  return path.isAbsolute(expanded)?path.normalize(expanded):path.resolve(root,expanded);
}
export const modelDirectory=resolveModelDirectory();

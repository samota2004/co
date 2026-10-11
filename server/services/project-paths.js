import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
const here=path.dirname(fileURLToPath(import.meta.url));
// Resolve the project root from server/services.
export const projectRoot=path.resolve(here,'../..');
dotenv.config({path:path.join(projectRoot,'.env'),quiet:true});
export const modelDirectory=process.env.CYBERORBIT_MODEL_DIR||path.join(projectRoot,'ml','models');

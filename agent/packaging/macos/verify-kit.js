import {verifyKit} from './kit-lib.js';
try {
  const [root,arch]=process.argv.slice(2);if(!root || process.platform!=='darwin' || process.arch!==arch)throw new Error('Wrong platform or runtime architecture');
  const kit=await verifyKit(root,arch);
  console.log(`Complete CYBERORBIT ${kit.agentVersion} Mac kit verified; selected ${arch}. Browser-title runtime acceptance remains pending.`);
}catch(error){console.error(error.message);process.exitCode=1;}

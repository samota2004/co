import { readConfig } from './config.js';
import { enroll } from './enrollment.js';
import { runService } from './service.js';
import { runDesktopHelper } from './desktop-helper.js';
const [command,configFile]=process.argv.slice(2);
try {
  if(!configFile || !['enroll','service','helper'].includes(command)) throw new Error('Usage: node src/cli.js enroll|service|helper <absolute config.json>');
  const config=await readConfig(configFile);
  if(command==='enroll') {
    if(process.stdin.isTTY) throw new Error('Provide the enrollment token on stdin, not command line');
    let token='';for await(const b of process.stdin){token+=b;if(token.length>256)throw new Error('Enrollment input is too long. Copy only the 43-character token, without labels or JSON.');}
    const result=await enroll(config,token);console.log(JSON.stringify(result));
  }else if(command==='service') await runService(config);
  else await runDesktopHelper(config);
}catch(e){console.error(e.message);process.exitCode=1;}

// Offline counterfactual policy simulation. Inputs are documented labelled
// sequences, never live authorization requests or production observations.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {authorizeAssessment} from '../../server/services/authorization-policy.js';
import {policyAction, DEFAULT_POLICY, validatePolicy} from '../../server/services/policy-service.js';

const challenges=new Set(['MFA','REQUIRE_APPROVAL','RESTRICT','FREEZE']);
const reviewActions=new Set(['MFA','REQUIRE_APPROVAL']);
const restrictive=new Set(['RESTRICT','FREEZE']);
const sensitive=new Set(['CONFIDENTIAL','HIGHLY_SENSITIVE']);

export function evaluateSequence(records,policy=DEFAULT_POLICY){
  if(!Array.isArray(records)||!records.length)throw new Error('A nonempty JSON array is required.');
  policy=validatePolicy(policy);
  const results=Object.fromEntries(['context_rules','risk_only','risk_plus_trust','conservative_review'].map(name=>[name,[]]));
  const identifiers=new Set();let prior=-Infinity;
  for(const record of records){
    if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Invalid request record.');
    const {event_id,user_id,timestamp,label,risk_score,context_risk_score,trust_score,status,role_code,resource,mfa_fresh,approval,critical_hold,uncertain}=record;
    const at=Date.parse(timestamp);
    if(typeof event_id!=='string'||!event_id||identifiers.has(event_id)||typeof user_id!=='string'||!user_id||
       !Number.isFinite(at)||at<prior||![0,1].includes(label)||
       [risk_score,context_risk_score,trust_score].some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)||
       !['ACTIVE','RESTRICTED','INVESTIGATION','FROZEN','DISABLED'].includes(status)||
       typeof role_code!=='string'||!resource||typeof resource.id!=='string'||!Array.isArray(resource.requiredRoles)||
       !['PUBLIC','INTERNAL','CONFIDENTIAL','HIGHLY_SENSITIVE'].includes(resource.sensitivity)||
       [mfa_fresh,approval,critical_hold,uncertain,record.synthetic].some(value=>typeof value!=='boolean'))throw new Error('Invalid or out-of-order policy sequence record.');
    identifiers.add(event_id);prior=at;
    const decisionFor=(score,trust)=>authorizeAssessment({riskAction:policyAction(score,policy),trustScore:trust,
      status,resource,roleCode:role_code,mfaFresh:mfa_fresh,approval,criticalHold:critical_hold}).decision;
    const decisions={context_rules:decisionFor(context_risk_score,100),risk_only:decisionFor(risk_score,100),
      risk_plus_trust:decisionFor(risk_score,trust_score)};
    decisions.conservative_review=decisions.risk_plus_trust;
    if(uncertain&&sensitive.has(resource.sensitivity)&&['ALLOW','MONITOR'].includes(decisions.conservative_review))
      decisions.conservative_review='REQUIRE_APPROVAL';
    for(const [name,decision] of Object.entries(decisions))results[name].push({event_id,user_id,timestamp,label,resource_id:resource.id,decision,
      trust_score,status,critical_hold});
  }
  const summary={};
  for(const [name,rows] of Object.entries(results)){
    const count=decision=>rows.filter(row=>row.decision===decision).length;
    const unnecessary=rows.filter(row=>row.label===0&&challenges.has(row.decision)).length;
    const threatAllowed=rows.filter(row=>row.label===1&&!challenges.has(row.decision)).length;
    const legitimateChallenged=rows.filter(row=>row.label===0&&reviewActions.has(row.decision)).length;
    const legitimateDenied=rows.filter(row=>row.label===0&&restrictive.has(row.decision)).length;
    const recent=new Map();let duplicateAlerts=0;
    for(const row of rows){
      if(!challenges.has(row.decision))continue;
      const key=[row.user_id,row.resource_id,row.decision].join('|'),at=Date.parse(row.timestamp);
      if(recent.has(key)&&at-recent.get(key)<=15*60000)duplicateAlerts++;
      recent.set(key,at);
    }
    const delays=[];
    let observedTrustIncreases=0,trustIncreasesWhileHeld=0;
    for(const user of new Set(rows.map(row=>row.user_id))){
      const relevant=rows.filter(row=>row.user_id===user),first=relevant.find(row=>row.label===1);
      for(let i=1;i<relevant.length;i++)if(relevant[i].trust_score>relevant[i-1].trust_score){
        observedTrustIncreases++;
        if(relevant[i].critical_hold||relevant[i-1].critical_hold||relevant[i].status!=='ACTIVE'||relevant[i-1].status!=='ACTIVE')trustIncreasesWhileHeld++;
      }
      if(!first)continue;
      const detected=relevant.find(row=>Date.parse(row.timestamp)>=Date.parse(first.timestamp)&&row.label===1&&challenges.has(row.decision));
      if(detected)delays.push((Date.parse(detected.timestamp)-Date.parse(first.timestamp))/60000);
    }
    summary[name]={requests:rows.length,legitimate:rows.filter(row=>row.label===0).length,
      threat_labelled:rows.filter(row=>row.label===1).length,
      legitimate_challenged_or_denied:unnecessary,legitimate_challenged:legitimateChallenged,
      legitimate_denied:legitimateDenied,threat_labelled_allowed:threatAllowed,
      threat_labelled_challenged:rows.filter(row=>row.label===1&&reviewActions.has(row.decision)).length,
      threat_labelled_contained:rows.filter(row=>row.label===1&&restrictive.has(row.decision)).length,
      mfa:count('MFA'),approval:count('REQUIRE_APPROVAL'),freeze:count('FREEZE'),restriction:count('RESTRICT'),
      repeated_alerts_within_15_minutes:duplicateAlerts,
      observed_trust_increases:observedTrustIncreases,trust_increases_while_held:trustIncreasesWhileHeld,
      detected_threat_users:delays.length,detection_delay_minutes:delays};
  }
  return{summary,decisions:results,limitations:'Counterfactual replay assumes provided risk/trust are fixed across policies. Trust increases are input-sequence diagnostics, not simulated policy recovery. Human approvals, MFA completion and behavioral feedback are not modelled.'};
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2),input=args[args.indexOf('--input')+1],output=args[args.indexOf('--output')+1];
  if(!input||!output||args.indexOf('--input')<0||args.indexOf('--output')<0)throw new Error('Usage: node ml/research/policy_eval.mjs --input labelled-sequence.json --output NEW_DIR [--source-manifest MANIFEST]');
  if(existsSync(output))throw new Error('Choose a new output directory.');
  const source=readFileSync(input),records=JSON.parse(source.toString('utf8').replace(/^\uFEFF/,''));
  const policyIndex=args.indexOf('--policy-config'),policyFile=policyIndex<0?null:args[policyIndex+1];
  if(policyIndex>=0&&!policyFile)throw new Error('--policy-config requires a JSON file.');
  const policy=policyFile?validatePolicy(JSON.parse(readFileSync(policyFile,'utf8'))):DEFAULT_POLICY;
  const result=evaluateSequence(records,policy);
  const synthetic=records.every(row=>row.synthetic===true),manifestPath=args[args.indexOf('--source-manifest')+1];
  let provenance=null;
  if(!synthetic){
    if(args.indexOf('--source-manifest')<0||!manifestPath)throw new Error('Non-synthetic sequences require a checked label/source manifest.');
    provenance=JSON.parse(readFileSync(manifestPath,'utf8'));
    const sourceSha=createHash('sha256').update(source).digest('hex');
    if(!provenance.dataset_name||!provenance.label_source||!provenance.label_definition||!provenance.usage_restrictions||provenance.input_sha256!==sourceSha)
      throw new Error('Policy source manifest lacks checked input and label provenance.');
  }
  mkdirSync(output,{recursive:true});
  const report={created_at_utc:new Date().toISOString(),input:resolve(input),input_sha256:createHash('sha256').update(source).digest('hex'),
    synthetic,source_provenance:provenance,production_observations:false,scientific_validation:false,
    policy_config:policy,policy_config_sha256:policyFile?createHash('sha256').update(readFileSync(policyFile)).digest('hex'):null,
    ...result};
  writeFileSync(join(output,'policy-evaluation.json'),JSON.stringify(report,null,2));
  process.stdout.write(JSON.stringify({output,synthetic:report.synthetic,production_observations:false})+'\n');
}

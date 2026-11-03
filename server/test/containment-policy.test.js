import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticContainmentEligibility as eligible} from '../services/containment-policy.js';

const now=Date.now();
const input={enabled:true,riskScore:95,contextualEvidence:95,threshold:90,source:'AUTHENTICATED_RESOURCE_ACCESS',riskProvenance:'SERVER_CONTEXTUAL_POLICY_EVALUATION',timestamp:new Date(now).toISOString(),now,categories:['RESOURCE','DEVICE'],platform:'win32',lastSeen:new Date(now),mappedIdentity:'S-1-5-21-1-2-3-1001'};

test('automatic containment requires explicit opt-in, critical valid risk, fresh authenticated source, corroboration, and supported online Windows account',()=>{
  assert.equal(eligible(input),true);
  for(const change of [
    {enabled:false},{riskScore:89},{riskScore:NaN},{source:'SIMULATION'},
    {timestamp:new Date(now-300001).toISOString()},{simulated:true},{aggregateImport:true},
    {categories:['RESOURCE','RECENT_ASSESSMENT']},{contextualEvidence:undefined},{contextualEvidence:89},{riskProvenance:'UNVERIFIED_OR_MODEL_ONLY'},{platform:'darwin'},
    {lastSeen:new Date(now-300001)},{mappedIdentity:null}
  ])assert.equal(eligible({...input,...change}),false,JSON.stringify(change));
});

test('uncalibrated or unavailable endpoint ML cannot authorize containment',()=>{
  assert.equal(eligible({...input,riskScore:95,endpointMl:{available:false,missingFeatures:['HTTP']} }),true,'eligibility is based on configured contextual risk evidence only');
  assert.equal(eligible({...input,riskScore:99,contextualEvidence:undefined,riskProvenance:'UNVERIFIED_OR_MODEL_ONLY',endpointMl:{available:true,score:99}}),false,'ML-only value cannot substitute for contextual server evidence');
});

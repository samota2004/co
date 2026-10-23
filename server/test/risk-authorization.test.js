import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riskEngine} from '../../cyber/risk-engine/risk-engine.js';
import {DEFAULT_POLICY,policyAction,riskLevel} from '../services/policy-service.js';
import {authorizeAssessment,recoveryEvidence} from '../services/authorization-policy.js';

const user={id:'u',departmentCode:'ENGINEERING',trustScore:100,previousIncidents:0};
const normal={timestamp:'2026-10-22T10:00:00Z',isOffHours:false,aggregateOnly:true};
const evaluate=(event=normal,ml=null,resource=null,person=user)=>riskEngine.evaluateRisk(person,event,null,resource,ml,DEFAULT_POLICY);
const model=score=>({threat_probability:score,operating_threshold:.85});

test('risk evidence remains bounded and model threshold reaches the first alert band',()=>{
  assert.equal(evaluate().riskScore,0);
  assert.equal(evaluate(normal,model(0)).riskScore,0);
  assert.equal(evaluate(normal,model(.85)).riskScore,60);
  assert.equal(evaluate(normal,model(1)).riskScore,100);
  assert.equal(evaluate(normal,model(.9)).riskScore,73);
  assert.equal(evaluate(normal,model(.9)).mlScoreType,'uncalibrated_random_forest_class_score');
  assert.equal(evaluate(normal,model(.9)).recommendedAction,'MFA');
  assert.equal(evaluate(normal,{threat_probability:NaN,operating_threshold:.85}).mlAvailable,false);
  assert.equal(evaluate(normal,{threat_probability:.9,operating_threshold:NaN}).riskScore,0);
});

test('context and model evidence are explained without summing overlapping risk',()=>{
  const resource={name:'private',departmentCode:'FINANCE',sensitivity:'HIGHLY_SENSITIVE'};
  const event={...normal,failedAuthCount:5,isUsbTransfer:true,downloadVolumeMB:240};
  const context=evaluate(event,null,resource);
  const lowModelWithContext=evaluate(event,model(.1),resource);
  const combined=evaluate(event,model(.9),resource);
  assert.equal(context.riskScore,90); // resource 28 + auth 25 + transfer 12 + rounded volume 25
  assert.equal(lowModelWithContext.riskScore,90);
  assert.equal(combined.riskScore,90);
  assert.equal(combined.recommendedAction,'FREEZE');
  assert.equal(combined.contributingFactors.filter(f=>f.category==='RESOURCE').length,1);
  assert.equal(evaluate({...normal,isUnknownDevice:false}).riskScore,0);
});

test('every policy boundary is explicit and endpoints cannot supply an authoritative score',()=>{
  for(const [score,level,action] of [[0,'LOW','ALLOW'],[39,'LOW','ALLOW'],[40,'MEDIUM','MONITOR'],[59,'MEDIUM','MONITOR'],[60,'HIGH','MFA'],[74,'HIGH','MFA'],[75,'VERY_HIGH','REQUIRE_APPROVAL'],[89,'VERY_HIGH','REQUIRE_APPROVAL'],[90,'CRITICAL','FREEZE'],[100,'CRITICAL','FREEZE']]){
    assert.equal(riskLevel(score),level);assert.equal(policyAction(score),action);
  }
  assert.equal(evaluate({...normal,riskScore:0,trustScore:100,roleCode:'SYSTEM_ADMIN',approvalExists:true},model(1)).riskScore,100);
});

test('persisted trust gates authorization but cannot override risk, holds or roles',()=>{
  const resource={sensitivity:'HIGHLY_SENSITIVE',requiredRoles:['EMPLOYEE']};
  const request=(changes={})=>authorizeAssessment({riskAction:'ALLOW',trustScore:100,status:'ACTIVE',resource,roleCode:'EMPLOYEE',approval:false,mfaFresh:false,...changes});
  assert.equal(request().decision,'ALLOW');
  assert.equal(request({riskAction:'FREEZE'}).decision,'FREEZE');
  assert.equal(request({trustScore:45}).decision,'REQUIRE_APPROVAL');
  assert.equal(request({trustScore:45,approval:true}).decision,'ALLOW');
  assert.equal(request({trustScore:20,resource:{sensitivity:'INTERNAL',requiredRoles:['EMPLOYEE']}}).decision,'MFA');
  assert.equal(request({trustScore:20,resource:{sensitivity:'INTERNAL',requiredRoles:['EMPLOYEE']},mfaFresh:true}).decision,'ALLOW');
  assert.equal(request({status:'FROZEN',approval:true}).decision,'FREEZE');
  assert.equal(request({criticalHold:true,approval:true}).decision,'FREEZE');
  assert.equal(request({status:'RESTRICTED'}).decision,'RESTRICT');
  assert.equal(request({roleCode:'MANAGER',approval:false}).decision,'RESTRICT');
  assert.equal(request({roleCode:'MANAGER',approval:true}).decision,'RESTRICT');
  assert.equal(request({trustScore:NaN}).decision,'REQUIRE_APPROVAL');
});

test('recovery requires reviewed status and three different prior benign days',()=>{
  const at=new Date('2026-10-22T12:00:00Z');
  const events=[19,20,21].map(day=>({type:'RESOURCE_ACCESS',riskContribution:0,metadata:{decision:'ALLOW',source:'application',validatedAccess:true},timestamp:new Date(`2026-10-${day}T10:00:00Z`)}));
  const base={user:{status:'ACTIVE'},unresolvedIncidents:0,recentElevated:false,events,at};
  assert.equal(recoveryEvidence(base).allowed,true);
  assert.equal(recoveryEvidence({...base,events:events.slice(1)}).allowed,false);
  assert.equal(recoveryEvidence({...base,since:new Date('2026-10-20T12:00:00Z')}).allowed,false);
  assert.equal(recoveryEvidence({...base,unresolvedIncidents:1}).allowed,false);
  assert.equal(recoveryEvidence({...base,user:{status:'FROZEN'}}).allowed,false);
  assert.equal(recoveryEvidence({...base,events:events.map(e=>({...e,metadata:{...e.metadata,synthetic:true}}))}).allowed,false);
  assert.equal(recoveryEvidence({...base,events:events.map(e=>({...e,metadata:{...e.metadata,simulation:true}}))}).allowed,false);
  assert.equal(recoveryEvidence({...base,events:events.map(e=>({...e,metadata:{...e.metadata,validatedAccess:false}}))}).allowed,false);
});

// Trust is a persisted history of assessed behavior. It is a separate policy
// gate, never added to the current-event risk score.
export function authorizeAssessment({riskAction,trustScore,status,resource,roleCode,approval,mfaFresh,criticalHold=false}){
  const reasons=[];
  if(['FROZEN','DISABLED'].includes(status)||criticalHold)return{decision:'FREEZE',reasons:['Active security hold or disabled account.']};
  if(['RESTRICTED','INVESTIGATION'].includes(status))return{decision:'RESTRICT',reasons:['Administrative restriction requires review and restoration.']};
  if(riskAction==='FREEZE'||riskAction==='RESTRICT')return{decision:riskAction,reasons:['Current risk policy requires containment.']};
  const hasRole=!resource||resource.requiredRoles.includes(roleCode)||['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(roleCode);
  // Approval satisfies an additional risk gate; it cannot grant a role that
  // the resource does not permit. Role changes invalidate old approvals.
  if(!hasRole)return{decision:'RESTRICT',reasons:['Resource role is not authorized.']};
  const validTrust=typeof trustScore==='number'&&Number.isFinite(trustScore)&&trustScore>=0&&trustScore<=100;
  if(!validTrust){
    if(resource&&approval){
      reasons.push('Reviewed resource approval satisfies the unassessed trust gate, subject to current risk and MFA.');
      return{decision:riskAction==='MFA'&&!mfaFresh?'MFA':riskAction==='MFA'||riskAction==='REQUIRE_APPROVAL'?'MONITOR':riskAction,reasons};
    }
    return{decision:'REQUIRE_APPROVAL',reasons:['Trust is not assessed; reviewed resource approval is required.']};
  }
  let decision=riskAction;
  if(riskAction==='REQUIRE_APPROVAL'&&approval){decision='MONITOR';reasons.push('Recent reviewed resource approval satisfied the current policy.');}
  else if(riskAction==='MFA'&&mfaFresh){decision='MONITOR';reasons.push('Fresh verified MFA satisfied the current policy.');}
  const sensitive=resource&&['CONFIDENTIAL','HIGHLY_SENSITIVE'].includes(resource.sensitivity);
  if(sensitive&&trustScore<60&&!approval&&['ALLOW','MONITOR','MFA'].includes(decision)){
    decision='REQUIRE_APPROVAL';reasons.push('Persisted trust below 60 requires reviewed access to sensitive data.');
  }else if(trustScore<30&&!mfaFresh&&['ALLOW','MONITOR'].includes(decision)){
    decision='MFA';reasons.push('Persisted trust below 30 requires fresh MFA.');
  }
  return{decision,reasons};
}

export function recoveryEvidence({user,unresolvedIncidents,recentElevated,events,at=new Date(),since=null}){
  if(user.status!=='ACTIVE'||unresolvedIncidents>0||recentElevated)return{allowed:false,reason:'Active restriction, unresolved incident or recent elevated assessment.'};
  const days=new Set((events||[]).filter(e=>e.type==='RESOURCE_ACCESS'&&e.riskContribution<20&&
    ['ALLOW','MONITOR'].includes(e.metadata?.decision)&&
    e.metadata?.validatedAccess===true&&
    !e.metadata?.synthetic&&!e.metadata?.simulation&&!String(e.metadata?.source||'').startsWith('synthetic')&&
    e.timestamp<at&&(!since||e.timestamp>since)).map(e=>e.timestamp.toISOString().slice(0,10)));
  return{allowed:days.size>=3,reason:days.size>=3?'Three prior UTC days with assessed benign authorized access.':'Fewer than three prior UTC days of validated benign access.',days:days.size};
}

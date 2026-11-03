const RECENT_WINDOW_MS=5*60*1000;

export function automaticContainmentEligibility({enabled,riskScore,contextualEvidence,threshold,minEvidenceCategories=2,maxEvidenceAgeSeconds=300,source,riskProvenance,simulated=false,aggregateImport=false,timestamp,now=Date.now(),categories=[],platform,lastSeen,mappedIdentity}){
  const at=Date.parse(timestamp),seen=lastSeen instanceof Date?lastSeen.getTime():Date.parse(lastSeen);
  const distinct=new Set(categories.filter(category=>typeof category==='string'&&category&&category!=='RECENT_ASSESSMENT'));
  return enabled===true&&Number.isFinite(riskScore)&&riskScore>=threshold&&riskScore<=100&&
    // RF output is explicitly uncalibrated and cannot stand in for confidence.
    // Require the configured threshold to be reached by server-evaluated
    // contextual evidence itself, so an unavailable or model-only score cannot
    // produce automatic OS containment.
    Number.isFinite(contextualEvidence)&&contextualEvidence>=threshold&&
    source==='AUTHENTICATED_RESOURCE_ACCESS'&&riskProvenance==='SERVER_CONTEXTUAL_POLICY_EVALUATION'&&simulated!==true&&aggregateImport!==true&&
    Number.isFinite(at)&&Math.abs(now-at)<=Math.min(RECENT_WINDOW_MS,maxEvidenceAgeSeconds*1000)&&distinct.size>=minEvidenceCategories&&
    platform==='win32'&&typeof mappedIdentity==='string'&&mappedIdentity.length>0&&
    Number.isFinite(seen)&&now-seen>=-30000&&now-seen<=RECENT_WINDOW_MS;
}

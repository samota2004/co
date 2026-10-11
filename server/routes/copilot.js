import {Router} from 'express';
import {prisma} from '../models/prisma.js';
import {geminiService} from '../services/gemini.js';
import {api,text,scopedUser,audit,userScope} from '../services/security-common.js';
const router=Router();
router.post('/chat',api(async req=>{
 const raw=text(req.body.message,'Question',1000);
 // Scrub common identifiers. No names, email addresses, credentials, event
 // contents or file paths are included in the server-generated evidence.
 const question=raw.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[email omitted]').replace(/\bS-1-[\d-]+\b/g,'[identity omitted]').replace(/(?:[A-Za-z]:\\|\/Users\/|\/home\/)[^\s]+/g,'[path omitted]');
 let user,incident;
 if(req.body.context?.userId)user=await scopedUser(prisma,req.user,req.body.context.userId);
 if(req.body.context?.incidentId)incident=await prisma.incident.findFirst({where:{id:req.body.context.incidentId,user:userScope(req.user)}});
 const summary={company:{employees:await prisma.user.count({where:userScope(req.user)}),unresolvedIncidents:await prisma.incident.count({where:{user:userScope(req.user),status:{notIn:['RESOLVED','FALSE_POSITIVE']}}})},...(user?{subject:{department:user.departmentCode,role:user.roleCode,risk:user.riskScore,trust:user.trustScore,status:user.status}}:{}),...(incident?{incident:{severity:incident.severity,risk:incident.riskScore,status:incident.status,policyAction:incident.recommendedAction}}:{})};
 const result=await geminiService.askSecurityCopilot(question,summary);
 await audit(prisma,req.user,'COPILOT_QUERY',{mode:result.mode});
 return{...result,timestamp:new Date().toISOString()};
}));
export default router;

import {randomUUID} from 'node:crypto';
export class SecurityError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
export const isAdmin=user=>['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(user?.roleCode);
export const userScope=user=>({companyId:user.companyId,deletedAt:null,...(isAdmin(user)?(user.isMainAdmin===true?{}:{OR:[{id:user.id},{assignedAdminId:user.id}]}):user.roleCode==='MANAGER'?{OR:[{id:user.id},{managerId:user.id,assignedAdminId:user.assignedAdminId||null}]}:{id:user.id})});
export async function scopedUser(db,actor,id){
  const user=await db.user.findFirst({where:{AND:[userScope(actor),{OR:[{id},{employeeId:id}]}]}});
  if(!user)throw new SecurityError(404,'USER_NOT_FOUND','Employee not found in your authorized scope.');return user;
}
export const api=fn=>async(req,res,next)=>{try{res.json({success:true,...await fn(req,res)});}catch(e){next(e);}};
export function securityErrorHandler(e,req,res,next){
  if(res.headersSent)return next(e);
  const invalidFields=e.name==='PrismaClientValidationError';
  const status=e instanceof SecurityError?e.status:['P2002','P2003'].includes(e.code)?409:e.type==='entity.too.large'?413:e instanceof SyntaxError||invalidFields?400:503;
  const code=e instanceof SecurityError?e.code:status===409?'RECORD_CONFLICT':invalidFields?'INVALID_INPUT':status===400?'INVALID_JSON':status===413?'PAYLOAD_TOO_LARGE':'SERVICE_UNAVAILABLE';
  const requestId=req.requestId||randomUUID();
  console.error(JSON.stringify({timestamp:new Date().toISOString(),requestId,method:req.method,endpoint:req.path,status,code,category:typeof e.code==='string'?e.code:e.name}));
  res.status(status).json({success:false,error:{code,message:e instanceof SecurityError?e.message:status===409?'A record conflicts with an existing identifier or related record.':status===400?'Invalid request fields or JSON.':status===413?'Request exceeds the allowed size.':'Unable to complete this operation. Check server configuration and try again.',requestId}});
}
export function text(value,label,max=256){if(typeof value!=='string'||!value.trim()||value.length>max)throw new SecurityError(400,'INVALID_INPUT',`${label} is required and must be at most ${max} characters.`);return value.trim();}
export const publicUser=u=>{const{passwordHash,...safe}=u;return{...safe,role:u.roleCode,department:u.departmentCode,currentRiskScore:u.riskScore,currentTrustScore:u.trustScore,currentRiskLevel:u.riskLevel};};
export function pagination(q={}){const limit=q.limit===undefined?100:Number(q.limit),offset=q.offset===undefined?0:Number(q.offset);if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0||offset>100000)throw new SecurityError(400,'INVALID_PAGINATION','Limit must be 1–200 and offset a nonnegative integer.');return{take:limit,skip:offset};}
export function safeMetadata(data,depth=0){
  if(depth>5)return '[omitted]';
  if(Array.isArray(data))return data.slice(0,100).map(x=>safeMetadata(x,depth+1));
  if(data&&typeof data==='object')return Object.fromEntries(Object.entries(data).filter(([k])=>!/(password|secret|token|credential|api.?key|otp|challengeHash|cookie|authorization)/i.test(k)).map(([k,v])=>[k,safeMetadata(v,depth+1)]));
  return typeof data==='string'?data.slice(0,2000):data;
}
export async function audit(db,actor,action,details={},targetId=actor.id){
  const clean=safeMetadata(details);
  return db.auditLog.create({data:{companyId:actor.companyId,userId:targetId,userEmail:actor.email,action,category:action.split('_')[0],severity:'INFO',details:JSON.stringify(clean),metadata:clean}});
}

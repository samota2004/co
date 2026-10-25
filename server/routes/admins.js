import {releaseDeletedIdentifiers} from '../services/deleted-identifiers.js';
import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {prisma} from '../models/prisma.js';
import {requireSecurityAdmin,requireMainAdmin} from '../middleware/auth.js';
import {api,SecurityError,publicUser,text,audit,isAdmin} from '../services/security-common.js';
const router=Router();router.use(requireSecurityAdmin);
const locate=async(req)=>{const u=await prisma.user.findFirst({where:{id:req.params.id,companyId:req.user.companyId,deletedAt:null,roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']}}});if(!u)throw new SecurityError(404,'ADMIN_NOT_FOUND','Administrator not found.');return u;};
async function fields(b,create=false){
 const data={};
 if(create||b.name!==undefined)data.name=text(b.name,'Name',100);
 if(create||b.email!==undefined){data.email=text(b.email,'Email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw new SecurityError(400,'INVALID_EMAIL','Enter a valid email.');}
 if(create||b.roleCode||b.role){data.roleCode=b.roleCode||b.role||'SECURITY_ADMIN';if(!isAdmin(data))throw new SecurityError(400,'INVALID_ROLE','Select an administrator role.');}
 if(b.departmentCode!==undefined||b.department!==undefined){data.departmentCode=b.departmentCode||b.department;if(!await prisma.department.findUnique({where:{code:data.departmentCode||''}}))throw new SecurityError(400,'INVALID_DEPARTMENT','Select a supported department.');}
 if(b.status){if(!['ACTIVE','DISABLED'].includes(b.status))throw new SecurityError(400,'INVALID_STATUS','Invalid account status.');data.status=b.status;}
 if(create||b.password){const password=text(b.password,'Password',128);if(password.length<12)throw new SecurityError(400,'WEAK_PASSWORD','Use 12–128 characters.');data.passwordHash=await bcrypt.hash(password,12);data.passwordChangedAt=new Date();}
 return data;
}
router.get('/',api(async req=>({admins:(await prisma.user.findMany({where:{companyId:req.user.companyId,deletedAt:null,roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']}},orderBy:{name:'asc'},take:200})).map(publicUser)})));
router.get('/:id/security-center',api(async req=>{
 const admin=await locate(req),from=new Date(Date.now()-90*86400000),now=new Date();
 const [sessions,devices,endpointDevices,riskHistory,trustHistory,dailyRiskHistory,lastRisk,lastTrust,incidents,auditEvents,lastLogin]=await Promise.all([
  prisma.session.findMany({where:{userId:admin.id,revokedAt:null,expiresAt:{gt:now},user:{companyId:req.user.companyId,deletedAt:null}},select:{id:true,ip:true,userAgent:true,createdAt:true,expiresAt:true,mfaVerifiedAt:true},orderBy:{createdAt:'desc'},take:100}),
  prisma.device.findMany({where:{userId:admin.id,user:{companyId:req.user.companyId,deletedAt:null}},select:{id:true,name:true,os:true,browser:true,status:true,trustScore:true,lastSeen:true,firstSeen:true},orderBy:{lastSeen:'desc'},take:100}),
  prisma.endpointDevice.findMany({where:{userId:admin.id,companyId:req.user.companyId},select:{id:true,name:true,platform:true,agentVersion:true,health:true,lastSeen:true,enrolledAt:true,revokedAt:true},orderBy:{lastSeen:'desc'},take:100}),
  prisma.riskScore.findMany({where:{userId:admin.id,timestamp:{gte:from,lte:now}},select:{id:true,score:true,level:true,factors:true,policyAction:true,timestamp:true},orderBy:{timestamp:'asc'},take:5000}),
  prisma.trustHistory.findMany({where:{userId:admin.id,timestamp:{gte:from,lte:now}},select:{id:true,trustScore:true,riskScore:true,delta:true,reason:true,timestamp:true},orderBy:{timestamp:'asc'},take:5000}),
  prisma.dailyRiskSnapshot.findMany({where:{userId:admin.id,companyId:req.user.companyId,day:{gte:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-89*86400000)}},orderBy:{day:'asc'},take:90}),
  prisma.riskScore.findFirst({where:{userId:admin.id},select:{score:true,level:true,timestamp:true},orderBy:{timestamp:'desc'}}),
  prisma.trustHistory.findFirst({where:{userId:admin.id},select:{trustScore:true,timestamp:true},orderBy:{timestamp:'desc'}}),
  prisma.incident.findMany({where:{userId:admin.id,user:{companyId:req.user.companyId,deletedAt:null}},select:{id:true,title:true,severity:true,status:true,riskScore:true,createdAt:true},orderBy:{createdAt:'desc'},take:100}),
  prisma.auditLog.findMany({where:{companyId:req.user.companyId,userId:admin.id,timestamp:{gte:from,lte:now}},select:{id:true,action:true,category:true,severity:true,timestamp:true},orderBy:{timestamp:'desc'},take:200}),
  prisma.auditLog.findFirst({where:{companyId:req.user.companyId,userId:admin.id,action:'AUTH_LOGIN'},select:{timestamp:true},orderBy:{timestamp:'desc'}}),
 ]);
 const currentTrust=lastTrust&&(!admin.trustUpdatedAt||lastTrust.timestamp>=admin.trustUpdatedAt)?lastTrust.trustScore:admin.trustUpdatedAt?admin.trustScore:null;
 const currentTrustAt=lastTrust&&(!admin.trustUpdatedAt||lastTrust.timestamp>=admin.trustUpdatedAt)?lastTrust.timestamp:admin.trustUpdatedAt??null;
 return{administrator:{id:admin.id,name:admin.name,email:admin.email,employeeId:admin.employeeId,roleCode:admin.roleCode,departmentCode:admin.departmentCode,status:admin.status,isMainAdmin:admin.isMainAdmin,assessmentStatus:lastRisk||currentTrustAt?'ASSESSED':'NOT_ASSESSED',riskScore:lastRisk?.score??null,riskLevel:lastRisk?.level??null,trustScore:currentTrust,riskUpdatedAt:lastRisk?.timestamp??null,trustUpdatedAt:currentTrustAt,lastLoginAt:lastLogin?.timestamp??null},window:{from,to:now,days:90},sessions,sessionCount:sessions.length,monitoringStatus:sessions.length?'ACTIVE_SESSION':endpointDevices.some(device=>!device.revokedAt&&device.lastSeen&&now-device.lastSeen<300000)?'AGENT_CONNECTED':'NO_ACTIVE_SESSION_OR_AGENT',devices,endpointDevices,riskHistory,trustHistory,dailyRiskHistory,incidents,auditEvents};
}));
router.post('/',requireMainAdmin,api(async req=>{const data=await fields(req.body,true);const admin=await prisma.$transaction(async tx=>{await releaseDeletedIdentifiers(tx,req.user,data);const u=await tx.user.create({data:{...data,employeeId:'ADM-'+randomUUID(),companyId:req.user.companyId,isMainAdmin:false}});await audit(tx,req.user,'ADMIN_CREATED',{id:u.id});return u;});return{admin:{...publicUser(admin),riskScore:null,currentRiskScore:null,riskLevel:null,currentRiskLevel:null,assessmentStatus:'NOT_ASSESSED'}};}));
router.patch('/:id',requireMainAdmin,api(async req=>{
 const u=await locate(req),data=await fields(req.body);
 if(u.isMainAdmin&&(data.status==='DISABLED'||data.roleCode&&data.roleCode!==u.roleCode))throw new SecurityError(403,'MAIN_ADMIN_PROTECTED','The main administrator cannot be disabled or demoted.');
 const admin=await prisma.$transaction(async tx=>{const updated=await tx.user.update({where:{id:u.id},data:{...data,authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,req.user,'ADMIN_UPDATED',{id:u.id,fields:Object.keys(data)});return updated;});return{admin:publicUser(admin)};
}));
router.delete('/:id',requireMainAdmin,api(async req=>{const u=await locate(req);if(u.isMainAdmin||u.id===req.user.id)throw new SecurityError(403,'MAIN_ADMIN_PROTECTED','Cannot disable yourself or the main administrator.');await prisma.$transaction(async tx=>{await tx.user.update({where:{id:u.id},data:{deletedAt:new Date(),status:'DISABLED',authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});await tx.user.updateMany({where:{companyId:req.user.companyId,assignedAdminId:u.id},data:{assignedAdminId:null}});await audit(tx,req.user,'ADMIN_DELETED',{id:u.id,historyRetained:true});});return{message:'Administrator deleted from the directory and sessions revoked.'};}));
export default router;

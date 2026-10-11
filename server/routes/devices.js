import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {prisma} from '../models/prisma.js';
import {requireAuth,requireSecurityAdmin} from '../middleware/auth.js';
import {api,userScope,scopedUser,audit,SecurityError} from '../services/security-common.js';
import {setAccount} from './security.js';
import {learnBaseline} from '../services/ueba-service.js';
const router=Router();router.use(requireAuth);
router.get('/',api(async req=>({devices:(await prisma.device.findMany({where:{user:userScope(req.user)},include:{user:{select:{id:true,name:true,employeeId:true}}},orderBy:{lastSeen:'desc'},take:200})).map(d=>{const {fingerprint,...safe}=d;return{...safe,deviceName:d.name,ipAddress:d.ip,lastSeenAt:d.lastSeen};})})));
router.post('/',requireSecurityAdmin,api(async req=>{
 const u=await scopedUser(prisma,req.user,req.body.userId);
 if(typeof req.body.name!=='string'||!req.body.name.trim()||req.body.name.length>100)throw new SecurityError(400,'INVALID_DEVICE','A name of 1–100 characters is required.');
 const device=await prisma.$transaction(async tx=>{const d=await tx.device.create({data:{deviceId:randomUUID(),userId:u.id,name:req.body.name.trim(),os:String(req.body.os||'Logical device').slice(0,100),browser:'Not browser-verified',ip:'Unknown',location:'Unknown',trustScore:0,isTrusted:false,status:'MONITORED'}});await audit(tx,req.user,'DEVICE_REGISTERED',{id:d.id},u.id);return d;});return{device};
}));
router.get('/:id',api(async req=>{
 const device=await prisma.device.findFirst({where:{OR:[{id:req.params.id},{deviceId:req.params.id}],user:userScope(req.user)}});
 if(device){const {fingerprint,...safe}=device;return{device:safe};}
 // Preserve the existing employee-ID lookup used by the original frontend.
 const u=await scopedUser(prisma,req.user,req.params.id);
 return{devices:await prisma.device.findMany({where:{userId:u.id},select:{id:true,name:true,trustScore:true,status:true,isTrusted:true,lastSeen:true}})};
}));
router.post('/:id/freeze',requireSecurityAdmin,api(req=>setAccount(req,'FROZEN')));
router.post('/:id/unfreeze',requireSecurityAdmin,api(req=>setAccount(req,'ACTIVE')));
router.post('/:id/reset-risk',requireSecurityAdmin,api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);return{baseline:await learnBaseline(prisma,u.id),message:'Historical baseline recomputed. Existing risk and trust evidence retained.'};}));
router.patch('/:id',requireSecurityAdmin,api(async req=>{
 const d=await prisma.device.findFirst({where:{id:req.params.id,user:userScope(req.user)}});if(!d)throw new SecurityError(404,'DEVICE_NOT_FOUND','Device not found.');
 const {trustScore,status}=req.body;if(!Number.isFinite(trustScore)||trustScore<0||trustScore>100||!['TRUSTED','MONITORED','SUSPICIOUS','REVOKED'].includes(status))throw new SecurityError(400,'INVALID_DEVICE_POSTURE','Provide device trust 0–100 and a supported posture.');
 const device=await prisma.$transaction(async tx=>{const updated=await tx.device.update({where:{id:d.id},data:{trustScore,status,isTrusted:status==='TRUSTED'}});await audit(tx,req.user,'DEVICE_POSTURE_UPDATED',{id:d.id,trustScore,status},d.userId);if(status==='REVOKED'){await tx.user.update({where:{id:d.userId},data:{authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:d.userId,revokedAt:null},data:{revokedAt:new Date()}});}return updated;});
 return{device:{id:device.id,name:device.name,status:device.status,trustScore:device.trustScore}};
}));
export default router;

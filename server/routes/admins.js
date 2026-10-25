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
router.post('/',requireMainAdmin,api(async req=>{const data=await fields(req.body,true);const admin=await prisma.$transaction(async tx=>{await releaseDeletedIdentifiers(tx,req.user,data);const u=await tx.user.create({data:{...data,employeeId:'ADM-'+randomUUID(),companyId:req.user.companyId,isMainAdmin:false}});await audit(tx,req.user,'ADMIN_CREATED',{id:u.id});return u;});return{admin:{...publicUser(admin),riskScore:null,currentRiskScore:null,riskLevel:null,currentRiskLevel:null,assessmentStatus:'NOT_ASSESSED'}};}));
router.patch('/:id',requireMainAdmin,api(async req=>{
 const u=await locate(req),data=await fields(req.body);
 if(u.isMainAdmin&&(data.status==='DISABLED'||data.roleCode&&data.roleCode!==u.roleCode))throw new SecurityError(403,'MAIN_ADMIN_PROTECTED','The main administrator cannot be disabled or demoted.');
 const admin=await prisma.$transaction(async tx=>{const updated=await tx.user.update({where:{id:u.id},data:{...data,authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,req.user,'ADMIN_UPDATED',{id:u.id,fields:Object.keys(data)});return updated;});return{admin:publicUser(admin)};
}));
router.delete('/:id',requireMainAdmin,api(async req=>{const u=await locate(req);if(u.isMainAdmin||u.id===req.user.id)throw new SecurityError(403,'MAIN_ADMIN_PROTECTED','Cannot disable yourself or the main administrator.');await prisma.$transaction(async tx=>{await tx.user.update({where:{id:u.id},data:{deletedAt:new Date(),status:'DISABLED',authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});await tx.user.updateMany({where:{companyId:req.user.companyId,assignedAdminId:u.id},data:{assignedAdminId:null}});await audit(tx,req.user,'ADMIN_DELETED',{id:u.id,historyRetained:true});});return{message:'Administrator deleted from the directory and sessions revoked.'};}));
export default router;

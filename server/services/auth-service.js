import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {prisma} from '../models/prisma.js';
import {sendOtpEmail} from './email-service.js';
import {publicUser,isAdmin,audit,SecurityError} from './security-common.js';
import {getPolicy} from './policy-service.js';
import {localHour} from './time-context.js';
import {securityService} from './security-service.js';
export const sanitizeUser=publicUser;
export const isAdminUser=isAdmin;
export const isEmployeeUser=user=>['EMPLOYEE','MANAGER'].includes(user?.roleCode);
export const generateOtp=()=>String(crypto.randomInt(100000,1000000));
export const hashOtp=otp=>crypto.createHash('sha256').update(String(otp)).digest('hex');
export const browserCookie=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('orbit_browser='))?.slice(14);
const fail=(status,code,message)=>({success:false,status,error:{code,message}});
const loopback=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress||req.ip);
export async function startChallenge(user,req,action='LOGIN'){
 if(!isAdmin(user))return fail(403,'ADMIN_LOGIN_REQUIRED','Console access is restricted to administrators.');
 await prisma.mfaSession.updateMany({where:{userId:user.id,status:'PENDING',action},data:{status:'EXPIRED'}});
 const otp=generateOtp(),session=await prisma.mfaSession.create({data:{userId:user.id,challengeHash:hashOtp(otp),action,expiresAt:new Date(Date.now()+300000),maxAttempts:5}});
 // Development code delivery is explicit, local-only and never written to logs.
 const demo=process.env.DEV_MFA_MODE==='true'&&process.env.NODE_ENV!=='production'&&loopback(req);
 if(!demo){
  try{await sendOtpEmail({to:user.email,name:user.name,otp,expiryMinutes:5});}
  catch{await prisma.mfaSession.update({where:{id:session.id},data:{status:'FAILED'}});return fail(503,'OTP_EMAIL_FAILED','Email MFA is temporarily unavailable.');}
 }
 await audit(prisma,user,'MFA_CHALLENGE',{action,delivery:demo?'explicit-local-development':'mailjet-api'});
 return{success:true,status:200,requiresMfa:true,challengeId:session.id,user:publicUser(user),message:demo?'Development MFA: use the displayed one-time code.':'Enter the code sent to your email.',...(demo?{developmentOtp:otp}: {})};
}
export async function loginWithPassword(identifier,password,req){
 if(typeof identifier!=='string'||identifier.length>254||typeof password!=='string'||password.length>128)return fail(400,'INVALID_INPUT','Enter a valid email or employee ID and password.');
 const user=await prisma.user.findFirst({where:{OR:[{email:identifier.trim().toLowerCase()},{employeeId:identifier.trim()}]}});
 if(!user||user.status!=='ACTIVE'||!user.passwordHash||!await bcrypt.compare(password,user.passwordHash)){
  if(user){
   await audit(prisma,user,'AUTH_FAILED',{reason:'Invalid credentials',ip:req.ip||req.socket?.remoteAddress});
   const failures=await prisma.auditLog.count({where:{userId:user.id,action:'AUTH_FAILED',timestamp:{gte:new Date(Date.now()-15*60000)}}});
   await securityService.evaluate(user,{eventType:'FAILED_LOGIN',failedAuthCount:failures,source:'observed-authentication'},{ip:req.ip});
  }
  return fail(401,'INVALID_CREDENTIALS','Invalid credentials or account unavailable. Contact your security administrator if access is restricted.');
 }
 if(!isAdmin(user))return fail(403,'ADMIN_LOGIN_REQUIRED','Console access is restricted to administrators.');
 const cookie=browserCookie(req);
 const known=cookie&&await prisma.device.findFirst({where:{userId:user.id,fingerprint:hashOtp(cookie),isTrusted:true,status:'TRUSTED',trustScore:{gte:60}}});
 const assessed=await securityService.evaluate(user,{eventType:'LOGIN',...(known?{deviceId:known.id}:{}),source:'observed-authentication'},{ip:req.ip});
 if(assessed.user.status!=='ACTIVE')return fail(403,'ACCOUNT_RESTRICTED','Authentication requires an administrator to review this account.');
 const policy=await getPolicy(prisma,user.companyId),hour=localHour(new Date());
 // A new browser or administrator always steps up. Subsequent low-risk employee
 // login can use a browser registered only after a verified MFA challenge.
 const requireMfa=isAdmin(user)||!known||Math.max(user.riskScore,assessed.user.riskScore)>=policy.mfaThreshold||hour<9||hour>=18;
 if(requireMfa)return startChallenge(assessed.user,req);
 await audit(prisma,user,'AUTH_LOGIN',{assurance:'Password on MFA-registered logical browser',deviceId:known.id});
 return{success:true,status:200,user:assessed.user,requiresMfa:false,deviceId:known.id,mfaVerified:false};
}
export async function verifyLoginOtp(challengeId,otp,req){
 if(typeof challengeId!=='string'||!/^\d{6}$/.test(String(otp)))return fail(400,'INVALID_OTP','Enter the six-digit verification code.');
 // Claim one attempt atomically. Concurrent guesses cannot bypass the limit.
 const claimed=await prisma.mfaSession.updateMany({where:{id:challengeId,status:'PENDING',expiresAt:{gt:new Date()},attempts:{lt:5}},data:{attempts:{increment:1}}});
 if(claimed.count!==1)return fail(401,'CHALLENGE_INVALID','MFA challenge expired, was used, or reached its attempt limit.');
 const session=await prisma.mfaSession.findUnique({where:{id:challengeId},include:{user:true}});
 const a=Buffer.from(hashOtp(otp)),b=Buffer.from(session.challengeHash);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b)){
  if(session.attempts>=session.maxAttempts)await prisma.mfaSession.updateMany({where:{id:session.id,status:'PENDING'},data:{status:'FAILED'}});
  await audit(prisma,session.user,'MFA_FAILED',{action:session.action});
  await securityService.evaluate(session.user,{eventType:'MFA_FAILURE',failedAuthCount:session.attempts,source:'observed-authentication'},{ip:req.ip});
  return fail(401,'INVALID_OTP','Invalid verification code.');
 }
 if(!isAdmin(session.user))return fail(403,'ADMIN_LOGIN_REQUIRED','Console access is restricted to administrators.');
 if(session.user.status!=='ACTIVE')return fail(403,'ACCOUNT_RESTRICTED','Active account required.');
 const consumed=await prisma.mfaSession.updateMany({where:{id:session.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'VERIFIED',verifiedAt:new Date()}});
 if(consumed.count!==1)return fail(401,'CHALLENGE_USED','MFA challenge was already used.');
 await audit(prisma,session.user,'MFA_SUCCESS',{action:session.action});
 return{success:true,status:200,user:publicUser(session.user),mfaVerified:true,message:'Authentication successful.'};
}
export async function resendOtp(id,req){
 const session=await prisma.mfaSession.findFirst({where:{id,status:'PENDING',expiresAt:{gt:new Date()}},include:{user:true}});
 if(!session||session.user.status!=='ACTIVE')return fail(401,'CHALLENGE_INVALID','Sign in again to request a new code.');
 if(Date.now()-session.createdAt.getTime()<30000)return fail(429,'RESEND_TOO_SOON','Wait 30 seconds before requesting another code.');
 return startChallenge(session.user,req,session.action);
}

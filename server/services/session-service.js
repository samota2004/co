import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {prisma} from '../models/prisma.js';
import {generateJwtToken} from '../middleware/auth.js';
import {SecurityError,audit,isAdmin} from './security-common.js';
import {browserCookie,hashOtp} from './auth-service.js';
export const refreshHash=value=>createHash('sha256').update(value).digest('hex');
const cookieName='cyberorbit_refresh';
const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(p=>{const i=p.indexOf('=');return i<0?[]:[p.slice(0,i).trim(),p.slice(i+1)];}).filter(p=>p.length===2));
const setCookie=(res,value,maxAge)=>res.cookie(cookieName,value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/auth',maxAge});
export function checkRefreshOrigin(req){
  const allowed=new Set((process.env.FRONTEND_URL||'http://localhost:5173,http://localhost:3000').split(',').map(x=>x.trim()));
  const origin=req.headers.origin;
  if(origin&&!allowed.has(origin)||!origin&&req.headers['x-cyberorbit-csrf']!=='1')throw new SecurityError(403,'REFRESH_ORIGIN_DENIED','Refresh must originate from the configured application.');
}
export async function issueSession(user,req,res,mfaVerified=true,knownDeviceId=null){
  if(!isAdmin(user))throw new SecurityError(403,'ADMIN_LOGIN_REQUIRED','Console access is restricted to administrators.');
  let deviceId=knownDeviceId;
  if(mfaVerified){
    let browserSecret=browserCookie(req);
    if(!browserSecret||!/^[A-Za-z0-9_-]{43}$/.test(browserSecret))browserSecret=randomBytes(32).toString('base64url');
    const fingerprint=hashOtp(browserSecret);
    let device=await prisma.device.findFirst({where:{userId:user.id,fingerprint}});
    if(!device)device=await prisma.device.create({data:{deviceId:randomUUID(),userId:user.id,name:'MFA-verified logical browser',os:'Browser session',browser:String(req.headers['user-agent']||'Unknown').slice(0,200),ip:req.ip||req.socket?.remoteAddress||'Unknown',location:'Unknown',fingerprint,trustScore:80,isTrusted:true}});
    if(device.status==='REVOKED')throw new SecurityError(403,'DEVICE_REVOKED','This logical browser was revoked. Use an approved browser.');
    deviceId=device.id;
    res.cookie('orbit_browser',browserSecret,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api',maxAge:180*86400000});
  }
  const secret=randomBytes(32).toString('base64url');
  const session=await prisma.session.create({data:{sessionToken:randomUUID(),refreshHash:refreshHash(secret),userId:user.id,ip:req.ip||req.socket.remoteAddress||'Unknown',userAgent:String(req.headers['user-agent']||'').slice(0,512),expiresAt:new Date(Date.now()+7*86400000),mfaVerifiedAt:mfaVerified?new Date():null}});
  setCookie(res,secret,7*86400000);
  return{token:generateJwtToken(user,mfaVerified,deviceId,session.id),expiresIn:900,sessionId:session.id};
}
export async function rotateSession(req,res){
  checkRefreshOrigin(req);const secret=cookies(req)[cookieName];
  if(!secret||!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new SecurityError(401,'REFRESH_REQUIRED','Sign in again.');
  const replacement=randomBytes(32).toString('base64url');
  const result=await prisma.$transaction(async tx=>{
    const session=await tx.session.findFirst({where:{refreshHash:refreshHash(secret),revokedAt:null,expiresAt:{gt:new Date()}},include:{user:true}});
    if(!session||session.user.status!=='ACTIVE'||!isAdmin(session.user))throw new SecurityError(401,'SESSION_EXPIRED','Sign in again.');
    const updated=await tx.session.updateMany({where:{id:session.id,refreshHash:refreshHash(secret),revokedAt:null},data:{refreshHash:refreshHash(replacement)}});
    if(updated.count!==1)throw new SecurityError(401,'REFRESH_REUSED','The refresh token was already used.');
    const browserSecret=browserCookie(req);
    const device=browserSecret&&await tx.device.findFirst({where:{userId:session.userId,fingerprint:hashOtp(browserSecret),status:{not:'REVOKED'}}});
    return{token:generateJwtToken(session.user,Boolean(session.mfaVerifiedAt),device?.id||null,session.id),expiresIn:900};
  });setCookie(res,replacement,7*86400000);return result;
}
export async function logout(req,res,user){
  checkRefreshOrigin(req);
  await prisma.$transaction(async tx=>{await tx.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});await tx.user.update({where:{id:user.id},data:{authVersion:{increment:1}}});await audit(tx,user,'AUTH_LOGOUT');});
  setCookie(res,'',0);return{message:'Signed out; active sessions invalidated.'};
}

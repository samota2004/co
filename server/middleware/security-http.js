import {randomUUID} from 'node:crypto';
const limits=new Map();
export function securityHttp(req,res,next){
  req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  if(req.secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(process.env.NODE_ENV==='production')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  if(!req.path.startsWith('/api'))return next();
  res.setHeader('Cache-Control','no-store');
  const now=Date.now(),auth=/\/auth\/(login|mfa|forgot-password|reset-password|password)/.test(req.path),key=(req.ip||req.socket.remoteAddress)+':'+(auth?'auth':'api');
  for(const[k,v]of limits)if(v.until<now)limits.delete(k);
  const entry=limits.get(key)||{count:0,until:now+60000};entry.count++;limits.set(key,entry);
  res.on('finish',()=>{if(process.env.NODE_ENV!=='test')console.log(JSON.stringify({timestamp:new Date().toISOString(),requestId:req.requestId,userId:req.user?.id,method:req.method,endpoint:req.path,status:res.statusCode}));});
  if(limits.size>25000||entry.count>(auth?15:600)){res.setHeader('Retry-After','60');return res.status(429).json({success:false,error:{code:'RATE_LIMITED',message:'Too many requests. Retry shortly.',requestId:req.requestId}});}
  next();
}
export const allowedOrigins=()=>new Set((process.env.FRONTEND_URL||'http://localhost:5173,http://localhost:3000').split(',').map(x=>x.trim()));

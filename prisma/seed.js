import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
import {DEFAULT_POLICY} from '../server/services/policy-service.js';
const db=new PrismaClient(),demo=process.argv.includes('--demo');
const companyId=demo?'cyberorbit-demo':process.env.COMPANY_ID||'legacy';
const departments=['HR','FINANCE','ENGINEERING','IT','SECURITY','SALES','MARKETING','ADMINISTRATION','LEGAL','EXECUTIVE'];
async function main(){
 for(const code of departments)await db.department.upsert({where:{code},create:{code,name:code},update:{}});
 for(const code of ['EMPLOYEE','MANAGER','SECURITY_ADMIN','SYSTEM_ADMIN'])await db.role.upsert({where:{code},create:{code,name:code.replaceAll('_',' ')},update:{}});
 await db.zeroTrustPolicy.upsert({where:{companyId},create:{companyId,config:DEFAULT_POLICY,...Object.fromEntries(['lowRiskMax','mediumRiskMax','highRiskMax','veryHighRiskMax','criticalThreshold','mfaThreshold','approvalThreshold','restrictionThreshold','freezeThreshold'].map(k=>[k,DEFAULT_POLICY[k]]))},update:{}});
 const email=demo?'soc@demo.cyberorbit.invalid':process.env.ADMIN_EMAIL;
 const password=demo?process.env.DEMO_PASSWORD:process.env.ADMIN_INITIAL_PASSWORD;
 const existingMain=await db.user.findFirst({where:{companyId,isMainAdmin:true}});
 if(!existingMain){
  if(!email||!password||password.length<12)throw new Error('Configure ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD (12+ characters), or DEMO_PASSWORD for --demo.');
  await db.user.create({data:{employeeId:demo?'DEMO-SOC':'ADM-'+Date.now(),name:demo?'Synthetic Demo SOC':process.env.ADMIN_NAME||'Company security administrator',email,companyId,roleCode:'SECURITY_ADMIN',departmentCode:'SECURITY',isMainAdmin:true,passwordHash:await bcrypt.hash(password,12),riskScore:0,trustScore:90}});
 }
 if(!demo){console.log('Bootstrap complete. Existing accounts and credentials were preserved.');return;}
 if(!password||password.length<12)throw new Error('Set DEMO_PASSWORD to at least 12 characters. Demo passwords are not printed.');
 const passwordHash=await bcrypt.hash(password,12);
 for(const departmentCode of departments){
  const manager=await db.user.upsert({where:{employeeId:'DEMO-MANAGER-'+departmentCode},create:{employeeId:'DEMO-MANAGER-'+departmentCode,email:'manager-'+departmentCode.toLowerCase()+'@demo.cyberorbit.invalid',name:'Synthetic '+departmentCode+' Manager',companyId,departmentCode,roleCode:'MANAGER',passwordHash,riskScore:0,trustScore:90},update:{}});
  const resource=await db.resource.upsert({where:{resourceId:'DEMO-RESOURCE-'+departmentCode},create:{resourceId:'DEMO-RESOURCE-'+departmentCode,companyId,name:'Synthetic '+departmentCode+' resource',departmentCode,sensitivity:departmentCode==='FINANCE'?'HIGHLY_SENSITIVE':'INTERNAL',requiredRoles:['EMPLOYEE','MANAGER'],description:'Demonstration resource. Contains no confidential content.'},update:{}});
  for(let index=1;index<=10;index++){
   const key='DEMO-'+departmentCode+'-'+index;
   const user=await db.user.upsert({where:{employeeId:key},create:{employeeId:key,email:key.toLowerCase()+'@demo.cyberorbit.invalid',name:'Synthetic '+departmentCode+' Employee '+index,companyId,departmentCode,roleCode:'EMPLOYEE',managerId:manager.id,passwordHash,riskScore:0,trustScore:90},update:{}});
   await db.device.upsert({where:{deviceId:key+'-DEVICE'},create:{deviceId:key+'-DEVICE',userId:user.id,name:'Synthetic logical workstation',os:'Logical demo',browser:'Synthetic context',ip:'127.0.0.1',location:'Synthetic office',trustScore:90,isTrusted:true},update:{}});
   const midnight=new Date();midnight.setUTCHours(10,0,0,0);
   await db.activityEvent.createMany({data:Array.from({length:21},(_,i)=>({eventId:key+'-baseline-day-'+new Date(midnight.getTime()-(i+1)*86400000).toISOString().slice(0,10),userId:user.id,userEmail:user.email,userRole:user.roleCode,resourceId:resource.id,resourceName:resource.name,type:'LOGIN_SUCCESS',timestamp:new Date(midnight.getTime()-(i+1)*86400000),ip:'127.0.0.1',location:'Synthetic office',downloadSizeMB:20+index,metadata:{synthetic:true,source:'synthetic-enterprise-seed'}})),skipDuplicates:true});
  }
 }
 console.log('Synthetic demo tenant seeded: 100 employees, 10 managers, department resources and 21 prior days. Existing accounts, risk history, enrollment and queues were preserved.');
}
try{await main();}catch(error){console.error('Seed failed:',error.message);process.exitCode=1;}finally{await db.$disconnect();}

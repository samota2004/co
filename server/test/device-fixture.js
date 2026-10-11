import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '../models/prisma.js';
import dotenv from 'dotenv';
export const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
dotenv.config({path:path.join(projectRoot,'.env'),quiet:true});
export async function deviceFixture() {
  const schema=`orbit_buttons_test_${randomBytes(8).toString('hex')}`,base=new PrismaClient();
  const url=new URL(process.env.DATABASE_URL.replace(/^["']|["']$/g,''));url.searchParams.set('schema',schema);
  const prisma=new PrismaClient({datasources:{db:{url:url.toString()}}});
  await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const close=async()=>{
    await prisma.$disconnect();
    if(!/^orbit_buttons_test_[a-f0-9]{16}$/.test(schema))throw new Error('Unsafe test cleanup');
    await base.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await base.$disconnect();
  };
  try {
    for(const directory of (await fs.readdir(path.join(projectRoot,'prisma/migrations'))).filter(n=>/^\d/.test(n)).sort()){
      const sql=await fs.readFile(path.join(projectRoot,'prisma/migrations',directory,'migration.sql'),'utf8');
      for(const statement of sql.split(';').map(s=>s.trim()).filter(s=>s.replace(/--[^\n]*/g,'').trim()))await prisma.$executeRawUnsafe(statement);
    }
    global.__prismaClient=prisma;process.env.JWT_SECRET=randomBytes(32).toString('hex');process.env.ENDPOINT_ALLOW_LOOPBACK_HTTP='true';
    await prisma.role.createMany({data:[{code:'EMPLOYEE',name:'Employee'},{code:'SECURITY_ADMIN',name:'Admin'}]});
    await prisma.department.create({data:{code:'ENGINEERING',name:'Engineering'}});
    const user=async(name,companyId,roleCode='EMPLOYEE',status='ACTIVE')=>prisma.user.create({data:{employeeId:randomUUID(),email:`${randomUUID()}@test.invalid`,name,companyId,roleCode,status}});
    const admin=await user('Device test administrator','A','SECURITY_ADMIN');
    await prisma.user.update({where:{id:admin.id},data:{isMainAdmin:true}});admin.isMainAdmin=true;
    const employee=await user('Assigned employee','A'),employee2=await user('Second employee','A'),otherAdmin=await user('Other admin','B','SECURITY_ADMIN'),foreign=await user('Foreign employee','B'),disabled=await user('Disabled employee','A','EMPLOYEE','DISABLED');
    return {prisma,admin,employee,employee2,otherAdmin,foreign,disabled,close,url:url.toString()};
  }catch(e){await close();throw e;}
}

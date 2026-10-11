import {Router} from 'express';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {projectRoot} from '../services/project-paths.js';
import {prisma} from '../models/prisma.js';
import {api} from '../services/security-common.js';
import {checkMLServiceHealth} from '../services/ml-service.js';
import {sseManager} from '../services/sse.js';
const router=Router();
router.get('/openapi',api(async()=>({specification:JSON.parse(await readFile(path.join(projectRoot,'server','openapi.json'),'utf8'))})));
router.get('/health',api(async()=>{
 let database='unavailable',ml={status:'unavailable'};
 try{await prisma.$queryRaw`SELECT 1`;database='connected';}catch{}
 const started=performance.now();try{ml={...await checkMLServiceHealth(),latencyMs:Math.round(performance.now()-started)};}catch{}
 return{status:database==='connected'?'healthy':'degraded',uptime:process.uptime(),services:{database:{status:database},ml,geminiCopilot:{status:process.env.GEMINI_ENABLED==='true'&&process.env.GEMINI_API_KEY&&process.env.GEMINI_MODEL?'configured (not probed)':'local rule summary'}}};
}));
router.get('/status',api(async req=>({system:{version:'3.0.0',storageEngine:'PostgreSQL via Prisma',realTimeStream:{engine:'SSE',endpoint:'/api/events/stream',connectedClients:sseManager.getClientCount(req.user.companyId),heartbeatIntervalMs:25000},applicationFreezeOnly:true}})));
export default router;

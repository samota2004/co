import {Router} from 'express';
import {prisma} from '../models/prisma.js';
import {requireAuth,requireSecurityAdmin} from '../middleware/auth.js';
import {api,userScope,securityErrorHandler,SecurityError} from '../services/security-common.js';
import endpointRoutes from './endpoint.js';
import authRoutes from './auth.js';
import securityRoutes from './security.js';
import eventsRoutes from './events.js';
import devicesRoutes from './devices.js';
import simulationRoutes from './simulation.js';
import mlRoutes from './ml.js';
import copilotRoutes from './copilot.js';
import systemRoutes from './system.js';
import adminsRoutes from './admins.js';
const router=Router();
// Enrollment authenticates its own one-use/device credentials; login is public.
router.use('/endpoint',endpointRoutes);
router.use('/auth',authRoutes);
router.use('/events',eventsRoutes);
router.use(requireAuth);
router.use(securityRoutes);
router.use('/devices',devicesRoutes);
router.use('/simulation',requireSecurityAdmin,simulationRoutes);
router.use('/ml',mlRoutes);
router.use('/copilot',requireSecurityAdmin,copilotRoutes);
router.use('/system',requireSecurityAdmin,systemRoutes);
router.use('/admins',requireSecurityAdmin,adminsRoutes);
router.get('/stats',api(async req=>{
 const scope=userScope(req.user),subject={user:scope};
 const [users,devices,resources,events,incidents,accessRequests,auditLogs]=await Promise.all([
 prisma.user.count({where:scope}),prisma.device.count({where:subject}),
 prisma.resource.count({where:{companyId:req.user.companyId}}),
 prisma.activityEvent.count({where:subject}),prisma.incident.count({where:subject}),
 prisma.accessRequest.count({where:subject}),
 ['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(req.user.roleCode)?prisma.auditLog.count({where:{companyId:req.user.companyId,...(req.user.isMainAdmin?{}:{user:scope})}}):0]);
 return{stats:{users,devices,resources,events,incidents,accessRequests,auditLogs,databaseConnected:true}};
}));
router.use((req,res,next)=>next(new SecurityError(404,'API_NOT_FOUND','API endpoint not found.')));
router.use(securityErrorHandler);
export default router;

import {Router} from 'express';
import {prisma} from '../models/prisma.js';
import {riskEngine} from '../../cyber/risk-engine/risk-engine.js';
import {getPolicy,policyAction} from '../services/policy-service.js';
import {evolveTrust} from '../../cyber/zero-trust/trust-engine.js';
import {api,SecurityError,userScope,audit} from '../services/security-common.js';
const router=Router();
const CUSTOM_INPUT_FIELDS=new Set(['userId','resourceId','deviceId','downloadVolumeMB','failedAuthCount','isOffHours','isPrivilegeEscalation']);
function customInput(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SecurityError(400,'INVALID_SIMULATION_INPUT','A custom simulation object is required.');
 const unexpected=Object.keys(raw).filter(key=>!CUSTOM_INPUT_FIELDS.has(key));
 if(unexpected.length)throw new SecurityError(400,'INVALID_SIMULATION_INPUT','Custom simulations accept only the documented synthetic context fields.');
 if(typeof raw.userId!=='string'||!raw.userId.trim()||raw.userId.length>128)throw new SecurityError(400,'INVALID_SIMULATION_INPUT','Select a valid employee demo account.');
 for(const key of ['resourceId','deviceId'])if(raw[key]!==undefined&&(typeof raw[key]!=='string'||!raw[key].trim()||raw[key].length>128))throw new SecurityError(400,'INVALID_SIMULATION_INPUT',`${key} must be a valid identifier when provided.`);
 if(typeof raw.downloadVolumeMB!=='number'||!Number.isFinite(raw.downloadVolumeMB)||raw.downloadVolumeMB<0||raw.downloadVolumeMB>1000000)throw new SecurityError(400,'INVALID_SIMULATION_INPUT','Download MB must be a finite number from 0 to 1,000,000.');
 if(!Number.isInteger(raw.failedAuthCount)||raw.failedAuthCount<0||raw.failedAuthCount>100)throw new SecurityError(400,'INVALID_SIMULATION_INPUT','Failed authentications must be an integer from 0 to 100.');
 for(const key of ['isOffHours','isPrivilegeEscalation'])if(typeof raw[key]!=='boolean')throw new SecurityError(400,'INVALID_SIMULATION_INPUT',`${key} must be a boolean.`);
 return raw;
}
const SCENARIOS = {
  "scenario-1-normal": {
    name: "Scenario 1: Baseline Normal Access",
    eventType: "FILE_ACCESS",
    severity: "LOW",
    defaults: {
      deviceTrustScore: 92,
      isUnknownDevice: false,
      location: "Corporate HQ",
      ipAddress: "10.240.14.92",
      isOffHours: false,
      isUsbTransfer: false,
      isPrivilegeEscalation: false,
      metadata: {
        downloadSizeMB: 14,
        fileCount: 5,
        crossDepartment: false
      }
    }
  },

  "scenario-2-suspicious-login": {
    name: "Scenario 2: Suspicious Off-Hours Login",
    eventType: "LOGIN",
    severity: "MEDIUM",
    defaults: {
      deviceTrustScore: 35,
      isUnknownDevice: true,
      location: "Bucharest VPN",
      ipAddress: "185.220.101.44",
      isOffHours: true,
      isUsbTransfer: false,
      isPrivilegeEscalation: false,
      metadata: {
        offHours: true,
        isOffHours: true,
        failedLoginAttempts: 3,
        crossDepartment: false
      }
    }
  },

  "scenario-3-insider-exfiltration": {
    name: "Scenario 3: Cross-Department Exfiltration",
    eventType: "FILE_DOWNLOAD",
    severity: "HIGH",
    defaults: {
      deviceTrustScore: 70,
      isUnknownDevice: false,
      location: "Corporate HQ",
      ipAddress: "10.240.14.92",
      isOffHours: true,
      isUsbTransfer: false,
      isPrivilegeEscalation: false,
      metadata: {
        downloadSizeMB: 480,
        fileSizeMB: 480,
        fileCount: 500,
        crossDepartment: true,
        offHours: true,
        isOffHours: true
      }
    }
  },

  "scenario-4-critical-compromise": {
    name: "Scenario 4: Critical Account Compromise & Auto-Freeze",
    eventType: "LOGIN_FAILED",
    severity: "CRITICAL",
    defaults: {
      deviceTrustScore: 20,
      isUnknownDevice: true,
      location: "Unknown External Network",
      ipAddress: "45.141.87.21",
      isOffHours: true,
      isUsbTransfer: true,
      isPrivilegeEscalation: true,
      metadata: {
        failedLoginAttempts: 4,
        offHours: true,
        isOffHours: true,
        privilegeEscalation: true,
        usbTransfer: true,
        crossDepartment: true,
        downloadSizeMB: 1840,
        fileSizeMB: 1840,
        fileCount: 1800
      }
    }
  },

  "scenario-5-privilege-escalation": {
    name: "Scenario 5: Privilege Escalation Attack",
    eventType: "PRIVILEGE_ELEVATION",
    severity: "HIGH",
    defaults: {
      deviceTrustScore: 65,
      isUnknownDevice: false,
      location: "Corporate HQ",
      ipAddress: "10.240.14.92",
      isOffHours: false,
      isUsbTransfer: false,
      isPrivilegeEscalation: true,
      metadata: {
        privilegeEscalation: true,
        command: "sudo escalation attempt",
        targetRole: "SYSTEM_ADMIN"
      }
    }
  },

  "scenario-6-usb-exfiltration": {
    name: "Scenario 6: USB Storage Physical Exfiltration",
    eventType: "USB_ACTIVITY",
    severity: "HIGH",
    defaults: {
      deviceTrustScore: 45,
      isUnknownDevice: false,
      location: "Corporate HQ",
      ipAddress: "10.240.14.92",
      isOffHours: false,
      isUsbTransfer: true,
      isPrivilegeEscalation: false,
      metadata: {
        usbTransfer: true,
        downloadSizeMB: 620,
        fileSizeMB: 620,
        fileCount: 620,
        removableMedia: true,
        approvedDevice: false,
        crossDepartment: true
      }
    }
  },

  "scenario-7-large-scale-exfiltration": {
    name: "Scenario 7: Large-Scale High-Velocity Exfiltration",
    eventType: "FILE_DOWNLOAD",
    severity: "CRITICAL",
    defaults: {
      deviceTrustScore: 25,
      isUnknownDevice: true,
      location: "Frankfurt External Network",
      ipAddress: "91.198.174.21",
      isOffHours: true,
      isUsbTransfer: false,
      isPrivilegeEscalation: false,
      metadata: {
        downloadSizeMB: 2850,
        fileSizeMB: 2850,
        fileCount: 3400,
        massDownload: true,
        highVelocity: true,
        crossDepartment: true,
        offHours: true,
        isOffHours: true,
        destinationSite: "unauthorized-cloud.example",
        transferTool: "rclone"
      }
    }
  },

  "scenario-8-compromised-endpoint": {
    name: "Scenario 8: Compromised Endpoint & C2 Beaconing",
    eventType: "SHELL_EXECUTION",
    severity: "CRITICAL",
    defaults: {
      deviceTrustScore: 15,
      isUnknownDevice: true,
      location: "Unknown External Network",
      ipAddress: "103.86.96.44",
      isOffHours: true,
      isUsbTransfer: false,
      isPrivilegeEscalation: false,
      metadata: {
        failedLoginAttempts: 5,
        offHours: true,
        isOffHours: true,
        c2Beaconing: true,
        beaconIntervalSeconds: 30,
        destinationSite: "foreign-proxy.example",
        shellCommand: "automated-beacon-process",
        crossDepartment: true
      }
    }
  }
};

async function scenarioTarget(req,targetId){
 const target=await prisma.user.findFirst({where:{AND:[userScope(req.user),{OR:[{id:targetId},{employeeId:targetId}]}]},select:{id:true,roleCode:true,departmentCode:true}});
 if(!target)throw new SecurityError(404,'USER_NOT_FOUND','Employee context is not available in your authorized scope.');
 if(['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(target.roleCode))throw new SecurityError(400,'EMPLOYEE_REQUIRED','Select an employee context.');
 return target;
}

router.get('/scenarios',api(async()=>({scenarios:Object.entries(SCENARIOS).map(([id,s])=>({id,name:s.name,eventType:s.eventType,synthetic:true,description:s.name.replace(/^Scenario \d+: /,'')}))})));
router.get('/history',api(async req=>({runs:(await prisma.auditLog.findMany({where:{companyId:req.user.companyId,userId:req.user.id,action:'SIMULATION_RUN'},orderBy:{timestamp:'desc'},take:50,select:{id:true,timestamp:true,metadata:true}})).map(row=>({id:row.id,timestamp:row.timestamp,...(row.metadata||{})}))})));
async function evaluateScenario(req,user,event,scenario){
 const [policy,resource,device]=await Promise.all([
  getPolicy(prisma,req.user.companyId),
  event.resourceId?prisma.resource.findFirst({where:{id:event.resourceId,companyId:req.user.companyId}}):null,
  event.deviceId?prisma.device.findFirst({where:{id:event.deviceId,userId:user.id,user:{companyId:req.user.companyId,deletedAt:null}}}):null,
 ]);
 if(event.resourceId&&!resource)throw new SecurityError(404,'RESOURCE_NOT_FOUND','Select a resource in your company.');
 if(event.deviceId&&!device)throw new SecurityError(404,'DEVICE_NOT_FOUND','Select a device assigned to the selected employee.');
 const evaluation=riskEngine.evaluateRisk({id:'synthetic-scenario',departmentCode:user.departmentCode,roleCode:user.roleCode,baseline:null,previousIncidents:0},{...event,timestamp:new Date().toISOString(),aggregateOnly:true},device,resource,null,policy);
 const action=policyAction(evaluation.riskScore,policy);
 const measuredTrust=user.trustUpdatedAt?user.trustScore:null;
 const projectedTrust=measuredTrust===null?null:evolveTrust(measuredTrust,evaluation.riskScore,policy,false);
 const result={scenario,synthetic:true,simulationOnly:true,target:{roleCode:user.roleCode,departmentCode:user.departmentCode},decision:{decision:action,allowed:['ALLOW','MONITOR'].includes(action),requiresMfa:action==='MFA',requiresApproval:action==='REQUIRE_APPROVAL',isRestricted:['RESTRICT','FREEZE','REQUIRE_APPROVAL'].includes(action),isFrozen:action==='FREEZE',reason:evaluation.explanationText,evaluation:{...evaluation,trustScore:projectedTrust}},userState:{productionStateUnchanged:true,riskScoreNotReadOrChanged:true,trustScoreNotReadOrChanged:true},ml:{available:false,reason:'Synthetic scenario evaluation never calls the trained model.'},incident:null,request:null};
 await audit(prisma,req.user,'SIMULATION_RUN',{synthetic:true,scenario,targetRole:user.roleCode,departmentCode:user.departmentCode,riskScore:evaluation.riskScore,riskLevel:evaluation.riskLevel,policyAction:action,contributingFactors:evaluation.contributingFactors,simulationOnly:true});
 return result;
}
router.post('/custom',api(async req=>{
 const input=customInput(req.body);
 const user=await scenarioTarget(req,input.userId);
 const event={...(input.resourceId?{resourceId:input.resourceId}:{}),...(input.deviceId?{deviceId:input.deviceId}:{}),eventType:input.isPrivilegeEscalation?'PRIVILEGE_CHANGE':'FILE_DOWNLOAD',downloadVolumeMB:input.downloadVolumeMB,failedAuthCount:input.failedAuthCount,isOffHours:input.isOffHours,isPrivilegeEscalation:input.isPrivilegeEscalation,metadata:{synthetic:true,simulationKind:'custom-context'}};
 return evaluateScenario(req,user,event,'Custom synthetic context');
}));
router.post('/scenario/:scenarioId',api(async req=>{
 const scenario=SCENARIOS[req.params.scenarioId];
 if(!scenario)throw new SecurityError(400,'UNKNOWN_SCENARIO','Select an existing scenario.');
 if(!req.body.userId)throw new SecurityError(400,'USER_REQUIRED','Explicitly select an employee. Scenarios can restrict that account.');
 const user=await scenarioTarget(req,req.body.userId);
 const event={...scenario.defaults,...req.body,eventType:scenario.eventType,metadata:{...scenario.defaults.metadata,synthetic:true,scenarioId:req.params.scenarioId}};
 return evaluateScenario(req,user,event,scenario.name);
}));
export default router;

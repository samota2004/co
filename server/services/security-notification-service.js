import {sseManager} from './sse.js';

const recipientWhere=(companyId,targetUserId,assignedAdminId)=>({
  companyId,
  deletedAt:null,
  status:'ACTIVE',
  roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']},
  OR:[{isMainAdmin:true},...(assignedAdminId?[{id:assignedAdminId}]:[])],
});

/**
 * Persist a containment lifecycle notification for the employee's Main Admin
 * and assigned security administrator. The caller supplies a stable dedupeKey
 * for one state transition; it is never derived from an authorization secret.
 */
export async function createContainmentNotifications(tx,{companyId,user,type,severity,title,message,dedupeKey,metadata={},incidentId=null}){
  if(!tx.securityNotification)return [];
  const recipients=await tx.user.findMany({where:recipientWhere(companyId,user.id,user.assignedAdminId),select:{id:true}});
  if(!recipients.length)return [];
  await tx.securityNotification.createMany({data:recipients.map(recipient=>({
    companyId,
    recipientId:recipient.id,
    targetUserId:user.id,
    incidentId,
    dedupeKey,
    type,
    severity,
    title,
    message,
    metadata,
  })),skipDuplicates:true});
  return tx.securityNotification.findMany({where:{companyId,dedupeKey,recipientId:{in:recipients.map(row=>row.id)}},orderBy:{createdAt:'asc'}});
}

export function broadcastSecurityNotifications(notifications=[]){
  for(const notification of notifications)sseManager.broadcast('SECURITY_NOTIFICATION',{companyId:notification.companyId,userId:notification.targetUserId,recipientId:notification.recipientId,notification});
}

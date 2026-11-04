import {SecurityError,isAdmin,pagination,userScope} from './security-common.js';

const SECURITY_EVENT_TYPES=[
  'CONTAINMENT_REQUESTED',
  'CONTAINMENT_CONFIRMED',
  'CONTAINMENT_FAILED',
  'CONTAINMENT_UNSUPPORTED',
  'RESTORATION_REQUESTED',
  'RESTORATION_CONFIRMED',
  'RESTORATION_FAILED',
  'RESTORATION_UNSUPPORTED',
];

const EVENT_DEFINITIONS={
  CONTAINMENT_REQUESTED:{label:'Containment requested',category:'CONTAINMENT',action:'BLOCK',defaultStatus:'PENDING'},
  CONTAINMENT_CONFIRMED:{label:'Containment confirmed',category:'CONTAINMENT',action:'BLOCK',defaultStatus:'CONFIRMED'},
  CONTAINMENT_FAILED:{label:'Containment failed',category:'CONTAINMENT',action:'BLOCK',defaultStatus:'FAILED'},
  CONTAINMENT_UNSUPPORTED:{label:'Containment unsupported',category:'CONTAINMENT',action:'BLOCK',defaultStatus:'UNSUPPORTED'},
  RESTORATION_REQUESTED:{label:'Restoration requested',category:'RESTORATION',action:'ALLOW',defaultStatus:'PENDING'},
  RESTORATION_CONFIRMED:{label:'Restoration confirmed',category:'RESTORATION',action:'ALLOW',defaultStatus:'CONFIRMED'},
  RESTORATION_FAILED:{label:'Restoration failed',category:'RESTORATION',action:'ALLOW',defaultStatus:'FAILED'},
  RESTORATION_UNSUPPORTED:{label:'Restoration unsupported',category:'RESTORATION',action:'ALLOW',defaultStatus:'UNSUPPORTED'},
};

const EVENT_STATUSES=new Set(['PENDING','CONFIRMED','FAILED','UNSUPPORTED','EXPIRED','SUPERSEDED']);
const SEVERITIES=new Set(['LOW','MEDIUM','HIGH','VERY_HIGH','CRITICAL']);

function dateFilter(value,label){
  if(value===undefined||value===null||value==='')return undefined;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))throw new SecurityError(400,'INVALID_DATE_FILTER',`${label} must be a valid date.`);
  return date;
}

function commandIds(metadata){
  const ids=[];
  if(Array.isArray(metadata?.commandIds))ids.push(...metadata.commandIds);
  if(typeof metadata?.commandId==='string')ids.push(metadata.commandId);
  return [...new Set(ids.filter(id=>typeof id==='string'&&id.length>0))];
}

function commandStatus(commands,definition){
  if(!commands.length)return definition.defaultStatus;
  const statuses=commands.map(command=>String(command.status||'').toUpperCase());
  if(statuses.some(status=>status==='PENDING'||status==='PENDING_OFFLINE'))return 'PENDING';
  if(statuses.some(status=>status==='FAILED'))return 'FAILED';
  if(statuses.some(status=>status==='UNSUPPORTED'))return 'UNSUPPORTED';
  if(statuses.some(status=>status==='EXPIRED'))return 'EXPIRED';
  if(statuses.every(status=>status==='SUCCEEDED'))return 'CONFIRMED';
  if(statuses.some(status=>status==='SUPERSEDED'))return 'SUPERSEDED';
  return definition.defaultStatus;
}

function readableSearchValues(event){
  return [event.eventType,event.eventCode,event.status,event.severity,event.title,event.user?.name,event.user?.email,event.user?.employeeId,event.device?.name,event.relatedIncidentId]
    .filter(value=>value!==null&&value!==undefined)
    .map(value=>String(value).toLowerCase());
}

function toEvent(notification,user,commands){
  const definition=EVENT_DEFINITIONS[notification.type];
  const status=commandStatus(commands,definition);
  const devices=[...new Map(commands.map(command=>[command.deviceId,command.device]).filter(([,device])=>device)).values()];
  const metadata=notification.metadata&&typeof notification.metadata==='object'&&!Array.isArray(notification.metadata)?notification.metadata:{};
  return {
    id:`${notification.companyId}:${notification.dedupeKey}`,
    sourceId:notification.id,
    eventCode:notification.type,
    eventType:definition.label,
    category:definition.category,
    severity:notification.severity,
    status,
    title:notification.title,
    details:notification.message,
    timestamp:notification.createdAt,
    user:user?{id:user.id,name:user.name,email:user.email,employeeId:user.employeeId,department:user.departmentCode,status:user.status}:null,
    device:devices.length===1?{id:devices[0].id,name:devices[0].name,platform:devices[0].platform}:devices.length>1?{count:devices.length,name:`${devices.length} enrolled endpoints`}:null,
    relatedIncidentId:notification.incidentId||metadata.incidentId||null,
    riskScore:typeof metadata.riskScore==='number'?metadata.riskScore:null,
    commandIds:commands.map(command=>command.commandId),
  };
}

export async function getSecurityEventFeed(db,actor,query={}){
  if(!isAdmin(actor))throw new SecurityError(403,'INVESTIGATION_DENIED','Security event access required.');
  const scope=userScope(actor);
  const scopedUsers=await db.user.findMany({where:scope,select:{id:true,name:true,email:true,employeeId:true,departmentCode:true,status:true}});
  const userById=new Map(scopedUsers.map(user=>[user.id,user]));
  const from=dateFilter(query.from??query.dateFrom,'from');
  const to=dateFilter(query.to??query.dateTo,'to');
  if(from&&to&&from>to)throw new SecurityError(400,'INVALID_DATE_FILTER','from must be earlier than to.');
  const notifications=await db.securityNotification.findMany({
    where:{
      companyId:actor.companyId,
      targetUserId:{in:scopedUsers.map(user=>user.id)},
      type:{in:SECURITY_EVENT_TYPES},
      ...(from||to?{createdAt:{...(from?{gte:from}:{}),...(to?{lte:to}:{})}}:{}),
    },
    orderBy:{createdAt:'desc'},
    select:{id:true,companyId:true,targetUserId:true,incidentId:true,dedupeKey:true,type:true,severity:true,title:true,message:true,metadata:true,createdAt:true},
  });

  const uniqueNotifications=[];
  const seenKeys=new Set();
  for(const notification of notifications){
    const key=`${notification.companyId}:${notification.dedupeKey}`;
    if(seenKeys.has(key))continue;
    seenKeys.add(key);
    uniqueNotifications.push(notification);
  }

  const allCommandIds=[...new Set(uniqueNotifications.flatMap(notification=>commandIds(notification.metadata)))];
  const commands=allCommandIds.length&&db.endpointEnforcementCommand
    ?await db.endpointEnforcementCommand.findMany({where:{companyId:actor.companyId,commandId:{in:allCommandIds},action:{in:['BLOCK','ALLOW']}},include:{device:{select:{id:true,name:true,platform:true}}}})
    :[];
  const fallbackCommands=db.endpointEnforcementCommand
    ?await db.endpointEnforcementCommand.findMany({where:{companyId:actor.companyId,userId:{in:scopedUsers.map(user=>user.id)},action:{in:['BLOCK','ALLOW']}},include:{device:{select:{id:true,name:true,platform:true}}},orderBy:{createdAt:'desc'}})
    :[];
  const commandsById=new Map(commands.map(command=>[command.commandId,command]));
  const events=uniqueNotifications.map(notification=>{
    const definition=EVENT_DEFINITIONS[notification.type];
    const metadata=notification.metadata&&typeof notification.metadata==='object'&&!Array.isArray(notification.metadata)?notification.metadata:{};
    let linked=commandIds(metadata).map(id=>commandsById.get(id)).filter(Boolean);
    if(!linked.length&&metadata.requestedById){
      const createdAt=new Date(notification.createdAt).getTime();
      const expectedCount=Number.isInteger(metadata.deviceCount)&&metadata.deviceCount>0?metadata.deviceCount:1;
      linked=fallbackCommands.filter(command=>command.userId===notification.targetUserId&&command.action===definition.action&&command.createdById===metadata.requestedById&&Math.abs(command.createdAt.getTime()-createdAt)<=10000).slice(0,expectedCount);
    }
    return toEvent(notification,userById.get(notification.targetUserId),linked);
  });

  const search=typeof query.search==='string'?query.search.trim().toLowerCase():'';
  const eventType=typeof query.eventType==='string'&&query.eventType!=='ALL'?query.eventType.toUpperCase():'';
  const severity=typeof query.severity==='string'&&query.severity!=='ALL'?query.severity.toUpperCase():'';
  const status=typeof query.status==='string'&&query.status!=='ALL'?query.status.toUpperCase():'';
  if(eventType&&!SECURITY_EVENT_TYPES.includes(eventType))throw new SecurityError(400,'INVALID_EVENT_TYPE','Invalid security event type.');
  if(severity&&!SEVERITIES.has(severity))throw new SecurityError(400,'INVALID_SEVERITY','Invalid severity filter.');
  if(status&&!EVENT_STATUSES.has(status))throw new SecurityError(400,'INVALID_STATUS','Invalid security event status.');
  const filtered=events.filter(event=>(!search||readableSearchValues(event).some(value=>value.includes(search)))&&(!eventType||event.eventCode===eventType)&&(!severity||event.severity===severity)&&(!status||event.status===status));
  const page=pagination(query);
  const incidentWhere={user:scope};
  const [totalIncidents,activeUnresolvedIncidents,criticalIncidents,openIncidents]=await Promise.all([
    db.incident.count({where:incidentWhere}),
    db.incident.count({where:{...incidentWhere,status:{notIn:['RESOLVED','FALSE_POSITIVE','REJECTED']}}}),
    db.incident.count({where:{...incidentWhere,severity:'CRITICAL'}}),
    db.incident.count({where:{...incidentWhere,status:'OPEN'}}),
  ]);
  const metrics={
    totalIncidents,
    activeUnresolvedIncidents,
    criticalIncidents,
    openIncidents,
    totalSecurityEvents:events.length,
    pendingContainmentRequests:events.filter(event=>event.category==='CONTAINMENT'&&event.eventCode==='CONTAINMENT_REQUESTED'&&event.status==='PENDING').length,
  };
  return {events:filtered.slice(page.skip,page.skip+page.take),total:filtered.length,metrics};
}

export {SECURITY_EVENT_TYPES,EVENT_DEFINITIONS};

import { db } from '../models/db.js';
import { prisma } from '../models/prisma.js';
class SseManager {
  constructor() {
    this.clients = new Set();
    this.scopes = new WeakMap();
    this.heartbeatInterval = setInterval(async () => {
      for (const client of this.clients) {
        const scope=this.scopes.get(client);
        try {
          const user=scope && await prisma.user.findUnique({where:{id:scope.user.id},select:{id:true,status:true,companyId:true,roleCode:true,authVersion:true}});
          if(!user || !['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(user.roleCode) || user.status!=='ACTIVE' || user.companyId!==scope.user.companyId || user.roleCode!==scope.user.roleCode || user.authVersion!==(scope.user.authVersion??0)) {client.end();this.clients.delete(client);}
        }catch {client.end();this.clients.delete(client);}
      }
      this.broadcast('HEARTBEAT', { timestamp: new Date().toISOString() });
    }, 25000);
    // The HTTP listener owns process lifetime; importing authentication for a
    // command or isolated test must not keep a finished process alive.
    this.heartbeatInterval.unref();
  }

  addClient(res, user, expiresAt = Date.now() + 8*3600000) {
    if (!res) return;
    if (!user) return;
    this.clients.add(res);
    this.scopes.set(res, { user, expiresAt });

    // Only write headers if they haven't been sent yet
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      try {
        res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);
      } catch (err) {
        this.clients.delete(res);
      }
    }

    // Automatically clean up when connection closes or errors
    res.on('close', () => {
      this.removeClient(res);
    });
    res.on('error', () => {
      this.removeClient(res);
    });
  }

  removeClient(res) {
    if (!res) return;
    this.clients.delete(res);
  }

  getClientCount(companyId) {
    return [...this.clients].filter(client => !companyId || this.scopes.get(client)?.user.companyId === companyId).length;
  }

  broadcast(type, data) {
    const message = `data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`;
    for (const client of this.clients) {
      const scope = this.scopes.get(client);
      if (!scope || scope.expiresAt <= Date.now()) { client.end(); this.clients.delete(client); continue; }
      if (type !== 'HEARTBEAT') {
        const subject = data?.event || data?.incident || data?.request || data?.user || data?.device || data?.entry || data;
        const subjectId = subject?.userId || (data?.user ? data.user.id : null);
        const owner = subjectId ? db.getUserById(subjectId) : null;
        const companyId = data?.companyId || subject?.companyId || owner?.companyId || (owner ? 'legacy' : null);
        const admin = ['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(scope.user.roleCode);
        if(admin && scope.user.isMainAdmin!==true){
          // Fail closed for broadcasts without an employee subject. Recheck the
          // database on every delivery so reassignment takes effect immediately.
          if(subjectId)prisma.user.count({where:{id:subjectId,deletedAt:null,companyId:scope.user.companyId,assignedAdminId:scope.user.id}}).then(count=>{
            if(count===1&&this.clients.has(client)&&scope.expiresAt>Date.now()&&!client.writableEnded&&!client.destroyed)client.write(message);
          }).catch(()=>{});
          continue;
        }
        if(type==='AUDIT_LOG_ENTRY'&&!admin)continue;
        if(['INCIDENT_CREATED','INCIDENT_UPDATED'].includes(type)&&!admin&&scope.user.roleCode!=='MANAGER')continue;
        if (companyId && companyId !== scope.user.companyId) continue;
        // Unscoped legacy globals are confined to the original single-company admin portal.
        if (!companyId && (!admin || scope.user.companyId !== 'legacy')) continue;
        if (!admin && subjectId !== scope.user.id) {
          if(scope.user.roleCode==='MANAGER'&&subjectId&&companyId===scope.user.companyId){
            // Re-check the current reporting relationship for every message.
            // A cached report list would leak events after reassignment.
            prisma.user.count({where:{id:subjectId,companyId:scope.user.companyId,managerId:scope.user.id}}).then(count=>{
              if(count===1&&this.clients.has(client)&&scope.expiresAt>Date.now()&&!client.writableEnded&&!client.destroyed)client.write(message);
            }).catch(()=>{});
          }
          continue;
        }
      }
      if (!client || client.writableEnded || client.destroyed) {
        this.clients.delete(client);
        continue;
      }
      try {
        client.write(message);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  broadcastActivity(event) {
    this.broadcast('ACTIVITY_EVENT', { event });
  }

  broadcastIncident(incident, isNew = false) {
    this.broadcast(isNew ? 'INCIDENT_CREATED' : 'INCIDENT_UPDATED', { incident });
  }

  broadcastAccessRequest(request, isNew = false) {
    this.broadcast(isNew ? 'ACCESS_REQUEST_CREATED' : 'ACCESS_REQUEST_UPDATED', { request });
  }

  broadcastRiskChange(userId, riskScore, riskLevel, user) {
    this.broadcast('RISK_SCORE_CHANGED', { userId, riskScore, riskLevel, user });
  }

  broadcastTrustChange(userId, trustScore, user) {
    this.broadcast('TRUST_SCORE_CHANGED', { userId, trustScore, user });
  }

  broadcastRiskUpdated(userId, riskScore, riskLevel, prevScore) {
    this.broadcast('RISK_SCORE_CHANGED', { userId, riskScore, riskLevel, prevScore });
  }

  broadcastUserUpdate(user, reason) {
    this.broadcast('USER_UPDATED', { user, reason });
  }

  broadcastAccountStatus(userId, status, user) {
    this.broadcast('ACCOUNT_STATUS_CHANGED', { userId, status, user });
  }

  broadcastAuditLog(log) {
    this.broadcast('AUDIT_LOG_ENTRY', { entry: log });
  }

  broadcastDevice(device) {
    this.broadcast('DEVICE_UPDATED', { device });
  }

  broadcastPolicyUpdate(config) {
    this.broadcast('POLICY_UPDATED', { config });
  }

  broadcastSimulation(scenarioName, payload) {
    this.broadcast('SIMULATION_EVENT', { scenarioName, ...payload });
  }

  broadcastPolicyDecision(data) {
    this.broadcast('POLICY_DECISION', data);
  }

  broadcastContainmentAction(data) {
    this.broadcast('CONTAINMENT_ACTION', data);
  }
}

export const sseManager = new SseManager();

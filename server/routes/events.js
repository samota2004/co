import {userScope} from '../services/security-common.js';
import { Router } from "express";
import { db } from "../models/db.js";
import { sseManager } from "../services/sse.js";
import { requireAuth, getRequesterUser, verifyJwtToken } from '../middleware/auth.js';
import { prisma } from '../models/prisma.js';
import { randomBytes } from 'node:crypto';
import { ActivityRepository } from '../repositories/activity-repository.js';
const activityRepository = new ActivityRepository();
const tickets = new Map();

const router = Router();

// GET /api/events
router.get("/", requireAuth, async (req, res) => {
  try {
    const records = await prisma.activityEvent.findMany({ where: { user: userScope(req.user) }, take: 200, orderBy: { timestamp: 'desc' } });
    return res.json({
      success: true,
      events: records.map(record => db.activityEvents.find(e => e.id === record.eventId) || activityRepository.mapToDomain(record))
    });
  } catch (error) {
    console.error("Events fetch error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "EVENTS_ERROR",
        message: error.message || "Unable to fetch events."
      }
    });
  }
});

// GET /api/events/stream
// EventSource cannot set Authorization. A short-lived, HttpOnly cookie ticket avoids URL tokens.
router.post('/stream-session', requireAuth, (req,res) => {
  for (const [k,v] of tickets) if(v.expiresAt<Date.now()) tickets.delete(k);
  if(tickets.size>10000) return res.status(503).json({error:'Stream capacity reached'});
  const ticket=randomBytes(32).toString('base64url');
  tickets.set(ticket,{authorization:req.headers.authorization,userId:req.user.id,expiresAt:Date.now()+60000});
  res.cookie('orbit_stream',ticket,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:60000,path:'/api/events/stream'});
  res.json({success:true});
});
router.get("/stream", async (req, res) => {
  try {
    const ticket = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('orbit_stream='))?.slice(13);
    const grant = tickets.get(ticket);
    if(!grant || grant.expiresAt<Date.now()) return res.status(401).json({error:'Stream authentication required'});
    tickets.delete(ticket);
    req.headers.authorization=grant.authorization;
    const user=await getRequesterUser(req);
    if(!user || user.id!==grant.userId) return res.status(401).json({error:'Invalid stream identity'});
    const claims=verifyJwtToken(grant.authorization.slice(7));
    sseManager.addClient(res,user,Math.min(Date.now()+300000,claims.exp*1000));

    req.on("close", () => {
      sseManager.removeClient(res);
    });
  } catch (error) {
    console.error("SSE connection error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: {
          code: "SSE_ERROR",
          message: error.message || "Unable to establish event stream."
        }
      });
    }

    res.end();
  }
});

export default router;

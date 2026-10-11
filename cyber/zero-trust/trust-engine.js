import { db } from '../../server/models/db.js';
import { sseManager } from '../../server/services/sse.js';
export function evolveTrust(previous,risk,config={},canRecover=true){
  const score=Number(previous);if(!Number.isFinite(score)||!Number.isFinite(risk))throw new Error('Finite trust/risk required');
  const delta=risk>=90?-Math.min(25,risk/4):risk>=75?-15:risk>=60?-8:risk>=40?-3:risk<20&&canRecover?(config.adaptiveTrustRecoveryRate??1):0;
  return Math.max(0,Math.min(100,Math.round((score+delta)*100)/100));
}

class TrustEngine {
  updateTrustScore(user, evaluation, eventSummary = 'Access Evaluation') {
    if (!user) return 85;

    let currentTrust = user.currentTrustScore ?? user.trustScore ?? 0;
    const riskScore = evaluation.riskScore || 0;

    let trustDelta = 0;
    if (riskScore >= 90) {
      trustDelta = -35;
    } else if (riskScore >= 75) {
      trustDelta = -20;
    } else if (riskScore >= 50) {
      trustDelta = -10;
    } else if (riskScore <= 20) {
      trustDelta = 2; // Incremental trust recovery
    }

    const newTrust = evolveTrust(currentTrust,riskScore,db.policyConfig);
    user.currentTrustScore = newTrust;

    // Persist to in-memory db trust history
    if (db.trustHistories) {
      if (!db.trustHistories[user.id]) {
        db.trustHistories[user.id] = [];
      }
      db.trustHistories[user.id].push({
        timestamp: new Date().toISOString(),
        score: newTrust,
        riskScore,
        reason: eventSummary
      });
      // Keep last 50
      if (db.trustHistories[user.id].length > 50) {
        db.trustHistories[user.id].shift();
      }
    }

    // Broadcast trust change
    sseManager.broadcastTrustChange(user.id, newTrust, user);

    return newTrust;
  }
}

export const trustEngine = new TrustEngine();

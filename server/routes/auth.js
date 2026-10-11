import { Router } from "express";
import crypto from "crypto";
import {requireAuth,requireSecurityAdmin} from '../middleware/auth.js';
import {issueSession,rotateSession,logout} from '../services/session-service.js';
import {api,SecurityError,audit,securityErrorHandler} from '../services/security-common.js';
import bcrypt from 'bcryptjs';
import { prisma } from "../models/prisma.js";

import {
  getRequesterUser
} from "../middleware/auth.js";

import {
  loginWithPassword,
  verifyLoginOtp,
  resendOtp,
  sanitizeUser,
  isAdminUser
} from "../services/auth-service.js";
import {startChallenge} from '../services/auth-service.js';

import {
  sendPasswordResetEmail
} from "../services/email-service.js";

const router = Router();

router.get("/admins", requireSecurityAdmin, async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        roleCode: {
          in: ["SECURITY_ADMIN", "SYSTEM_ADMIN"]
        },
        companyId: req.user.companyId,
        deletedAt: null,
        status: "ACTIVE"
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleCode: true,
        departmentCode: true,
        status: true,
        isMainAdmin: true
      },
      orderBy: {
        name: "asc"
      }
    });

    return res.json({
      success: true,
      admins
    });
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_CREDENTIALS",
          message: "Email and password are required."
        }
      });
    }

    const result = await loginWithPassword(
      email,
      password,
      req
    );
    if(result.success&&!result.requiresMfa)Object.assign(result,await issueSession(result.user,req,res,false,result.deviceId));

    return res.status(result.status).json(result);
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.post("/mfa/verify", async (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_OTP",
          message: "Challenge ID and OTP are required."
        }
      });
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_OTP",
          message: "OTP must contain exactly 6 digits."
        }
      });
    }

    const result = await verifyLoginOtp(
      challengeId,
      String(otp),
      req
    );

    if(result.success)Object.assign(result,await issueSession(result.user,req,res,true));

    return res.status(result.status).json(result);
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.post("/mfa/resend", async (req, res) => {
  try {
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_CHALLENGE",
          message: "Challenge ID is required."
        }
      });
    }

    const result = await resendOtp(challengeId,req);

    return res.status(result.status).json(result);
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_EMAIL",
          message: "Admin email is required."
        }
      });
    }

    const cleanEmail = String(email)
      .trim()
      .toLowerCase();

    const user = await prisma.user.findUnique({
      where: {
        email: cleanEmail
      }
    });

    if (
      !user ||
      !isAdminUser(user) ||
      user.status !== "ACTIVE"
    ) {
      return res.json({
        success: true,
        message:
          "If this email exists, password reset instructions have been sent."
      });
    }

    const token = crypto
      .randomBytes(32)
      .toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null
      }
    });

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(
          Date.now() + 15 * 60 * 1000
        )
      }
    });

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetToken: token
      });

      await audit(prisma,user,'PASSWORD_RESET_REQUESTED',{delivery:'resend-api'});
    } catch (emailError) {
      console.error(JSON.stringify({event:'PASSWORD_RESET_DELIVERY_FAILED',category:emailError.name}));

      return res.status(503).json({
        success: false,
        error: {
          code: "PASSWORD_RESET_EMAIL_FAILED",
          message:
            "Unable to send password reset email. Please try again."
        }
      });
    }

    return res.json({
      success: true,
      message:
        "If this admin email exists, password reset instructions have been sent."
    });
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password, newPassword } = req.body;

    const finalPassword = password || newPassword;

    if (!token || !finalPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_RESET_DATA",
          message: "Reset token and new password are required."
        }
      });
    }

    if (String(finalPassword).length < 12 || String(finalPassword).length > 128) {
      return res.status(400).json({
        success: false,
        error: {
          code: "WEAK_PASSWORD",
          message: "Password must contain 12–128 characters."
        }
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(String(token))
      .digest("hex");

    const resetRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    if (
      !resetRecord ||
      !resetRecord.user ||
      !isAdminUser(resetRecord.user) ||
      resetRecord.user.status !== "ACTIVE"
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_RESET_TOKEN",
          message: "This password reset link is invalid or expired."
        }
      });
    }

    const bcrypt = await import("bcryptjs");

    const hashedPassword = await bcrypt.hash(
      String(finalPassword),
      12
    );

    await prisma.$transaction(async tx=>{
      const consumed=await tx.passwordResetToken.updateMany({where:{id:resetRecord.id,usedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}});
      if(consumed.count!==1)throw new SecurityError(400,'RESET_ALREADY_USED','Password reset link was already used.');
      await tx.user.update({
        where: {
          id: resetRecord.userId
        },
        data: {
          passwordHash: hashedPassword,
          passwordChangedAt: new Date(),authVersion:{increment:1}
        }
      });
      await tx.session.updateMany({where:{userId:resetRecord.userId,revokedAt:null},data:{revokedAt:new Date()}});
    });

    return res.json({
      success: true,
      message: "Password reset successfully. You can now log in."
    });
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.get("/me", async (req, res) => {
  try {
    const user = await getRequesterUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required."
        }
      });
    }

    return res.json({
      success: true,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return securityErrorHandler(error,req,res,()=>{});
  }
});

router.post('/mfa/challenge',requireAuth,api(req=>startChallenge(req.user,req,'STEP_UP')));
router.get('/sessions',requireAuth,api(async req=>({sessions:await prisma.session.findMany({where:{userId:req.user.id,revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true,ip:true,userAgent:true,createdAt:true,expiresAt:true,mfaVerifiedAt:true},orderBy:{createdAt:'desc'},take:100})})));
router.post('/sessions/:id/revoke',requireAuth,api(async req=>{const changed=await prisma.session.updateMany({where:{id:req.params.id,userId:req.user.id,revokedAt:null},data:{revokedAt:new Date()}});if(!changed.count)throw new SecurityError(404,'SESSION_NOT_FOUND','Session not found.');await audit(prisma,req.user,'SESSION_REVOKED');return{message:'Session revoked.'};}));
router.post('/password/change',requireAuth,api(async req=>{
 const {currentPassword,newPassword}=req.body;
 if(typeof currentPassword!=='string'||currentPassword.length>128||typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)throw new SecurityError(400,'INVALID_PASSWORD','Enter the current password and a new password of 12–128 characters.');
 if(!req.user.passwordHash||!await bcrypt.compare(currentPassword,req.user.passwordHash))throw new SecurityError(401,'INCORRECT_PASSWORD','Current password is incorrect.');
 const passwordHash=await bcrypt.hash(newPassword,12);
 await prisma.$transaction(async tx=>{await tx.user.update({where:{id:req.user.id},data:{passwordHash,passwordChangedAt:new Date(),authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:req.user.id,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,req.user,'PASSWORD_CHANGED');});
 return{message:'Password changed. All sessions were invalidated. Sign in again.'};
}));
router.post('/refresh',api((req,res)=>rotateSession(req,res)));
router.post('/logout',requireAuth,api((req,res)=>logout(req,res,req.user)));
export default router;

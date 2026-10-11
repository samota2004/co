/** Mailjet Send API v3.1. Credentials remain on the backend. */
const MAILJET_API_URL = "https://api.mailjet.com/v3.1/send";
const EMAIL_TIMEOUT_MS = 15000;
const validEmail = value => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export class EmailDeliveryError extends Error {
  constructor(code) {
    super('Email delivery is temporarily unavailable. Please try again.');
    this.name = 'EmailDeliveryError';
    this.code = code;
  }
}

function validateEmailConfig() {
  if (!['MAILJET_API_KEY','MAILJET_SECRET_KEY','MAILJET_FROM_EMAIL'].every(key => process.env[key]?.trim()) ||
      !validEmail(process.env.MAILJET_FROM_EMAIL) || /[\r\n]/.test(process.env.MAILJET_FROM_NAME || '')) {
    throw new EmailDeliveryError('EMAIL_CONFIGURATION');
  }
}

async function sendEmail({to, subject, text, html}) {
  validateEmailConfig();
  if (!validEmail(to)) throw new EmailDeliveryError('EMAIL_RECIPIENT');
  let response, result;
  try {
    response = await fetch(MAILJET_API_URL, {
      method: 'POST', redirect: 'error',
      headers: {
        Authorization: 'Basic ' + Buffer.from(process.env.MAILJET_API_KEY + ':' + process.env.MAILJET_SECRET_KEY).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({Messages: [{
        From: {Email: process.env.MAILJET_FROM_EMAIL, Name: process.env.MAILJET_FROM_NAME || 'CyberOrbit Security'},
        To: [{Email: to}], Subject: subject, TextPart: text, HTMLPart: html,
      }]}),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!response.ok) {
      const code = [401,403].includes(response.status) ? 'EMAIL_AUTHENTICATION' : response.status === 429 ? 'EMAIL_RATE_LIMIT' : 'EMAIL_REJECTED';
      throw new EmailDeliveryError(code);
    }
    result = await response.json();
  } catch (error) {
    // Never attach raw provider responses or network errors: they can contain secrets.
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError('EMAIL_NETWORK_OR_RESPONSE');
  }
  const message = result?.Messages?.[0];
  if (result?.Messages?.length !== 1 || message?.Status !== 'success' || message?.Errors?.length ||
      message?.To?.length !== 1 || message.To[0].Email !== to ||
      !(message.To[0].MessageUUID || message.To[0].MessageID)) {
    throw new EmailDeliveryError('EMAIL_MESSAGE_REJECTED');
  }
  // Provider acceptance, not confirmation of inbox delivery. Do not retry an
  // ambiguous timeout automatically, which could send duplicate security emails.
  return true;
}

/**
 * Send login verification OTP.
 *
 * Existing authentication logic controls:
 * - OTP generation
 * - OTP hashing
 * - OTP expiration
 * - Verification attempts
 */
export async function sendOtpEmail({
  to,
  name,
  otp,
  expiryMinutes = 5
}) {
  if (!/^\d{6}$/.test(String(otp))) {
    throw new Error("Invalid OTP format");
  }

  const recipientName = name || "Admin";
  const safeName = escapeHtml(recipientName);
  const safeOtp = escapeHtml(otp);

  const subject = "CyberOrbit Login Verification Code";

  const text = `Hello ${recipientName},

Your CyberOrbit verification code is: ${otp}

This code will expire in ${expiryMinutes} minutes.

If you did not request this code, please ignore this email.

CyberOrbit Security Team`;

  const html = `
    <div style="
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #222;
      max-width: 600px;
      margin: auto;
      padding: 24px;
    ">

      <h2 style="color: #c9a44c;">
        CyberOrbit Login Verification
      </h2>

      <p>Hello ${safeName},</p>

      <p>
        We received a request to sign in
        to your CyberOrbit account.
      </p>

      <p>Your verification code is:</p>

      <div style="
        background: #f4f4f4;
        padding: 20px;
        text-align: center;
        border-radius: 8px;
      ">

        <h1 style="
          letter-spacing: 8px;
          font-size: 32px;
          margin: 0;
          color: #111;
        ">
          ${safeOtp}
        </h1>

      </div>

      <p>
        This code will expire in
        <strong>${expiryMinutes} minutes</strong>.
      </p>

      <p>
        For your security, do not share
        this verification code with anyone.
      </p>

      <p>
        If you did not request this code,
        please ignore this email.
      </p>

      <hr style="
        border: none;
        border-top: 1px solid #ddd;
        margin-top: 24px;
      " />

      <small style="color: #777;">
        CyberOrbit Security Team
      </small>

    </div>
  `;

  return sendEmail({
    to,
    subject,
    text,
    html
  });
}

/**
 * Send password reset email.
 *
 * Reset token creation, hashing, expiry,
 * and verification remain in auth.js.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  resetToken
}) {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    throw new Error(
      "APP_URL is required for password reset emails"
    );
  }

  const parsedUrl = new URL(appUrl);

  if (
    parsedUrl.protocol !== "https:" &&
    !(
      parsedUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedUrl.hostname)
    )
  ) {
    throw new Error(
      "APP_URL must use HTTPS outside localhost"
    );
  }

  const resetUrl = new URL(
    "/reset-password",
    parsedUrl
  );

  resetUrl.searchParams.set(
    "token",
    String(resetToken)
  );

  const resetLink = resetUrl.toString();

  const recipientName = name || "Admin";
  const safeName = escapeHtml(recipientName);
  const safeResetLink = escapeHtml(resetLink);

  const subject = "CyberOrbit Password Reset";

  const text = `Hello ${recipientName},

A password reset was requested for your CyberOrbit account.

Reset your password using this link:

${resetLink}

This link will expire in 15 minutes.

If you did not request this password reset,
please ignore this email.

CyberOrbit Security Team`;

  const html = `
    <div style="
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #222;
      max-width: 600px;
      margin: auto;
      padding: 24px;
    ">

      <h2 style="color: #c9a44c;">
        CyberOrbit Password Reset
      </h2>

      <p>Hello ${safeName},</p>

      <p>
        A password reset was requested
        for your CyberOrbit account.
      </p>

      <p>
        Click the button below to
        reset your password.
      </p>

      <div style="
        text-align: center;
        margin: 30px 0;
      ">

        <a
          href="${safeResetLink}"
          style="
            background: #c9a44c;
            color: #111;
            padding: 14px 24px;
            text-decoration: none;
            display: inline-block;
            border-radius: 6px;
            font-weight: bold;
          "
        >
          Reset Password
        </a>

      </div>

      <p>
        This link will expire in
        <strong>15 minutes</strong>.
      </p>

      <p>
        If the button does not work,
        copy this link into your browser:
      </p>

      <p style="overflow-wrap: anywhere;">
        <a href="${safeResetLink}">
          ${safeResetLink}
        </a>
      </p>

      <p>
        If you did not request this reset,
        please ignore this email.
      </p>

      <hr style="
        border: none;
        border-top: 1px solid #ddd;
        margin-top: 24px;
      " />

      <small style="color: #777;">
        CyberOrbit Security Team
      </small>

    </div>
  `;

  return sendEmail({
    to,
    subject,
    text,
    html
  });
}

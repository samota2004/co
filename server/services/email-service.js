
/**
 * CYBERORBIT - Email Service
 *
 * Provider: Resend HTTPS API
 * Supports:
 * 1. Login OTP verification emails
 * 2. Password reset emails
 *
 * Required environment variables:
 * RESEND_API_KEY
 * RESEND_FROM_EMAIL
 * APP_URL (for password reset)
 */

const RESEND_API_URL = "https://api.resend.com/emails";

const EMAIL_TIMEOUT_MS = 15000;

// Escape dynamic values before inserting into HTML.
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
  );
}

// Validate Resend environment configuration.
function validateEmailConfig() {
  const requiredVariables = [
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL"
  ];

  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing email configuration: ${missingVariables.join(", ")}`
    );
  }
}

// Shared email delivery function.
async function sendEmail({ to, subject, text, html }) {
  validateEmailConfig();

  if (
    typeof to !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)
  ) {
    throw new Error("Invalid recipient email address");
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL;

  let response;

  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        from: `CyberOrbit Security <${fromEmail}>`,
        to: [to],
        subject,
        text,
        html
      }),

      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS)
    });
  } catch (error) {
    // Do not log API keys, OTPs, or reset tokens.
    throw new Error(
      "Email provider connection failed",
      { cause: error }
    );
  }

  if (!response.ok) {
    // Avoid exposing provider responses containing
    // potentially sensitive information.
    throw new Error(
      `Email provider rejected request (HTTP ${response.status})`
    );
  }

  // Resend accepted the email request.
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

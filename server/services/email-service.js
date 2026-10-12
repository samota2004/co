
/**
 * CYBERORBIT Email Service
 * Provider: Mailjet Send API v3.1
 *
 * Environment variables:
 * MAILJET_API_KEY
 * MAILJET_SECRET_KEY
 * MAILJET_FROM_EMAIL
 * MAILJET_FROM_NAME
 * APP_URL
 */

const MAILJET_API_URL = "https://api.mailjet.com/v3.1/send";
const EMAIL_TIMEOUT_MS = 15000;

const validEmail = (value) =>
  typeof value === "string" &&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export class EmailDeliveryError extends Error {
  constructor(code, httpStatus = null) {
    super("Email delivery is temporarily unavailable. Please try again.");
    this.name = "EmailDeliveryError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function validateEmailConfig() {
  const required = [
    "MAILJET_API_KEY",
    "MAILJET_SECRET_KEY",
    "MAILJET_FROM_EMAIL",
  ];

  const missing = required.some(
    (key) => !process.env[key]?.trim()
  );

  if (
    missing ||
    !validEmail(process.env.MAILJET_FROM_EMAIL) ||
    /[\r\n]/.test(process.env.MAILJET_FROM_NAME || "")
  ) {
    throw new EmailDeliveryError("EMAIL_CONFIGURATION");
  }
}

/**
 * Send an email using Mailjet.
 *
 * A successful response means Mailjet accepted the
 * message for processing. It does not guarantee
 * delivery to the recipient's inbox.
 */
async function sendEmail({ to, subject, text, html }) {
  validateEmailConfig();

  if (!validEmail(to)) {
    throw new EmailDeliveryError("EMAIL_RECIPIENT");
  }

  const apiKey = process.env.MAILJET_API_KEY.trim();
  const secretKey = process.env.MAILJET_SECRET_KEY.trim();

  const fromEmail = process.env.MAILJET_FROM_EMAIL.trim();
  const fromName =
    process.env.MAILJET_FROM_NAME?.trim() ||
    "CyberOrbit Security";

  const authorization = Buffer.from(
    `${apiKey}:${secretKey}`
  ).toString("base64");

  const payload = {
    Messages: [
      {
        From: {
          Email: fromEmail,
          Name: fromName,
        },
        To: [
          {
            Email: to,
          },
        ],
        Subject: subject,
        TextPart: text,
        HTMLPart: html,
      },
    ],
  };

  let response;
  let result;

  try {
    response = await fetch(MAILJET_API_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
  } catch {
    throw new EmailDeliveryError(
      "EMAIL_NETWORK_OR_RESPONSE"
    );
  }

  if (!response.ok) {
    let code = "EMAIL_REJECTED";

    if ([401, 403].includes(response.status)) {
      code = "EMAIL_AUTHENTICATION";
    } else if (response.status === 429) {
      code = "EMAIL_RATE_LIMIT";
    }

    throw new EmailDeliveryError(
      code,
      response.status
    );
  }

  try {
    result = await response.json();
  } catch {
    throw new EmailDeliveryError(
      "EMAIL_NETWORK_OR_RESPONSE",
      response.status
    );
  }

  const messages = result?.Messages;
  const message = messages?.[0];

  if (
    !Array.isArray(messages) ||
    messages.length !== 1 ||
    message?.Status !== "success" ||
    (Array.isArray(message?.Errors) && message.Errors.length > 0) ||
    !Array.isArray(message?.To) ||
    message.To.length !== 1 ||
    message.To[0]?.Email !== to ||
    !(
      message.To[0]?.MessageUUID ||
      message.To[0]?.MessageID
    )
  ) {
    throw new EmailDeliveryError(
      "EMAIL_MESSAGE_REJECTED",
      response.status
    );
  }

  return true;
}

/**
 * Send login verification OTP.
 *
 * OTP generation, hashing, expiration, attempts,
 * and verification remain in the authentication service.
 */
export async function sendOtpEmail({
  to,
  name,
  otp,
  expiryMinutes = 5,
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
    html,
  });
}

/**
 * Send password reset email.
 *
 * Reset token creation, hashing, expiration,
 * and verification remain in the auth routes.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  resetToken,
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
      ["localhost", "127.0.0.1"].includes(
        parsedUrl.hostname
      )
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
    html,
  });
}

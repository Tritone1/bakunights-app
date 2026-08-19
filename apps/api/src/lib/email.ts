import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

type VerificationEmail = {
  userEmail: string;
  verificationUrl: string;
};

export async function sendVerificationEmail({ userEmail, verificationUrl }: VerificationEmail) {
  const subject = "Verify your BakuNights account";
  const html = verificationTemplate(verificationUrl);
  const text = `Verify your BakuNights account: ${verificationUrl}`;

  if (isGmailApiConfigured()) {
    await sendWithGmailApi({ to: userEmail, subject, html, text });
    return true;
  }

  if (env.GMAIL_SENDER_EMAIL && env.GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      // Match the working Bagimdan Railway service: keep the hostname so
      // Nodemailer can retry Gmail's complete address set instead of pinning
      // one resolved IP that may not be reachable from this container.
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: { user: env.GMAIL_SENDER_EMAIL, pass: env.GMAIL_APP_PASSWORD.replace(/\s/g, "") },
    });
    await transporter.sendMail({
      from: `BakuNights <${env.GMAIL_SENDER_EMAIL}>`,
      to: userEmail,
      subject,
      html,
      text,
    });
    return true;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("Gmail SMTP is not configured.");
  }

  console.info([
    "",
    "========== BakuNights email verification ==========",
    `To: ${userEmail}`,
    `Subject: ${subject}`,
    `Verification link: ${verificationUrl}`,
    "===================================================",
    "",
  ].join("\n"));
  return false;
}

export function isEmailDeliveryConfigured() {
  return isGmailApiConfigured() || Boolean(env.GMAIL_SENDER_EMAIL && env.GMAIL_APP_PASSWORD);
}

function isGmailApiConfigured() {
  return Boolean(
    env.GMAIL_SENDER_EMAIL
      && env.GMAIL_OAUTH_CLIENT_ID
      && env.GMAIL_OAUTH_CLIENT_SECRET
      && env.GMAIL_OAUTH_REFRESH_TOKEN,
  );
}

async function sendWithGmailApi(message: { to: string; subject: string; html: string; text: string }) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_OAUTH_CLIENT_ID!,
      client_secret: env.GMAIL_OAUTH_CLIENT_SECRET!,
      refresh_token: env.GMAIL_OAUTH_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Gmail OAuth token refresh failed (${tokenResponse.status}).`);
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string };
  if (!tokenPayload.access_token) throw new Error("Gmail OAuth did not return an access token.");

  const raw = Buffer.from(buildMimeMessage(message), "utf8").toString("base64url");
  const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!sendResponse.ok) {
    throw new Error(`Gmail API message send failed (${sendResponse.status}).`);
  }
}

function buildMimeMessage({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const boundary = `bakunights-${randomUUID()}`;
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  return [
    `From: BakuNights <${env.GMAIL_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function verificationTemplate(verificationUrl: string) {
  return `<!doctype html>
  <html><body style="margin:0;background:#09090e;color:#f8fafc;font-family:Inter,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="border:1px solid #2b2b35;border-radius:20px;background:#111119;padding:32px">
        <p style="margin:0 0 22px;font-size:22px;font-weight:800">Baku<span style="color:#f59e0b">Nights</span></p>
        <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:32px">Verify your email</h1>
        <p style="margin:0 0 24px;color:#a7a7b3;line-height:1.6">Confirm your email to finish creating your account. This single-use link expires in 24 hours.</p>
        <a href="${verificationUrl}" style="display:inline-block;border-radius:999px;background:#f59e0b;color:#09090e;padding:13px 22px;font-weight:800;text-decoration:none">Verify email</a>
        <p style="margin:24px 0 0;color:#6f6f7d;font-size:12px;line-height:1.5">If you did not create this account, you can safely ignore this email.</p>
      </div>
    </div>
  </body></html>`;
}

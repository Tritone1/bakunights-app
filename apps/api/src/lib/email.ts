import nodemailer from "nodemailer";
import { env } from "../env.js";

type VerificationEmail = {
  userEmail: string;
  verificationUrl: string;
};

export async function sendVerificationEmail({ userEmail, verificationUrl }: VerificationEmail) {
  const subject = "Verify your BakuNights account";
  const html = verificationTemplate(verificationUrl);
  if (env.GMAIL_SENDER_EMAIL && env.GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
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
      text: `Verify your BakuNights account: ${verificationUrl}`,
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

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { sendVerificationEmail } from "../lib/email.js";
import { persistImageBuffer } from "../lib/image-storage.js";

export const authRouter = Router();
const merchantImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single("venueImage");
const supportedVenueImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());
const optionalLatitude = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(-90).max(90).optional());
const optionalLongitude = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(-180).max(180).optional());
const strongPassword = z.string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.")
  .regex(/[a-z]/, "Password must include at least one lowercase letter.")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter.");
const loginRole = z.enum(["CONSUMER", "MERCHANT", "ADMIN"]);

const rateBuckets = new Map<string, number[]>();

function assertRateLimit(keys: string[], maxAttempts: number, windowMs: number) {
  const now = Date.now();
  for (const key of keys) {
    const recent = (rateBuckets.get(key) ?? []).filter((time) => time > now - windowMs);
    if (recent.length >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000));
      throw new HttpError(429, `Too many attempts. Try again in ${retryAfter} seconds.`, "RATE_LIMITED", { retryAfter });
    }
    recent.push(now);
    rateBuckets.set(key, recent);
  }
}

function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueVerificationToken(user: { id: string; email: string }) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    }),
  ]);
  const verificationUrl = `${env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  const delivered = await sendVerificationEmail({ userEmail: user.email, verificationUrl });
  return { verificationUrl, delivered };
}

authRouter.post("/signup", merchantImageUpload, asyncRoute(async (req, res) => {
  const input = z.object({
    accountType: z.enum(["CONSUMER", "MERCHANT"]),
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
    email: emailSchema,
    password: strongPassword,
    confirmPassword: z.string(),
    venueName: z.string().trim().max(120).optional(),
    venueAddress: z.string().trim().max(240).optional(),
    venueLat: optionalLatitude,
    venueLng: optionalLongitude,
  }).superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({ code: "custom", message: "Passwords do not match.", path: ["confirmPassword"] });
    }
    if (value.accountType === "MERCHANT" && !value.venueName) {
      context.addIssue({ code: "custom", message: "Venue name is required for merchant registration.", path: ["venueName"] });
    }
    if (value.accountType === "MERCHANT" && !value.venueAddress) {
      context.addIssue({ code: "custom", message: "Venue address is required.", path: ["venueAddress"] });
    }
    if (value.accountType === "MERCHANT" && (value.venueLat == null || value.venueLng == null)) {
      context.addIssue({ code: "custom", message: "Choose the venue location or enter its coordinates manually.", path: ["venueLat"] });
    }
  }).parse(req.body);

  if (req.file && !supportedVenueImageTypes.has(req.file.mimetype)) {
    throw new HttpError(400, "Venue image must be a JPG, PNG, or WebP file.", "INVALID_VENUE_IMAGE");
  }
  if (input.accountType !== "MERCHANT" && req.file) {
    throw new HttpError(400, "Venue images are only accepted for merchant registration.", "INVALID_VENUE_IMAGE");
  }

  assertRateLimit([`signup:ip:${clientIp(req)}`, `signup:email:${input.email}`], 5, 15 * 60 * 1000);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "An account with that email already exists.", "EMAIL_EXISTS");

  const storedVenueImageUrl = input.accountType === "MERCHANT" && req.file
    ? await persistImageBuffer(req.file.buffer, req.file.mimetype, "venues")
    : null;

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.accountType,
      merchantVenueName: input.accountType === "MERCHANT" ? input.venueName : null,
      merchantVenueImageUrl: storedVenueImageUrl,
      merchantVenueImage: input.accountType === "MERCHANT" && req.file && !storedVenueImageUrl ? Uint8Array.from(req.file.buffer) : null,
      merchantVenueImageMime: input.accountType === "MERCHANT" && req.file && !storedVenueImageUrl ? req.file.mimetype : null,
      merchantVenueImageName: input.accountType === "MERCHANT" && req.file ? req.file.originalname.slice(0, 180) : null,
      merchantVenueAddress: input.accountType === "MERCHANT" ? input.venueAddress : null,
      merchantVenueLat: input.accountType === "MERCHANT" ? input.venueLat : null,
      merchantVenueLng: input.accountType === "MERCHANT" ? input.venueLng : null,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  let verificationUrl = "";
  let emailDelivered = false;
  try {
    ({ verificationUrl, delivered: emailDelivered } = await issueVerificationToken(user));
  } catch (error) {
    console.error("Verification email delivery failed", error);
    throw new HttpError(502, "Your account was created, but the verification email could not be sent. Use resend verification to try again.", "EMAIL_SEND_FAILED");
  }

  res.status(201).json({
    message: emailDelivered
      ? `Verification email sent to ${user.email}. Check the inbox and spam folder.`
      : "Email delivery is not configured on this local server. Use the development verification link below.",
    sentTo: user.email,
    ...(env.NODE_ENV === "development" ? { devVerificationUrl: verificationUrl } : {}),
  });
}));

authRouter.post("/verify-email", asyncRoute(async (req, res) => {
  const { token } = z.object({ token: z.string().trim().min(32).max(200) }).parse(req.body);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!record) throw new HttpError(404, "This verification link is invalid or has already been used.", "INVALID_VERIFICATION_TOKEN");
  if (record.expiresAt < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } });
    throw new HttpError(410, "This verification link has expired. Request a new email below.", "EXPIRED_VERIFICATION_TOKEN");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId } }),
  ]);
  res.json({ message: "Email verified. You can now log in.", role: record.user.role });
}));

authRouter.post("/resend-verification", asyncRoute(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  assertRateLimit([`resend:ip:${clientIp(req)}`], 10, 15 * 60 * 1000);
  const user = await prisma.user.findUnique({
    where: { email },
    include: { emailVerificationTokens: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!user || user.emailVerifiedAt) {
    res.json({ message: "If an unverified account exists for that email, a new verification message has been sent." });
    return;
  }

  const lastSent = user.emailVerificationTokens[0]?.createdAt.getTime() ?? 0;
  const secondsRemaining = Math.ceil((lastSent + 60_000 - Date.now()) / 1000);
  if (secondsRemaining > 0) {
    throw new HttpError(429, `Please wait ${secondsRemaining} seconds before requesting another email.`, "RATE_LIMITED", { retryAfter: secondsRemaining });
  }

  let verificationUrl = "";
  let emailDelivered = false;
  try {
    ({ verificationUrl, delivered: emailDelivered } = await issueVerificationToken(user));
  } catch (error) {
    console.error("Verification email resend failed", error);
    throw new HttpError(502, "The verification email could not be sent. Please try again in a moment.", "EMAIL_SEND_FAILED");
  }
  res.json({
    message: emailDelivered
      ? `Verification email sent to ${email}. Check the inbox and spam folder.`
      : "Email delivery is not configured on this local server. Use the development verification link below.",
    ...(env.NODE_ENV === "development" ? { devVerificationUrl: verificationUrl } : {}),
  });
}));

authRouter.post("/login", asyncRoute(async (req, res) => {
  const input = z.object({
    email: emailSchema,
    password: z.string().min(8).max(128),
    expectedRole: loginRole.optional(),
  }).parse(req.body);
  assertRateLimit([`login:ip:${clientIp(req)}`, `login:email:${input.email}`], 10, 15 * 60 * 1000);

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  }
  if (!user.emailVerifiedAt) {
    throw new HttpError(403, "Please verify your email before logging in.", "EMAIL_NOT_VERIFIED", { email: user.email });
  }
  if (input.expectedRole && user.role !== input.expectedRole) {
    const destination = user.role === "MERCHANT" ? "merchant" : user.role === "ADMIN" ? "admin" : "customer";
    throw new HttpError(403, `This account belongs on the ${destination} login page.`, "WRONG_ACCOUNT_TYPE", { role: user.role });
  }

  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  await new Promise<void>((resolve, reject) => req.login(safeUser, (error) => error ? reject(error) : resolve()));
  res.json({ user: safeUser });
}));

authRouter.post("/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy(() => res.status(204).end());
  });
});

authRouter.get("/me", (req, res) => {
  res.json({ user: req.user ?? null });
});

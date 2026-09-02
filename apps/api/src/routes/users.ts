import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  homeLat: z.number().min(-90).max(90).nullable(),
  homeLng: z.number().min(-180).max(180).nullable(),
}).refine((value) => (value.homeLat == null) === (value.homeLng == null), {
  message: "Enter both latitude and longitude, or leave both empty.",
  path: ["homeLat"],
});

const POINTS_PER_REWARD = 500;
// Server-side weights total 100: 50 points is 2% and 60 points is 1%.
// A high win also starts a 10-spin per-customer cooldown.
// Keep this order in sync with the client: indexes 7 and 19 are opposite.
const WHEEL_SLICES = [10, 25, 15, 30, 10, 15, 25, 50, 30, 15, 10, 25, 15, 10, 10, 30, 25, 15, 10, 60, 25, 15, 30, 10]
  .map((points) => ({ points, weight: points === 10 || points === 15 ? 5 : points === 25 ? 4 : points === 30 ? 3 : points === 50 ? 2 : 1 }));
const HIGH_REWARD_COOLDOWN_SPINS = 10;
const BAKU_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

function pickWheelSlice(allowHighRewards: boolean) {
  const eligibleSlices = WHEEL_SLICES.map((slice, index) => ({ ...slice, index }))
    .filter((slice) => allowHighRewards || slice.points < 50);
  const totalWeight = eligibleSlices.reduce((sum, slice) => sum + slice.weight, 0);
  let ticket = randomInt(totalWeight);
  for (const slice of eligibleSlices) {
    if (ticket < slice.weight) return slice;
    ticket -= slice.weight;
  }
  return eligibleSlices[eligibleSlices.length - 1]!;
}

function bakuDate(now = new Date()) {
  const shifted = new Date(now.getTime() + BAKU_UTC_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function serializePointReward(reward: { id: string; rewardCode: string; pointsSpent: number; discountPct: number; maxBillAzn: Prisma.Decimal; issuedAt: Date; redeemedAt: Date | null }) {
  return { ...reward, maxBillAzn: Number(reward.maxBillAzn) };
}

async function getPointsStatus(userId: string) {
  const [earned, spent, lastSpin, pendingSpins, activeRewards] = await Promise.all([
    prisma.pointSpin.aggregate({ where: { userId }, _sum: { points: true } }),
    prisma.pointReward.aggregate({ where: { userId }, _sum: { pointsSpent: true } }),
    prisma.pointSpin.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.redemption.count({ where: { userId, redeemedAt: { not: null }, pointSpin: null } }),
    prisma.pointReward.findMany({ where: { userId, redeemedAt: null }, orderBy: { issuedAt: "asc" }, select: { id: true, rewardCode: true, pointsSpent: true, discountPct: true, maxBillAzn: true, issuedAt: true, redeemedAt: true } }),
  ]);
  const lifetimePoints = earned._sum.points ?? 0;
  const pointsBalance = Math.max(0, lifetimePoints - (spent._sum.pointsSpent ?? 0));
  return {
    pointsBalance,
    lifetimePoints,
    pointsToReward: Math.max(0, POINTS_PER_REWARD - pointsBalance),
    rewardThreshold: POINTS_PER_REWARD,
    canSpin: pendingSpins > 0,
    pendingSpins,
    lastSpin: lastSpin ? { points: lastSpin.points, createdAt: lastSpin.createdAt } : null,
    activeRewards: activeRewards.map(serializePointReward),
  };
}

usersRouter.get("/me/profile", asyncRoute(async (req, res) => {
  const profile = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, homeLat: true, homeLng: true, preferencesJson: true, createdAt: true },
  });
  if (!profile) throw new HttpError(404, "Account not found.");
  res.json({ profile });
}));

usersRouter.patch("/me/profile", asyncRoute(async (req, res) => {
  const input = profileUpdateSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id }, data: input,
    select: { id: true, email: true, name: true, role: true, homeLat: true, homeLng: true, createdAt: true },
  });
  res.json({ user });
}));

const newPasswordSchema = z.string().min(8, "Password must be at least 8 characters.").max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.");

usersRouter.patch("/me/password", asyncRoute(async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !await bcrypt.compare(input.currentPassword, user.passwordHash)) throw new HttpError(401, "Current password is incorrect.");
  if (await bcrypt.compare(input.newPassword, user.passwordHash)) throw new HttpError(400, "Choose a password you have not already used here.");
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } });
  res.status(204).end();
}));

usersRouter.patch("/me/location", asyncRoute(async (req, res) => {
  const input = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id }, data: { homeLat: input.lat, homeLng: input.lng },
    select: { id: true, email: true, name: true, role: true, homeLat: true, homeLng: true },
  });
  res.json({ user });
}));

const preferencesSchema = z.object({
  radius: z.number().min(1).max(100),
  cuisine: z.string().max(60),
  minDiscount: z.number().min(0).max(100),
  dietary: z.string().max(30),
  endingSoon: z.boolean(),
  sort: z.enum(["distance", "discount", "ending", "rating"]),
});

usersRouter.get("/me/preferences", asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { preferencesJson: true } });
  res.json({ preferences: user?.preferencesJson ?? null });
}));

usersRouter.put("/me/preferences", asyncRoute(async (req, res) => {
  const preferences = preferencesSchema.parse(req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { preferencesJson: preferences } });
  res.json({ preferences });
}));

usersRouter.get("/me/saved", asyncRoute(async (req, res) => {
  const rows = await prisma.savedDeal.findMany({
    where: { userId: req.user!.id },
    orderBy: { savedAt: "desc" },
    include: { deal: { include: { restaurant: true, ratings: { select: { value: true } } } } },
  });
  res.json({ deals: rows.map(({ deal, savedAt }) => ({
    ...deal,
    savedAt,
    dealRating: deal.ratings.length
      ? deal.ratings.reduce((sum, rating) => sum + rating.value, 0) / deal.ratings.length : null,
    ratings: undefined,
  })) });
}));

usersRouter.get("/me/redemptions", asyncRoute(async (req, res) => {
  const redemptions = await prisma.redemption.findMany({
    where: { userId: req.user!.id }, orderBy: { claimedAt: "desc" },
    include: { deal: { include: { restaurant: true } } },
  });
  res.json({ redemptions });
}));

usersRouter.get("/me/points", asyncRoute(async (req, res) => {
  if (req.user!.role !== "CONSUMER") throw new HttpError(403, "Visit points are available to customer accounts.");
  res.json({ status: await getPointsStatus(req.user!.id) });
}));

usersRouter.post("/me/points/spin", asyncRoute(async (req, res) => {
  if (req.user!.role !== "CONSUMER") throw new HttpError(403, "Visit points are available to customer accounts.");
  const userId = req.user!.id;
  let wheelIndex = 0;
  let pointsEarned = 0;
  let rewardUnlocked: { id: string; rewardCode: string; pointsSpent: number; discountPct: number; maxBillAzn: Prisma.Decimal; issuedAt: Date; redeemedAt: Date | null } | null = null;

  try {
    rewardUnlocked = await prisma.$transaction(async (tx) => {
      const eligibleVisit = await tx.redemption.findFirst({
        where: { userId, redeemedAt: { not: null }, pointSpin: null },
        orderBy: { redeemedAt: "asc" },
        select: { id: true },
      });
      if (!eligibleVisit) throw new HttpError(403, "Visit a participating venue and ask the merchant to verify your app QR code before you spin.", "VERIFIED_VISIT_REQUIRED");
      const recentSpins = await tx.pointSpin.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: HIGH_REWARD_COOLDOWN_SPINS,
        select: { points: true },
      });
      const outcome = pickWheelSlice(!recentSpins.some((spin) => spin.points >= 50));
      wheelIndex = outcome.index;
      pointsEarned = outcome.points;
      await tx.pointSpin.create({ data: { userId, redemptionId: eligibleVisit.id, spinDate: bakuDate(), points: pointsEarned } });
      const [earned, spent] = await Promise.all([
        tx.pointSpin.aggregate({ where: { userId }, _sum: { points: true } }),
        tx.pointReward.aggregate({ where: { userId }, _sum: { pointsSpent: true } }),
      ]);
      const balance = (earned._sum.points ?? 0) - (spent._sum.pointsSpent ?? 0);
      if (balance < POINTS_PER_REWARD) return null;
      return tx.pointReward.create({
        data: { userId, rewardCode: `PTS-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}` },
        select: { id: true, rewardCode: true, pointsSpent: true, discountPct: true, maxBillAzn: true, issuedAt: true, redeemedAt: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      throw new HttpError(409, "That verified visit has already been used for a spin. Verify another in-store visit to spin again.", "VISIT_SPIN_USED");
    }
    throw error;
  }

  res.status(201).json({ wheelIndex, pointsEarned, rewardUnlocked: rewardUnlocked ? serializePointReward(rewardUnlocked) : null, status: await getPointsStatus(userId) });
}));

usersRouter.delete("/me", asyncRoute(async (req, res) => {
  const { password, deleteOwnedVenues } = z.object({
    password: z.string().min(1).max(128),
    deleteOwnedVenues: z.boolean().default(false),
  }).parse(req.body);
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, passwordHash: true, ownedRestaurants: { select: { id: true } } },
  });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Password is incorrect.");
  }
  if (user.ownedRestaurants.length > 0 && !deleteOwnedVenues) {
    throw new HttpError(409, "This account owns a venue. Confirm that its venues and business data should also be deleted.");
  }

  await prisma.$transaction([
    ...(deleteOwnedVenues ? [prisma.restaurant.deleteMany({ where: { ownerUserId: user.id } })] : []),
    prisma.savedDeal.deleteMany({ where: { userId: user.id } }),
    prisma.follow.deleteMany({ where: { userId: user.id } }),
    prisma.pushSubscription.deleteMany({ where: { userId: user.id } }),
    prisma.notificationLog.deleteMany({ where: { userId: user.id } }),
    prisma.pointReward.deleteMany({ where: { userId: user.id } }),
    prisma.pointSpin.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.venueClaimRequest.deleteMany({ where: { requestingUserId: user.id } }),
    prisma.merchantEnrollmentRequest.deleteMany({ where: { requestingUserId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        email: `deleted+${user.id}@deleted.bakunights.invalid`,
        name: "Deleted user",
        passwordHash: null,
        emailVerifiedAt: null,
        homeLat: null,
        homeLng: null,
        preferencesJson: Prisma.JsonNull,
        merchantVenueName: null,
        merchantVenueImage: null,
        merchantVenueImageMime: null,
        merchantVenueImageName: null,
        merchantVenueImageUrl: null,
        merchantVenueAddress: null,
        merchantVenueLat: null,
        merchantVenueLng: null,
      },
    }),
  ]);

  await new Promise<void>((resolve, reject) => {
    req.logout((logoutError) => {
      if (logoutError) return reject(logoutError);
      req.session.destroy((sessionError) => sessionError ? reject(sessionError) : resolve());
    });
  });
  res.status(204).end();
}));

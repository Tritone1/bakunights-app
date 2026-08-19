import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

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

usersRouter.delete("/me", asyncRoute(async (req, res) => {
  const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, passwordHash: true, ownedRestaurants: { where: { isActive: true }, select: { id: true } } },
  });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Password is incorrect.");
  }
  if (user.ownedRestaurants.length > 0) {
    throw new HttpError(409, "Deactivate or transfer your active venue before deleting this account.");
  }

  await prisma.$transaction([
    prisma.savedDeal.deleteMany({ where: { userId: user.id } }),
    prisma.follow.deleteMany({ where: { userId: user.id } }),
    prisma.pushSubscription.deleteMany({ where: { userId: user.id } }),
    prisma.notificationLog.deleteMany({ where: { userId: user.id } }),
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

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { milesBetween } from "../lib/distance.js";
import { requireAuth } from "../middleware/auth.js";
import QRCode from "qrcode";
import type { Prisma } from "@prisma/client";
import { recomputeVenueTrust } from "../lib/trust.js";

export const dealsRouter = Router();

const feedQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(1).max(100).default(10),
  cuisine: z.string().optional(),
  minDiscount: z.coerce.number().min(0).max(100).default(0),
  dietary: z.string().optional(),
  endingSoon: z.enum(["true", "false"]).optional(),
  all: z.enum(["true", "false"]).optional(),
  sort: z.enum(["distance", "discount", "ending", "rating"]).default("distance"),
});

const include = {
  restaurant: true,
  ratings: { select: { value: true } },
  _count: { select: { savedBy: true, redemptions: true } },
  scopeCategory: true,
  offerMenuItems: { include: { menuItem: { include: { category: true } } } },
} as const;

type IncludedDeal = Prisma.DealGetPayload<{ include: typeof include }>;

function serializeDeal(deal: IncludedDeal, lat?: number, lng?: number) {
  const { ratings: ratingValues, ...rest } = deal;
  const dealRating = ratingValues.length
    ? ratingValues.reduce((sum, item) => sum + item.value, 0) / ratingValues.length
    : null;
  return {
    ...rest,
    dealRating,
    ratingCount: ratingValues.length,
    distanceMiles: lat !== undefined && lng !== undefined
      ? milesBetween(lat, lng, deal.restaurant.lat, deal.restaurant.lng)
      : null,
  };
}

dealsRouter.get("/", asyncRoute(async (req, res) => {
  const query = feedQuery.parse(req.query);
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: {
      isActive: true,
      status: "approved",
      startsAt: { lte: now },
      discountPct: query.minDiscount > 0 ? { gte: query.minDiscount } : undefined,
      restaurant: {
        isActive: true,
        cuisine: query.cuisine ? { equals: query.cuisine, mode: "insensitive" } : undefined,
      },
      dietaryTags: query.dietary ? { has: query.dietary } : undefined,
      endsAt: query.endingSoon ? { gt: now, lte: new Date(now.getTime() + 3 * 60 * 60 * 1000) } : { gt: now },
    },
    include,
    take: 250,
  });

  const visible = deals
    .map((deal) => serializeDeal(deal, query.lat, query.lng))
    .filter((deal) => query.all === "true" || (deal.distanceMiles ?? Infinity) <= query.radius);

  visible.sort((a, b) => {
    if (query.sort === "discount") return (b.discountPct ?? 0) - (a.discountPct ?? 0);
    if (query.sort === "ending") return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
    if (query.sort === "rating") return b.restaurant.rating - a.restaurant.rating;
    return (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
  });

  const cuisines = await prisma.restaurant.findMany({
    where: { isActive: true }, distinct: ["cuisine"], select: { cuisine: true }, orderBy: { cuisine: "asc" },
  });
  res.json({ deals: visible, cuisines: cuisines.map((item) => item.cuisine) });
}));

dealsRouter.get("/:id", asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include });
  if (!deal || deal.status !== "approved" || !deal.isActive || deal.endsAt <= new Date()) throw new HttpError(404, "Offer not found.");
  await prisma.dealView.create({ data: { dealId: deal.id, sessionId: req.sessionID } });
  const saved = req.user ? Boolean(await prisma.savedDeal.findUnique({
    where: { userId_dealId: { userId: req.user.id, dealId: deal.id } },
  })) : false;
  const followed = req.user ? Boolean(await prisma.follow.findUnique({
    where: { userId_restaurantId: { userId: req.user.id, restaurantId: deal.restaurantId } },
  })) : false;
  const redemption = req.user ? await prisma.redemption.findUnique({
    where: { userId_dealId: { userId: req.user.id, dealId: deal.id } },
    include: { feedback: true },
  }) : null;
  const redemptionWithQr = redemption ? { ...redemption, qrDataUrl: await QRCode.toDataURL(redemption.redemptionCode, { width: 320, margin: 2 }) } : null;
  res.json({ deal: serializeDeal(deal), saved, followed, redemption: redemptionWithQr });
}));

dealsRouter.put("/:id/save", requireAuth, asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  await prisma.savedDeal.upsert({
    where: { userId_dealId: { userId: req.user!.id, dealId } },
    create: { userId: req.user!.id, dealId }, update: {},
  });
  res.status(204).end();
}));

dealsRouter.delete("/:id/save", requireAuth, asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  await prisma.savedDeal.deleteMany({ where: { userId: req.user!.id, dealId } });
  res.status(204).end();
}));

dealsRouter.post("/:id/claim", requireAuth, asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal || deal.status !== "approved" || !deal.isActive || deal.endsAt <= new Date()) throw new HttpError(410, "This offer is no longer available.");
  const redemption = await prisma.redemption.upsert({
    where: { userId_dealId: { userId: req.user!.id, dealId: deal.id } },
    update: {},
    create: {
      userId: req.user!.id,
      dealId: deal.id,
      redemptionCode: `GS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    },
  });
  const qrDataUrl = await QRCode.toDataURL(redemption.redemptionCode, { width: 320, margin: 2 });
  res.status(201).json({ redemption: { ...redemption, qrDataUrl } });
}));

dealsRouter.post("/:id/feedback", requireAuth, asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const input = z.object({ wasHonored: z.boolean(), comment: z.string().trim().max(500).nullable().optional() }).parse(req.body);
  const redemption = await prisma.redemption.findUnique({
    where: { userId_dealId: { userId: req.user!.id, dealId } },
    include: { deal: { select: { restaurantId: true } } },
  });
  if (!redemption?.redeemedAt) throw new HttpError(403, "Feedback becomes available after the venue verifies your QR/code.");
  const feedback = await prisma.redemptionFeedback.upsert({
    where: { redemptionId: redemption.id },
    create: { redemptionId: redemption.id, wasHonored: input.wasHonored, comment: input.wasHonored ? null : input.comment || null },
    update: { wasHonored: input.wasHonored, comment: input.wasHonored ? null : input.comment || null },
  });
  await recomputeVenueTrust(redemption.deal.restaurantId);
  res.json({ feedback });
}));

dealsRouter.post("/:id/feedback/skip", requireAuth, asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const redemption = await prisma.redemption.findUnique({ where: { userId_dealId: { userId: req.user!.id, dealId } } });
  if (!redemption?.redeemedAt) throw new HttpError(403, "There is no completed redemption to dismiss.");
  await prisma.redemption.update({ where: { id: redemption.id }, data: { feedbackSkippedAt: new Date() } });
  res.status(204).end();
}));

dealsRouter.put("/:id/rating", requireAuth, asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const input = z.object({ value: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }).parse(req.body);
  const hasClaimed = await prisma.redemption.findUnique({
    where: { userId_dealId: { userId: req.user!.id, dealId } },
  });
  if (!hasClaimed) throw new HttpError(403, "Claim this offer before rating it.");
  const rating = await prisma.dealRating.upsert({
    where: { userId_dealId: { userId: req.user!.id, dealId } },
    create: { ...input, userId: req.user!.id, dealId },
    update: input,
  });
  res.json({ rating });
}));

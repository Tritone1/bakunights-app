import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../env.js";

export const restaurantsRouter = Router();
const googleReviewsCache = new Map<string, { expiresAt: number; payload: GoogleReviewsResponse }>();
const GOOGLE_REVIEWS_CACHE_MS = 12 * 60 * 60 * 1000;

type GoogleReview = { reviewerName: string; rating: number; relativeTime: string; text: string };
type GoogleReviewsResponse = { available: true; rating: number | null; reviewCount: number | null; reviews: GoogleReview[] };

function assertGooglePlacesConfigured() {
  if (!env.GOOGLE_MAPS_SERVER_API_KEY) throw new HttpError(503, "Google reviews are not configured yet.");
}

function serializeLiveDeal(deal: any) {
  const { ratings, ...rest } = deal;
  return {
    ...rest,
    dealRating: ratings.length ? ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) / ratings.length : null,
    ratingCount: ratings.length,
  };
}

restaurantsRouter.get("/stats/home", asyncRoute(async (_req, res) => {
  const now = new Date();
  const [activeVenues, liveDeals, venueAddresses] = await Promise.all([
    prisma.restaurant.count({ where: { isActive: true } }),
    prisma.deal.count({ where: { isActive: true, status: "approved", startsAt: { lte: now }, endsAt: { gt: now }, restaurant: { isActive: true } } }),
    prisma.restaurant.findMany({ where: { isActive: true }, select: { address: true } }),
  ]);
  const areas = new Set(venueAddresses.map(({ address }) => {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    return [...parts].reverse().find((part) => !/^baku$/i.test(part))?.toLowerCase() || address.trim().toLowerCase();
  }).filter(Boolean)).size;
  res.json({ stats: { activeVenues, liveDeals, areas } });
}));

restaurantsRouter.get("/:id/photo", asyncRoute(async (req, res) => {
  const restaurantId = z.string().parse(req.params.id);
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { owner: { select: { merchantVenueImage: true, merchantVenueImageMime: true } } },
  });
  if (!restaurant?.owner?.merchantVenueImage || !restaurant.owner.merchantVenueImageMime) throw new HttpError(404, "Venue image not found.");
  res.setHeader("Content-Type", restaurant.owner.merchantVenueImageMime);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(Buffer.from(restaurant.owner.merchantVenueImage));
}));

restaurantsRouter.get("/:id/reviews", asyncRoute(async (req, res) => {
  const restaurantId = z.string().parse(req.params.id);
  const restaurant = await prisma.restaurant.findFirst({ where: { id: restaurantId, isActive: true }, select: { googlePlaceId: true } });
  if (!restaurant) throw new HttpError(404, "Venue not found.");
  if (!restaurant.googlePlaceId) return res.json({ available: false, reason: "not_linked" });
  assertGooglePlacesConfigured();

  const cached = googleReviewsCache.get(restaurant.googlePlaceId);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);

  const placeId = encodeURIComponent(restaurant.googlePlaceId);
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_API_KEY!,
      "X-Goog-FieldMask": "rating,userRatingCount,reviews.rating,reviews.relativePublishTimeDescription,reviews.text.text,reviews.authorAttribution.displayName",
    },
  });
  if (!response.ok) throw new HttpError(502, "Google reviews are temporarily unavailable.");
  const data = await response.json() as {
    rating?: number;
    userRatingCount?: number;
    reviews?: Array<{ rating?: number; relativePublishTimeDescription?: string; text?: { text?: string }; authorAttribution?: { displayName?: string } }>;
  };
  const payload: GoogleReviewsResponse = {
    available: true,
    rating: data.rating ?? null,
    reviewCount: data.userRatingCount ?? null,
    reviews: (data.reviews ?? []).map((review) => ({
      reviewerName: review.authorAttribution?.displayName || "Google user",
      rating: review.rating ?? 0,
      relativeTime: review.relativePublishTimeDescription || "",
      text: review.text?.text || "",
    })),
  };
  googleReviewsCache.set(restaurant.googlePlaceId, { expiresAt: Date.now() + GOOGLE_REVIEWS_CACHE_MS, payload });
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(payload);
}));

restaurantsRouter.get("/", asyncRoute(async (req, res) => {
  const { query } = z.object({ query: z.string().trim().max(100).default("") }).parse(req.query);
  const now = new Date();
  const restaurants = await prisma.restaurant.findMany({
    where: {
      isActive: true,
      ...(query ? { OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { address: { contains: query, mode: "insensitive" as const } },
        { cuisine: { contains: query, mode: "insensitive" as const } },
      ] } : {}),
    },
    select: {
      id: true, name: true, address: true, cuisine: true, dietaryTags: true,
      lat: true, lng: true, phone: true, photoUrl: true, rating: true,
      isVerifiedTrusted: true, honestyRate: true,
      deals: {
        where: { isActive: true, status: "approved", startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: { endsAt: "asc" },
        take: 1,
        include: { ratings: { select: { value: true } } },
      },
    },
    orderBy: [{ rating: "desc" }, { name: "asc" }],
    take: 100,
  });
  res.json({ restaurants: restaurants.map(({ deals, ...restaurant }) => {
    const deal = deals[0];
    return {
      ...restaurant,
      liveDeal: deal ? {
        ...deal,
        dealRating: deal.ratings.length ? deal.ratings.reduce((sum, rating) => sum + rating.value, 0) / deal.ratings.length : null,
        ratingCount: deal.ratings.length,
        ratings: undefined,
      } : null,
    };
  }) });
}));

restaurantsRouter.get("/:id", asyncRoute(async (req, res) => {
  const restaurantId = z.string().parse(req.params.id);
  const now = new Date();
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, isActive: true },
    select: {
      id: true,
      name: true,
      cuisine: true,
      dietaryTags: true,
      address: true,
      lat: true,
      lng: true,
      phone: true,
      hoursJson: true,
      photoUrl: true,
      rating: true,
      isVerifiedTrusted: true,
      honestyRate: true,
      menuItems: {
        where: { isActive: true },
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        include: { category: true },
      },
      deals: {
        where: { isActive: true, status: "approved", startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: { endsAt: "asc" },
        include: {
          restaurant: true,
          ratings: { select: { value: true } },
          _count: { select: { savedBy: true, redemptions: true } },
          scopeCategory: true,
          offerMenuItems: { include: { menuItem: { include: { category: true } } } },
        },
      },
    },
  });
  if (!restaurant) throw new HttpError(404, "Venue not found.");
  const { menuItems, deals, ...publicRestaurant } = restaurant;
  const categories = [...new Map(menuItems.map((item) => [item.categoryId, item.category])).values()]
    .map((category) => ({ ...category, items: menuItems.filter((item) => item.categoryId === category.id).map(({ category: _category, ...item }) => item) }));
  const dealIds = deals.map((deal) => deal.id);
  const [followed, savedRows] = req.user ? await Promise.all([
    prisma.follow.findUnique({ where: { userId_restaurantId: { userId: req.user.id, restaurantId } } }),
    prisma.savedDeal.findMany({ where: { userId: req.user.id, dealId: { in: dealIds } }, select: { dealId: true } }),
  ]) : [null, []];
  res.json({
    restaurant: { ...publicRestaurant, menuCategories: categories, deals: deals.map(serializeLiveDeal) },
    followed: Boolean(followed),
    savedDealIds: savedRows.map((row) => row.dealId),
  });
}));

restaurantsRouter.put("/:id/follow", requireAuth, asyncRoute(async (req, res) => {
  const restaurantId = z.string().parse(req.params.id);
  await prisma.follow.upsert({
    where: { userId_restaurantId: { userId: req.user!.id, restaurantId } },
    create: { userId: req.user!.id, restaurantId }, update: {},
  });
  res.status(204).end();
}));

restaurantsRouter.delete("/:id/follow", requireAuth, asyncRoute(async (req, res) => {
  const restaurantId = z.string().parse(req.params.id);
  await prisma.follow.deleteMany({ where: { userId: req.user!.id, restaurantId } });
  res.status(204).end();
}));

restaurantsRouter.post("/:id/claim", requireAuth, asyncRoute(async (req, res) => {
  const restaurantId = z.string().parse(req.params.id);
  const input = z.object({
    contactPhone: z.string().trim().min(5).max(40),
    contactEmail: z.string().trim().email(),
    proofNotes: z.string().trim().min(20).max(2000),
  }).parse(req.body);
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new HttpError(404, "Restaurant not found.");
  if (restaurant.ownerUserId) throw new HttpError(409, "This listing has already been claimed.");
  const claim = await prisma.venueClaimRequest.upsert({
    where: { requestingUserId_venueId: { requestingUserId: req.user!.id, venueId: restaurant.id } },
    create: { requestingUserId: req.user!.id, venueId: restaurant.id, ...input },
    update: { ...input, status: "pending", reviewedAt: null },
  });
  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { claimStatus: "pending_verification" } });
  res.status(201).json({ claim });
}));

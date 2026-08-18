import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";

export const restaurantsRouter = Router();

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

restaurantsRouter.get("/", asyncRoute(async (req, res) => {
  const { query } = z.object({ query: z.string().trim().max(100).default("") }).parse(req.query);
  const restaurants = await prisma.restaurant.findMany({
    where: query ? { OR: [
      { name: { contains: query, mode: "insensitive" } },
      { address: { contains: query, mode: "insensitive" } },
    ] } : undefined,
    select: { id: true, name: true, address: true, cuisine: true, ownerUserId: true, claimStatus: true },
    take: 20,
  });
  res.json({ restaurants });
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

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth, requireMerchant } from "../middleware/auth.js";
import multer from "multer";
import { env } from "../env.js";
import { persistImage } from "../lib/image-storage.js";

export const merchantRouter = Router();
const menuUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const imageValue = z.string().trim().max(3_000_000).refine((value) => /^https?:\/\//i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value), "Use an image URL or uploaded JPG, PNG, or WebP image");

const enrollmentInput = z.object({
  venueName: z.string().trim().min(2).max(120),
  venueAddress: z.string().trim().min(5).max(240),
  venueLat: z.coerce.number().min(-90).max(90),
  venueLng: z.coerce.number().min(-180).max(180),
  contactPhone: z.string().trim().min(5).max(40),
  contactEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  proofNotes: z.string().trim().min(20).max(2000),
});

merchantRouter.get("/enrollment", requireAuth, asyncRoute(async (req, res) => {
  const enrollment = await prisma.merchantEnrollmentRequest.findUnique({
    where: { requestingUserId: req.user!.id },
  });
  res.json({ enrollment });
}));

merchantRouter.post("/enroll", requireAuth, asyncRoute(async (req, res) => {
  if (req.user!.role !== "CONSUMER") throw new HttpError(409, "Only customer accounts can apply for merchant access.");
  const input = enrollmentInput.parse(req.body);
  const enrollment = await prisma.merchantEnrollmentRequest.upsert({
    where: { requestingUserId: req.user!.id },
    create: { requestingUserId: req.user!.id, ...input },
    update: { ...input, status: "pending", reviewNotes: null, reviewedAt: null },
  });
  res.status(201).json({ enrollment });
}));

merchantRouter.use(requireMerchant);

const dealInput = z.object({
  restaurantId: z.string().min(1),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(1000),
  menuItem: z.string().trim().min(2).max(120).nullable().optional(),
  offerType: z.enum(["discount", "combo", "set_menu", "perk", "event", "bundle", "other"]).default("discount"),
  discountPct: z.number().int().min(1).max(100).nullable().optional(),
  tag: z.enum(["breakfast", "lunch", "dinner", "happy hour", "all day"]),
  dietaryTags: z.array(z.string().max(30)).max(10).default([]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().max(200).nullable().optional(),
  scope: z.enum(["WHOLE_MENU", "CATEGORY", "SPECIFIC_ITEMS"]).default("WHOLE_MENU"),
  scopeCategoryId: z.string().nullable().optional(),
  menuItemIds: z.array(z.string()).max(100).default([]),
  menuItemOverrides: z.record(z.string(), z.coerce.number().positive().max(100000)).default({}),
  photoUrl: imageValue.nullable().optional(),
})
  .refine((value) => value.endsAt > value.startsAt, { message: "End time must be after start time", path: ["endsAt"] })
  .refine((value) => value.offerType !== "discount" || value.discountPct != null, { message: "Discount-type offers need a percentage", path: ["discountPct"] })
  .refine((value) => value.scope !== "CATEGORY" || Boolean(value.scopeCategoryId), { message: "Choose a menu category", path: ["scopeCategoryId"] })
  .refine((value) => value.scope !== "SPECIFIC_ITEMS" || value.menuItemIds.length > 0, { message: "Choose at least one menu item", path: ["menuItemIds"] });

const menuItemInput = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  priceAzn: z.coerce.number().positive().max(100000),
  description: z.string().trim().max(600).nullable().optional(),
  photoUrl: imageValue.nullable().optional(),
  isActive: z.boolean().default(true),
});

async function assertOwner(userId: string, restaurantId: string) {
  const restaurant = await prisma.restaurant.findFirst({ where: { id: restaurantId, ownerUserId: userId, claimStatus: "verified" } });
  if (!restaurant) throw new HttpError(403, "You do not manage this restaurant.");
  return restaurant;
}

async function assertOfferScope(restaurantId: string, input: { scope: "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS"; scopeCategoryId?: string | null; menuItemIds: string[] }) {
  if (input.scope === "CATEGORY") {
    const count = await prisma.menuItem.count({ where: { venueId: restaurantId, categoryId: input.scopeCategoryId!, isActive: true } });
    if (!count) throw new HttpError(400, "That category has no active items at this venue.", "INVALID_OFFER_SCOPE");
  }
  if (input.scope === "SPECIFIC_ITEMS") {
    const uniqueIds = [...new Set(input.menuItemIds)];
    const count = await prisma.menuItem.count({ where: { id: { in: uniqueIds }, venueId: restaurantId, isActive: true } });
    if (count !== uniqueIds.length) throw new HttpError(400, "One or more selected menu items are unavailable.", "INVALID_OFFER_SCOPE");
  }
}

async function assertOfferPhoto(restaurantId: string, input: { photoUrl?: string | null; scope: "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS"; scopeCategoryId?: string | null; menuItemIds: string[] }) {
  if (input.photoUrl) return input.photoUrl;
  const itemWithPhoto = await prisma.menuItem.findFirst({
    where: {
      venueId: restaurantId,
      isActive: true,
      photoUrl: { not: null },
      categoryId: input.scope === "CATEGORY" ? input.scopeCategoryId! : undefined,
      id: input.scope === "SPECIFIC_ITEMS" ? { in: input.menuItemIds } : undefined,
    },
    select: { photoUrl: true },
  });
  if (!itemWithPhoto) throw new HttpError(400, "Add an offer photo or select a covered menu item with a photo. Offers with a photo get significantly more views and trust from customers.", "OFFER_PHOTO_REQUIRED");
  return itemWithPhoto.photoUrl!;
}

merchantRouter.get("/menu/categories", asyncRoute(async (_req, res) => {
  const categories = await prisma.menuCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  res.json({ categories });
}));

merchantRouter.get("/menu/catalog", asyncRoute(async (req, res) => {
  const query = z.object({ q: z.string().trim().max(80).default("") }).parse(req.query);
  const items = await prisma.catalogItem.findMany({
    where: { isActive: true, name: query.q ? { contains: query.q, mode: "insensitive" } : undefined },
    include: { category: true }, orderBy: { name: "asc" }, take: 30,
  });
  res.json({ items });
}));

merchantRouter.post("/venues/:venueId/menu/from-catalog", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const input = z.object({ catalogItemId: z.string().min(1), priceAzn: z.coerce.number().positive().max(100000) }).parse(req.body);
  const catalogItem = await prisma.catalogItem.findFirst({ where: { id: input.catalogItemId, isActive: true } });
  if (!catalogItem) throw new HttpError(404, "Catalog item not found.");
  const item = await prisma.menuItem.create({ data: { venueId, categoryId: catalogItem.categoryId, name: catalogItem.name, priceAzn: input.priceAzn, photoUrl: catalogItem.photoUrl } });
  res.status(201).json({ item: { ...item, priceAzn: Number(item.priceAzn) } });
}));

merchantRouter.get("/venues/:venueId/menu", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const items = await prisma.menuItem.findMany({ where: { venueId }, include: { category: true }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] });
  res.json({ items: items.map((item) => ({ ...item, priceAzn: Number(item.priceAzn) })) });
}));

merchantRouter.post("/venues/:venueId/menu", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const input = menuItemInput.parse(req.body);
  const category = await prisma.menuCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new HttpError(400, "Menu category not found.");
  const item = await prisma.menuItem.create({ data: { ...input, photoUrl: await persistImage(input.photoUrl, "menu-items"), venueId } });
  res.status(201).json({ item: { ...item, priceAzn: Number(item.priceAzn) } });
}));

merchantRouter.patch("/menu/items/:id", asyncRoute(async (req, res) => {
  const id = z.string().parse(req.params.id);
  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Menu item not found.");
  await assertOwner(req.user!.id, existing.venueId);
  const input = menuItemInput.partial().parse(req.body);
  if (input.categoryId && !await prisma.menuCategory.findUnique({ where: { id: input.categoryId } })) throw new HttpError(400, "Menu category not found.");
  const item = await prisma.menuItem.update({ where: { id }, data: { ...input, photoUrl: input.photoUrl === undefined ? undefined : await persistImage(input.photoUrl, "menu-items") } });
  res.json({ item: { ...item, priceAzn: Number(item.priceAzn) } });
}));

merchantRouter.post("/venues/:venueId/menu/bulk", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const { items } = z.object({ items: z.array(menuItemInput).min(1).max(200) }).parse(req.body);
  const categoryIds = [...new Set(items.map((item) => item.categoryId))];
  if (await prisma.menuCategory.count({ where: { id: { in: categoryIds } } }) !== categoryIds.length) throw new HttpError(400, "One or more menu categories are invalid.");
  const storedItems = await Promise.all(items.map(async (item) => ({ ...item, photoUrl: await persistImage(item.photoUrl, "menu-items"), venueId })));
  const result = await prisma.menuItem.createMany({ data: storedItems });
  res.status(201).json({ created: result.count });
}));

merchantRouter.post("/venues/:venueId/menu/clone", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  const { sourceVenueId } = z.object({ sourceVenueId: z.string().min(1) }).parse(req.body);
  await Promise.all([assertOwner(req.user!.id, venueId), assertOwner(req.user!.id, sourceVenueId)]);
  if (venueId === sourceVenueId) throw new HttpError(400, "Choose a different source venue.");
  const source = await prisma.menuItem.findMany({ where: { venueId: sourceVenueId } });
  if (!source.length) throw new HttpError(400, "The source venue has no menu items.");
  const result = await prisma.menuItem.createMany({ data: source.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => ({ ...item, venueId })) });
  res.status(201).json({ created: result.count });
}));

merchantRouter.post("/venues/:venueId/menu/ocr", menuUpload.single("menu"), asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  if (!req.file) throw new HttpError(400, "Choose a menu photo or PDF.");
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Menu scan is not configured yet. Add OPENAI_API_KEY or use paste/manual entry.", "OCR_NOT_CONFIGURED");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (!allowed.has(req.file.mimetype)) throw new HttpError(400, "Upload a JPG, PNG, WebP, or PDF menu.");
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  const filePart = req.file.mimetype === "application/pdf"
    ? { type: "input_file", filename: req.file.originalname || "menu.pdf", file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL,
      input: [{ role: "user", content: [
        { type: "input_text", text: "Extract every readable food or drink item from this menu. The menu may mix Azerbaijani and English. Preserve the item's written language, parse prices as AZN numbers, and choose the closest category name from: Breakfast, Appetizers, Mains, Sides, Desserts, Drinks, Alcohol. Do not invent unreadable items." },
        filePart,
      ] }],
      text: {
        format: {
          type: "json_schema",
          name: "menu_items",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    priceAzn: { type: "number" },
                    category: { type: "string", enum: ["Breakfast", "Appetizers", "Mains", "Sides", "Desserts", "Drinks", "Alcohol"] },
                  },
                  required: ["name", "priceAzn", "category"],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    }),
  });
  if (!response.ok) {
    console.error("OpenAI menu OCR failed", response.status, (await response.text()).slice(0, 500));
    throw new HttpError(502, "We could not read that menu. Try a clearer photo or use paste/manual entry.", "OCR_FAILED");
  }
  const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new HttpError(502, "No menu items could be read. Try a clearer image or enter them manually.", "OCR_EMPTY");
  const extracted = z.object({ items: z.array(z.object({ name: z.string().trim().min(1), priceAzn: z.number().nonnegative(), category: z.string() })) }).parse(JSON.parse(outputText));
  const categories = await prisma.menuCategory.findMany();
  const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  const drafts = extracted.items.flatMap((item) => {
    const categoryId = categoryByName.get(item.category.toLowerCase());
    return categoryId ? [{ name: item.name, priceAzn: item.priceAzn, categoryId }] : [];
  });
  res.json({ drafts, message: drafts.length ? "Review every extracted row before saving." : "No reliable menu rows were found. Try another image or enter items manually." });
}));

merchantRouter.get("/dashboard", asyncRoute(async (req, res) => {
  const includeDashboard = {
    deals: {
      orderBy: { createdAt: "desc" as const },
      include: {
        _count: { select: { views: true, savedBy: true, redemptions: true } },
        scopeCategory: true,
        offerMenuItems: { include: { menuItem: true } },
      },
    },
    _count: { select: { followers: true } },
  };
  let restaurants = await prisma.restaurant.findMany({
    where: { ownerUserId: req.user!.id },
    include: includeDashboard,
  });

  if (restaurants.length === 0 && req.user!.role === "MERCHANT") {
    const profile = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        merchantVenueName: true,
        merchantVenueAddress: true,
        merchantVenueLat: true,
        merchantVenueLng: true,
        merchantVenueImage: true,
        merchantVenueImageUrl: true,
      },
    });
    if (profile?.merchantVenueName && profile.merchantVenueAddress && profile.merchantVenueLat != null && profile.merchantVenueLng != null) {
      let venue = await prisma.restaurant.create({
        data: {
          name: profile.merchantVenueName,
          cuisine: "Venue",
          address: profile.merchantVenueAddress,
          lat: profile.merchantVenueLat,
          lng: profile.merchantVenueLng,
          ownerUserId: req.user!.id,
          claimStatus: "verified",
          isActive: true,
          verificationNotes: "Created from verified merchant registration.",
          photoUrl: profile.merchantVenueImageUrl,
        },
      });
      if (!profile.merchantVenueImageUrl && profile.merchantVenueImage) {
        venue = await prisma.restaurant.update({ where: { id: venue.id }, data: { photoUrl: `/api/restaurants/${venue.id}/photo` } });
      }
      restaurants = await prisma.restaurant.findMany({ where: { id: venue.id }, include: includeDashboard });
    }
  }
  res.json({ restaurants });
}));

merchantRouter.post("/deals", asyncRoute(async (req, res) => {
  const input = dealInput.parse(req.body);
  await assertOwner(req.user!.id, input.restaurantId);
  await assertOfferScope(input.restaurantId, input);
  const storedPhotoUrl = await persistImage(input.photoUrl, "offers");
  const resolvedPhotoUrl = await assertOfferPhoto(input.restaurantId, { ...input, photoUrl: storedPhotoUrl });
  const now = new Date();
  const { menuItemIds, menuItemOverrides, ...dealData } = input;
  const deal = await prisma.deal.create({
    data: {
      ...dealData,
      photoUrl: resolvedPhotoUrl,
      scopeCategoryId: input.scope === "CATEGORY" ? input.scopeCategoryId : null,
      offerMenuItems: input.scope === "SPECIFIC_ITEMS" ? { create: [...new Set(menuItemIds)].map((menuItemId) => ({ menuItemId, overridePriceAzn: menuItemOverrides[menuItemId] ?? null })) } : undefined,
      status: "approved",
      isActive: true,
      submittedByUserId: req.user!.id,
      submittedAt: now,
      reviewedAt: now,
      reviewNotes: "Published automatically. Admin monitoring only.",
    },
  });
  res.status(201).json({ deal });
}));

merchantRouter.patch("/deals/:id", asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const existing = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!existing) throw new HttpError(404, "Offer not found.");
  await assertOwner(req.user!.id, existing.restaurantId);
  const input = dealInput.partial().parse(req.body);
  if (input.restaurantId && input.restaurantId !== existing.restaurantId) await assertOwner(req.user!.id, input.restaurantId);
  const nextScope = input.scope ?? existing.scope;
  const nextCategoryId = input.scopeCategoryId === undefined ? existing.scopeCategoryId : input.scopeCategoryId;
  const nextItemIds = input.menuItemIds ?? (await prisma.offerMenuItem.findMany({ where: { offerId: existing.id }, select: { menuItemId: true } })).map((item) => item.menuItemId);
  await assertOfferScope(input.restaurantId ?? existing.restaurantId, { scope: nextScope, scopeCategoryId: nextCategoryId, menuItemIds: nextItemIds });
  const storedPhotoUrl = input.photoUrl === undefined ? existing.photoUrl : await persistImage(input.photoUrl, "offers");
  const resolvedPhotoUrl = await assertOfferPhoto(input.restaurantId ?? existing.restaurantId, { photoUrl: storedPhotoUrl, scope: nextScope, scopeCategoryId: nextCategoryId, menuItemIds: nextItemIds });
  const now = new Date();
  const { menuItemIds: _menuItemIds, menuItemOverrides, ...dealChanges } = input;
  const deal = await prisma.$transaction(async (tx) => {
    if (input.scope || input.menuItemIds || input.menuItemOverrides) await tx.offerMenuItem.deleteMany({ where: { offerId: existing.id } });
    return tx.deal.update({
      where: { id: existing.id },
      data: {
      ...dealChanges,
      photoUrl: resolvedPhotoUrl,
      scopeCategoryId: nextScope === "CATEGORY" ? nextCategoryId : null,
      offerMenuItems: nextScope === "SPECIFIC_ITEMS" && (input.scope || input.menuItemIds || input.menuItemOverrides) ? { create: [...new Set(nextItemIds)].map((menuItemId) => ({ menuItemId, overridePriceAzn: menuItemOverrides?.[menuItemId] ?? null })) } : undefined,
      status: "approved",
      isActive: true,
      submittedByUserId: req.user!.id,
      submittedAt: now,
      reviewedByUserId: null,
      reviewedAt: now,
      reviewNotes: "Published automatically. Admin monitoring only.",
      },
    });
  });
  res.json({ deal });
}));

merchantRouter.post("/deals/:id/expire", asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const existing = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!existing) throw new HttpError(404, "Offer not found.");
  await assertOwner(req.user!.id, existing.restaurantId);
  const deal = await prisma.deal.update({ where: { id: existing.id }, data: { isActive: false, status: "expired" } });
  res.json({ deal });
}));

merchantRouter.post("/redemptions/redeem", asyncRoute(async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(4).max(30) }).parse(req.body);
  const redemption = await prisma.redemption.findUnique({
    where: { redemptionCode: code.toUpperCase() },
    include: { deal: { include: { restaurant: { select: { id: true, name: true } } } }, user: { select: { id: true, name: true, email: true } } },
  });
  if (!redemption) throw new HttpError(404, "Redemption code not found.");
  await assertOwner(req.user!.id, redemption.deal.restaurantId);
  if (redemption.redeemedAt) throw new HttpError(409, "This code has already been redeemed.");
  const updated = await prisma.redemption.update({
    where: { id: redemption.id }, data: { redeemedAt: new Date() },
  });
  res.json({ redemption: { ...updated, deal: redemption.deal, user: redemption.user } });
}));

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { requireAuth, requireMerchant } from "../middleware/auth.js";
import multer from "multer";
import { env } from "../env.js";
import { persistImage } from "../lib/image-storage.js";

export const merchantRouter = Router();
const venueType = z.enum(["Restaurant", "Pub", "Bar", "Lounge", "Cafe"]);
const menuUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const imageValue = z.string().trim().max(3_000_000).refine((value) => /^https?:\/\//i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value), "Use an image URL or uploaded JPG, PNG, or WebP image");
const venueImageValue = z.string().trim().max(3_000_000).refine((value) => /^https?:\/\//i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value) || /^\/api\/restaurants\/[a-z0-9_-]+\/photo$/i.test(value), "Use an uploaded JPG, PNG, or WebP image");

const enrollmentInput = z.object({
  venueName: z.string().trim().min(2).max(120),
  venueType,
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
  .refine((value) => value.offerType !== "set_menu" || (value.scope === "SPECIFIC_ITEMS" && (value.menuItemIds?.length ?? 0) >= 2), { message: "Set menus must include at least two specific menu items", path: ["menuItemIds"] })
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

const venueProfileInput = z.object({
  name: z.string().trim().min(2).max(120),
  cuisine: venueType,
  address: z.string().trim().min(5).max(240),
  phone: z.string().trim().max(40).nullable(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  photoUrl: venueImageValue.nullable(),
});

async function assertOwner(userId: string, restaurantId: string) {
  const restaurant = await prisma.restaurant.findFirst({ where: { id: restaurantId, ownerUserId: userId, claimStatus: "verified" } });
  if (!restaurant) throw new HttpError(403, "You do not manage this restaurant.");
  return restaurant;
}

async function assertSelectedMenuCategory(venueId: string, categoryId: string) {
  const selection = await prisma.venueMenuCategory.findUnique({ where: { venueId_categoryId: { venueId, categoryId } } });
  if (!selection) throw new HttpError(400, "Choose a menu section enabled for this venue.", "MENU_CATEGORY_NOT_SELECTED");
  return selection;
}

async function getVenueMenuCategories(venueId: string) {
  const selected = await prisma.venueMenuCategory.findMany({
    where: { venueId },
    include: { category: true },
    orderBy: [{ sortOrder: "asc" }, { category: { sortOrder: "asc" } }, { category: { name: "asc" } }],
  });
  const selectedIds = selected.map((row) => row.categoryId);
  const available = await prisma.menuCategory.findMany({
    where: { OR: [{ isGlobal: true }, { createdByVenueId: venueId }], id: selectedIds.length ? { notIn: selectedIds } : undefined },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return { selected, available };
}

async function assertOfferScope(restaurantId: string, input: { scope: "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS"; scopeCategoryId?: string | null; menuItemIds: string[] }) {
  if (input.scope === "CATEGORY") {
    await assertSelectedMenuCategory(restaurantId, input.scopeCategoryId!);
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

merchantRouter.patch("/venues/:venueId/google-place", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const { googlePlaceId } = z.object({ googlePlaceId: z.string().trim().min(1).max(255).nullable() }).parse(req.body);
  if (googlePlaceId) {
    const existing = await prisma.restaurant.findUnique({ where: { googlePlaceId }, select: { id: true } });
    if (existing && existing.id !== venueId) throw new HttpError(409, "That Google listing is already linked to another venue.");
  }
  const venue = await prisma.restaurant.update({ where: { id: venueId }, data: { googlePlaceId }, select: { id: true, googlePlaceId: true } });
  res.json({ venue });
}));

merchantRouter.patch("/venues/:venueId/profile", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const input = venueProfileInput.parse(req.body);
  const photoUrl = await persistImage(input.photoUrl, "venues");
  const [venue] = await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: venueId },
      data: { ...input, photoUrl },
      select: { id: true, name: true, cuisine: true, address: true, phone: true, lat: true, lng: true, photoUrl: true },
    }),
    prisma.user.update({ where: { id: req.user!.id }, data: { merchantVenueType: input.cuisine } }),
  ]);
  res.json({ venue });
}));

merchantRouter.get("/menu/categories", asyncRoute(async (_req, res) => {
  const categories = await prisma.menuCategory.findMany({ where: { isGlobal: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  res.json({ categories });
}));

merchantRouter.get("/menu-categories", asyncRoute(async (req, res) => {
  const { venueId } = z.object({ venueId: z.string().min(1) }).parse(req.query);
  await assertOwner(req.user!.id, venueId);
  res.json(await getVenueMenuCategories(venueId));
}));

merchantRouter.put("/menu-categories", asyncRoute(async (req, res) => {
  const input = z.object({ venueId: z.string().min(1), categoryIds: z.array(z.string().min(1)).max(50) }).parse(req.body);
  await assertOwner(req.user!.id, input.venueId);
  const categoryIds = [...new Set(input.categoryIds)];
  const accessibleCount = await prisma.menuCategory.count({
    where: { id: { in: categoryIds }, OR: [{ isGlobal: true }, { createdByVenueId: input.venueId }] },
  });
  if (accessibleCount !== categoryIds.length) throw new HttpError(400, "One or more menu sections are unavailable for this venue.", "INVALID_MENU_CATEGORY");

  const current = await prisma.venueMenuCategory.findMany({ where: { venueId: input.venueId }, select: { categoryId: true } });
  const nextIds = new Set(categoryIds);
  const removedIds = current.map((row) => row.categoryId).filter((categoryId) => !nextIds.has(categoryId));
  if (removedIds.length) {
    const used = await prisma.menuItem.groupBy({
      by: ["categoryId"],
      where: { venueId: input.venueId, categoryId: { in: removedIds } },
      _count: { _all: true },
    });
    if (used.length) {
      const names = await prisma.menuCategory.findMany({ where: { id: { in: used.map((row) => row.categoryId) } }, select: { id: true, name: true } });
      const nameById = new Map(names.map((category) => [category.id, category.name]));
      const details = used.map((row) => `${nameById.get(row.categoryId) ?? "Section"} (${row._count._all} item${row._count._all === 1 ? "" : "s"})`).join(", ");
      throw new HttpError(409, `Move or delete menu items before removing: ${details}.`, "MENU_CATEGORY_IN_USE");
    }
    const activeOffer = await prisma.deal.findFirst({ where: { restaurantId: input.venueId, isActive: true, scopeCategoryId: { in: removedIds } }, include: { scopeCategory: { select: { name: true } } } });
    if (activeOffer) throw new HttpError(409, `Expire or edit “${activeOffer.title}” before removing ${activeOffer.scopeCategory?.name ?? "its menu section"}.`, "MENU_CATEGORY_IN_USE");
  }

  await prisma.$transaction(async (tx) => {
    await tx.venueMenuCategory.deleteMany({ where: { venueId: input.venueId } });
    if (categoryIds.length) await tx.venueMenuCategory.createMany({ data: categoryIds.map((categoryId, sortOrder) => ({ venueId: input.venueId, categoryId, sortOrder })) });
  });
  res.json(await getVenueMenuCategories(input.venueId));
}));

merchantRouter.post("/menu-categories/custom", asyncRoute(async (req, res) => {
  const input = z.object({ venueId: z.string().min(1), name: z.string().trim().min(2).max(60) }).parse(req.body);
  await assertOwner(req.user!.id, input.venueId);
  const duplicate = await prisma.menuCategory.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" }, OR: [{ isGlobal: true }, { createdByVenueId: input.venueId }] },
  });
  if (duplicate) throw new HttpError(409, duplicate.isGlobal ? `“${duplicate.name}” already exists in the global section list.` : `This venue already has a “${duplicate.name}” section.`, "DUPLICATE_MENU_CATEGORY");
  const selectionCount = await prisma.venueMenuCategory.count({ where: { venueId: input.venueId } });
  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.menuCategory.create({ data: { name: input.name, sortOrder: 1000 + selectionCount, isGlobal: false, createdByVenueId: input.venueId } });
    await tx.venueMenuCategory.create({ data: { venueId: input.venueId, categoryId: created.id, sortOrder: selectionCount } });
    return created;
  });
  res.status(201).json({ category, ...(await getVenueMenuCategories(input.venueId)) });
}));

merchantRouter.get("/menu/catalog", asyncRoute(async (req, res) => {
  const query = z.object({ q: z.string().trim().max(80).default(""), venueId: z.string().min(1) }).parse(req.query);
  await assertOwner(req.user!.id, query.venueId);
  const items = await prisma.catalogItem.findMany({
    where: { isActive: true, name: query.q ? { contains: query.q, mode: "insensitive" } : undefined, category: { venueSelections: { some: { venueId: query.venueId } } } },
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
  await assertSelectedMenuCategory(venueId, catalogItem.categoryId);
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
  await assertSelectedMenuCategory(venueId, input.categoryId);
  const item = await prisma.menuItem.create({ data: { ...input, photoUrl: await persistImage(input.photoUrl, "menu-items"), venueId } });
  res.status(201).json({ item: { ...item, priceAzn: Number(item.priceAzn) } });
}));

merchantRouter.patch("/menu/items/:id", asyncRoute(async (req, res) => {
  const id = z.string().parse(req.params.id);
  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Menu item not found.");
  await assertOwner(req.user!.id, existing.venueId);
  const input = menuItemInput.partial().parse(req.body);
  if (input.categoryId) await assertSelectedMenuCategory(existing.venueId, input.categoryId);
  const item = await prisma.menuItem.update({ where: { id }, data: { ...input, photoUrl: input.photoUrl === undefined ? undefined : await persistImage(input.photoUrl, "menu-items") } });
  res.json({ item: { ...item, priceAzn: Number(item.priceAzn) } });
}));

merchantRouter.post("/venues/:venueId/menu/bulk", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const { items } = z.object({ items: z.array(menuItemInput).min(1).max(200) }).parse(req.body);
  const categoryIds = [...new Set(items.map((item) => item.categoryId))];
  if (await prisma.venueMenuCategory.count({ where: { venueId, categoryId: { in: categoryIds } } }) !== categoryIds.length) throw new HttpError(400, "One or more menu sections are not enabled for this venue.", "MENU_CATEGORY_NOT_SELECTED");
  const storedItems = await Promise.all(items.map(async (item) => ({ ...item, photoUrl: await persistImage(item.photoUrl, "menu-items"), venueId })));
  const result = await prisma.menuItem.createMany({ data: storedItems });
  res.status(201).json({ created: result.count });
}));

merchantRouter.post("/venues/:venueId/menu/clone", asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  const { sourceVenueId } = z.object({ sourceVenueId: z.string().min(1) }).parse(req.body);
  await Promise.all([assertOwner(req.user!.id, venueId), assertOwner(req.user!.id, sourceVenueId)]);
  if (venueId === sourceVenueId) throw new HttpError(400, "Choose a different source venue.");
  const source = await prisma.menuItem.findMany({ where: { venueId: sourceVenueId }, include: { category: true } });
  if (!source.length) throw new HttpError(400, "The source venue has no menu items.");
  const inaccessibleCustom = [...new Map(source.filter((item) => !item.category.isGlobal && item.category.createdByVenueId !== venueId).map((item) => [item.categoryId, item.category.name])).values()];
  if (inaccessibleCustom.length) throw new HttpError(409, `Create matching custom sections before cloning: ${inaccessibleCustom.join(", ")}.`, "CUSTOM_MENU_CATEGORY_SCOPED");
  const sourceCategoryIds = [...new Set(source.map((item) => item.categoryId))];
  const existingSelections = await prisma.venueMenuCategory.findMany({ where: { venueId }, select: { categoryId: true } });
  const existingIds = new Set(existingSelections.map((row) => row.categoryId));
  const result = await prisma.$transaction(async (tx) => {
    const missingIds = sourceCategoryIds.filter((categoryId) => !existingIds.has(categoryId));
    if (missingIds.length) await tx.venueMenuCategory.createMany({ data: missingIds.map((categoryId, index) => ({ venueId, categoryId, sortOrder: existingSelections.length + index })) });
    return tx.menuItem.createMany({ data: source.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, category: _category, ...item }) => ({ ...item, venueId })) });
  });
  res.status(201).json({ created: result.count });
}));

merchantRouter.post("/venues/:venueId/menu/ocr", menuUpload.single("menu"), asyncRoute(async (req, res) => {
  const venueId = z.string().parse(req.params.venueId);
  await assertOwner(req.user!.id, venueId);
  const selectedSections = await prisma.venueMenuCategory.findMany({ where: { venueId }, include: { category: true }, orderBy: { sortOrder: "asc" } });
  if (!selectedSections.length) throw new HttpError(409, "Add at least one menu section before scanning a menu.", "MENU_CATEGORY_REQUIRED");
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
        { type: "input_text", text: `Extract every readable food or drink item from this menu. The menu may mix Azerbaijani and English. Preserve the item's written language, parse prices as AZN numbers, and choose the closest category name from this venue's enabled sections only: ${selectedSections.map((row) => row.category.name).join(", ")}. Do not invent unreadable items.` },
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
                    category: { type: "string", enum: selectedSections.map((row) => row.category.name) },
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
  const categoryByName = new Map(selectedSections.map((row) => [row.category.name.toLowerCase(), row.categoryId]));
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
        merchantVenueType: true,
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
          cuisine: profile.merchantVenueType ?? "Restaurant",
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

merchantRouter.post("/deals/:id/go-live", asyncRoute(async (req, res) => {
  const dealId = z.string().parse(req.params.id);
  const existing = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!existing) throw new HttpError(404, "Offer not found.");
  await assertOwner(req.user!.id, existing.restaurantId);
  const now = new Date();
  const deal = await prisma.deal.update({
    where: { id: existing.id },
    data: { status: "approved", isActive: true, startsAt: now, endsAt: existing.endsAt > now ? existing.endsAt : new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  });
  res.json({ deal, visibility: "live" });
}));

merchantRouter.post("/redemptions/redeem", asyncRoute(async (req, res) => {
  const { code, venueId, billAmountAzn } = z.object({
    code: z.string().trim().min(4).max(30),
    venueId: z.string().min(1).optional(),
    billAmountAzn: z.coerce.number().positive().max(100000).optional(),
  }).parse(req.body);
  const normalizedCode = code.toUpperCase();

  if (normalizedCode.startsWith("PTS-")) {
    if (!venueId || billAmountAzn == null) throw new HttpError(400, "Choose the venue and enter the bill amount for a points reward.");
    await assertOwner(req.user!.id, venueId);
    const reward = await prisma.pointReward.findUnique({
      where: { rewardCode: normalizedCode },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!reward) throw new HttpError(404, "Points reward code not found.");
    if (reward.redeemedAt) throw new HttpError(409, "This points reward has already been redeemed.");
    const eligibleBillAzn = Math.min(billAmountAzn, Number(reward.maxBillAzn));
    const discountAmountAzn = Math.round(eligibleBillAzn * reward.discountPct) / 100;
    const updated = await prisma.pointReward.updateMany({
      where: { id: reward.id, redeemedAt: null },
      data: { redeemedAt: new Date(), redeemedVenueId: venueId, billAmountAzn, discountAmountAzn },
    });
    if (!updated.count) throw new HttpError(409, "This points reward has already been redeemed.");
    res.json({
      kind: "POINT_REWARD",
      reward: { rewardCode: reward.rewardCode, discountPct: reward.discountPct, maxBillAzn: Number(reward.maxBillAzn), billAmountAzn, discountAmountAzn, user: reward.user },
    });
    return;
  }

  const redemption = await prisma.redemption.findUnique({
    where: { redemptionCode: normalizedCode },
    include: { deal: { include: { restaurant: { select: { id: true, name: true } } } }, user: { select: { id: true, name: true, email: true } } },
  });
  if (!redemption) throw new HttpError(404, "Redemption code not found.");
  await assertOwner(req.user!.id, redemption.deal.restaurantId);
  if (redemption.redeemedAt) throw new HttpError(409, "This code has already been redeemed.");
  const updated = await prisma.redemption.update({
    where: { id: redemption.id }, data: { redeemedAt: new Date() },
  });
  res.json({ kind: "DEAL", spinUnlocked: true, redemption: { ...updated, deal: redemption.deal, user: redemption.user } });
}));

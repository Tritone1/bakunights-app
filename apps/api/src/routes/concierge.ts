import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { buildConciergeInstructions, buildFallbackConcierge, conciergeLanguages, parseConciergeOutput, type ConciergeCatalogVenue, type ConciergeLanguage, type ConciergeOutput } from "../lib/concierge.js";
import { getOfferLanguage, localizeDeal } from "../lib/deal-translation.js";
import { milesBetween } from "../lib/distance.js";
import { asyncRoute, HttpError } from "../lib/http.js";

export const conciergeRouter = Router();

const chatInput = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1600),
  })).min(1).max(10),
  language: z.enum(conciergeLanguages).optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
});

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
};

const requestLog = new Map<string, number[]>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 20;

function enforceRateLimit(req: Request) {
  const now = Date.now();
  const key = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  const recent = (requestLog.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) throw new HttpError(429, "Too many AI requests. Please wait a few minutes and try again.", "CONCIERGE_RATE_LIMIT");
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 2_000) {
    for (const [entryKey, times] of requestLog) {
      if (!times.some((time) => now - time < RATE_WINDOW_MS)) requestLog.delete(entryKey);
    }
  }
}

function requestLanguage(req: Request, requested?: ConciergeLanguage) {
  if (requested) return requested;
  return getOfferLanguage(req);
}

function outputText(payload: OpenAIResponse) {
  return payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

conciergeRouter.post("/", asyncRoute(async (req, res) => {
  enforceRateLimit(req);
  const input = chatInput.parse(req.body);
  if (input.messages.at(-1)?.role !== "user") throw new HttpError(400, "The latest chat message must be from the user.");
  const language = requestLanguage(req, input.language);
  const now = new Date();
  const rows = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      cuisine: true,
      address: true,
      rating: true,
      priceLevel: true,
      amenities: true,
      dietaryTags: true,
      hoursJson: true,
      lat: true,
      lng: true,
      phone: true,
      photoUrl: true,
      isVerifiedTrusted: true,
      deals: {
        where: { isActive: true, status: "approved", startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: { endsAt: "asc" },
        take: 1,
        select: {
          id: true,
          title: true,
          description: true,
          sourceLanguage: true,
          translations: true,
          offerType: true,
          discountPct: true,
          offerPriceAzn: true,
          endsAt: true,
        },
      },
    },
    take: 100,
  });

  const sorted = rows.map((venue) => ({
    venue,
    distanceKm: input.location ? milesBetween(input.location.lat, input.location.lng, venue.lat, venue.lng) * 1.609344 : null,
  })).sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    return b.venue.rating - a.venue.rating;
  }).slice(0, 60);

  if (!sorted.length) {
    const emptyReply = language === "az" ? "Hazırda tövsiyə edə biləcəyim aktiv məkan yoxdur. Bir az sonra yenidən yoxlayın."
      : language === "ru" ? "Сейчас нет активных заведений, которые я могу порекомендовать. Попробуйте немного позже."
        : "There are no active venues I can recommend right now. Please check again soon.";
    res.json({ reply: emptyReply, recommendations: [], followUp: "" });
    return;
  }

  const catalog: ConciergeCatalogVenue[] = sorted.map(({ venue, distanceKm }) => {
    const deal = venue.deals[0];
    const localizedDeal = deal ? localizeDeal(deal, language) : null;
    return {
      id: venue.id,
      name: venue.name,
      cuisine: venue.cuisine,
      address: venue.address,
      rating: venue.rating,
      priceLevel: venue.priceLevel,
      amenities: venue.amenities,
      dietaryTags: venue.dietaryTags,
      hours: venue.hoursJson,
      distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
      liveOffer: localizedDeal ? {
        id: localizedDeal.id,
        title: localizedDeal.title,
        description: localizedDeal.description,
        offerType: localizedDeal.offerType,
        discountPct: localizedDeal.discountPct,
        offerPriceAzn: localizedDeal.offerPriceAzn?.toString() ?? null,
        endsAt: localizedDeal.endsAt.toISOString(),
      } : null,
    };
  });
  const venueById = new Map(sorted.map(({ venue, distanceKm }) => [venue.id, { venue, distanceKm }]));
  const responsePayload = (answer: ConciergeOutput) => ({
    reply: answer.reply,
    followUp: answer.followUp,
    recommendations: answer.recommendations.flatMap(({ venueId, reason }) => {
      const match = venueById.get(venueId);
      if (!match) return [];
      const deal = match.venue.deals[0];
      const localizedDeal = deal ? localizeDeal(deal, language) : null;
      return [{
        reason,
        venue: {
          id: match.venue.id,
          name: match.venue.name,
          cuisine: match.venue.cuisine,
          address: match.venue.address,
          rating: match.venue.rating,
          priceLevel: match.venue.priceLevel,
          amenities: match.venue.amenities,
          photoUrl: match.venue.photoUrl,
          phone: match.venue.phone,
          isVerifiedTrusted: match.venue.isVerifiedTrusted,
          distanceKm: match.distanceKm === null ? null : Number(match.distanceKm.toFixed(1)),
          liveDeal: localizedDeal ? { id: localizedDeal.id, title: localizedDeal.title } : null,
        },
      }];
    }),
  });
  const fallback = () => buildFallbackConcierge(language, catalog, input.messages.filter(({ role }) => role === "user").at(-1)?.content ?? "");
  const sendAnswer = (answer: ConciergeOutput) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(responsePayload(answer));
  };

  if (!env.OPENAI_API_KEY) {
    sendAnswer(fallback());
    return;
  }

  const bakuTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baku", dateStyle: "full", timeStyle: "short",
  }).format(now);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(35_000),
      body: JSON.stringify({
      model: env.OPENAI_CHAT_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 900,
      instructions: buildConciergeInstructions(language, catalog, bakuTime),
      input: input.messages,
      text: {
        format: {
          type: "json_schema",
          name: "venue_concierge_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              recommendations: {
                type: "array",
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    venueId: { type: "string", enum: catalog.map((venue) => venue.id) },
                    reason: { type: "string" },
                  },
                  required: ["venueId", "reason"],
                },
              },
              followUp: { type: "string" },
            },
            required: ["reply", "recommendations", "followUp"],
          },
        },
      },
      }),
    });
  } catch (error: unknown) {
    console.error("OpenAI concierge request failed", error instanceof Error ? error.message : error);
    sendAnswer(fallback());
    return;
  }
  if (!response.ok) {
    console.error("OpenAI concierge failed", response.status, (await response.text()).slice(0, 500));
    sendAnswer(fallback());
    return;
  }
  const payload = await response.json() as OpenAIResponse;
  const text = outputText(payload);
  if (!text) {
    sendAnswer(fallback());
    return;
  }
  try {
    const answer = parseConciergeOutput(JSON.parse(text), new Set(catalog.map((venue) => venue.id)));
    sendAnswer(answer);
  } catch (error) {
    console.error("OpenAI concierge returned an invalid response", error instanceof Error ? error.message : error);
    sendAnswer(fallback());
  }
}));

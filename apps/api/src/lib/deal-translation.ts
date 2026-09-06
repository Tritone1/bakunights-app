import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const offerLanguages = ["en", "az", "ru"] as const;
export type OfferLanguage = typeof offerLanguages[number];
type OfferCopy = { title: string; description: string };
type StoredTranslations = Partial<Record<OfferLanguage, OfferCopy>>;

type GoogleTranslationResponse = {
  data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> };
};

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|#39);/gi, (match, entity: string) => {
    if (entity.toLowerCase().startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

async function translateCopy(copy: OfferCopy, target: OfferLanguage) {
  if (!env.GOOGLE_TRANSLATE_API_KEY) throw new Error("GOOGLE_TRANSLATE_API_KEY is not configured");
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: [copy.title, copy.description], target, format: "text" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google Translation returned HTTP ${response.status}`);
  const payload = await response.json() as GoogleTranslationResponse;
  const translated = payload.data?.translations;
  if (!translated || translated.length !== 2 || !translated[0]?.translatedText || translated[1]?.translatedText === undefined) {
    throw new Error("Google Translation returned an incomplete response");
  }
  return {
    copy: { title: decodeEntities(translated[0].translatedText), description: decodeEntities(translated[1].translatedText) },
    detectedLanguage: translated[0].detectedSourceLanguage?.toLowerCase() || null,
  };
}

export function translationConfigured() {
  return Boolean(env.GOOGLE_TRANSLATE_API_KEY);
}

export async function syncDealTranslations(dealId: string, copy: OfferCopy) {
  if (!translationConfigured()) return false;

  const english = await translateCopy(copy, "en");
  const sourceLanguage = english.detectedLanguage;
  const translations: StoredTranslations = {};
  if (sourceLanguage === "en") translations.en = copy;
  else translations.en = english.copy;

  await Promise.all(offerLanguages.filter((language) => language !== "en").map(async (language) => {
    translations[language] = sourceLanguage === language ? copy : (await translateCopy(copy, language)).copy;
  }));

  await prisma.deal.update({
    where: { id: dealId },
    data: { sourceLanguage, translations: translations as Prisma.InputJsonValue },
  });
  return true;
}

export async function syncDealTranslationsBestEffort(dealId: string, copy: OfferCopy) {
  try {
    return await syncDealTranslations(dealId, copy);
  } catch (error) {
    console.error(`[translation] Offer ${dealId} could not be translated:`, error instanceof Error ? error.message : error);
    return false;
  }
}

export async function backfillDealTranslations() {
  if (!translationConfigured()) return;
  const deals = await prisma.deal.findMany({
    where: { translations: { equals: Prisma.DbNull } },
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: "asc" },
  });
  if (!deals.length) return;
  console.log(`[translation] Backfilling ${deals.length} offer(s).`);
  for (const deal of deals) await syncDealTranslationsBestEffort(deal.id, deal);
}

export function getOfferLanguage(req: Pick<Request, "query" | "headers">): OfferLanguage {
  const queryLanguage = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "";
  if (offerLanguages.includes(queryLanguage as OfferLanguage)) return queryLanguage as OfferLanguage;
  const header = String(req.headers["x-app-language"] || req.headers["accept-language"] || "en").toLowerCase();
  const match = header.match(/(?:^|[,;\s-])(en|az|ru)(?:$|[,;\s-])/);
  return (match?.[1] as OfferLanguage | undefined) ?? "en";
}

export function localizeDeal<T extends { title: string; description: string; sourceLanguage: string | null; translations: Prisma.JsonValue | null }>(deal: T, language: OfferLanguage) {
  const { translations: rawTranslations, ...rest } = deal;
  const translations = rawTranslations && typeof rawTranslations === "object" && !Array.isArray(rawTranslations)
    ? rawTranslations as StoredTranslations
    : {};
  const translated = translations[language];
  const isMachineTranslated = Boolean(translated && deal.sourceLanguage !== language);
  return {
    ...rest,
    title: translated?.title || deal.title,
    description: translated?.description || deal.description,
    contentLanguage: translated ? language : deal.sourceLanguage,
    isMachineTranslated,
  };
}

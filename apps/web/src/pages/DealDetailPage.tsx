import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useLocation, useNavigate } from "react-router-dom";
import { OfferDetailPage, type OfferPhoto, type Venue } from "../components/OfferDetailPage";
import { ErrorState, LoadingState } from "../components/States";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../lib/api";
import type { Deal, Redemption } from "../types";

type DetailResponse = { deal: Deal; saved: boolean; followed: boolean; redemption: Redemption | null };

export function DealDetailPage() {
  const { pathname } = useLocation();
  const id = pathname.match(/^\/deals\/([^/]+)$/)?.[1];
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api<DetailResponse>(`/deals/${id}?lang=${language}`)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load offer"); }
  }, [id, language]);

  useEffect(() => { void load(); }, [load]);
  const redemptionId = data?.redemption?.id;
  const redeemedAt = data?.redemption?.redeemedAt;
  useEffect(() => {
    if (!id || !redemptionId || redeemedAt) return;
    let cancelled = false;
    let checking = false;

    const checkStatus = async () => {
      if (cancelled || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const result = await api<{ redemption: Pick<Redemption, "id" | "redemptionCode" | "redeemedAt"> | null }>(`/deals/${id}/redemption/status`);
        if (!cancelled && result.redemption?.id === redemptionId && result.redemption.redeemedAt) {
          setData((current) => current?.redemption?.id === redemptionId
            ? { ...current, redemption: { ...current.redemption, redeemedAt: result.redemption!.redeemedAt } }
            : current);
        }
      } catch {
        // A temporary network failure should not dismiss the customer's QR proof.
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(() => void checkStatus(), 2_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void checkStatus(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void checkStatus();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [id, redeemedAt, redemptionId]);
  const presentation = useMemo(() => data ? toOfferPresentation(data.deal) : null, [data]);

  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!data || !presentation) return <LoadingState label="Preparing your offer..." />;

  const { deal } = data;

  function requireUser() {
    if (user) return;
    navigate(`/login/customer?next=${encodeURIComponent(pathname)}`);
    throw new Error("Sign in to continue.");
  }

  async function saveChanged(saved: boolean) {
    requireUser();
    await api(`/deals/${deal.id}/save`, { method: saved ? "PUT" : "DELETE" });
    setData((current) => current ? { ...current, saved } : current);
  }

  async function followChanged(followed: boolean) {
    requireUser();
    await api(`/restaurants/${deal.restaurant.id}/follow`, { method: followed ? "PUT" : "DELETE" });
    setData((current) => current ? { ...current, followed } : current);
  }

  async function submitRating(rating: number) {
    requireUser();
    await api(`/deals/${deal.id}/rating`, { method: "PUT", body: JSON.stringify({ value: rating }) });
  }

  async function confirmVisit() {
    requireUser();
    if (data?.redemption) return;
    const result = await api<{ redemption: Redemption }>(`/deals/${deal.id}/claim`, { method: "POST" });
    setData((current) => current ? { ...current, redemption: result.redemption } : current);
  }

  return <OfferDetailPage
    venue={presentation.venue}
    photos={presentation.photos}
    expiresAt={deal.endsAt}
    initiallySaved={data.saved}
    initiallyFollowed={data.followed}
    initiallyConfirmed={Boolean(data.redemption?.redeemedAt)}
    confirmationCode={data.redemption?.redemptionCode}
    qrCodeUrl={data.redemption?.qrDataUrl}
    onBack={() => window.history.length > 1 ? navigate(-1) : navigate("/")}
    onSaveChange={saveChanged}
    onFollowChange={followChanged}
    onSubmitRating={submitRating}
    onConfirmVisit={confirmVisit}
  />;
}

function toOfferPresentation(deal: Deal): { venue: Venue; photos: OfferPhoto[] } {
  const restaurant = deal.restaurant;
  const itemPhotos = (deal.offerMenuItems ?? []).flatMap(({ menuItem }) => menuItem.photoUrl ? [{ src: menuItem.photoUrl, label: menuItem.name }] : []);
  const freeItemPhotos = deal.freeMenuItem?.photoUrl ? [{ src: deal.freeMenuItem.photoUrl, label: `${deal.freeMenuItem.name} · free item` }] : [];
  const photoCandidates = (deal.offerType ?? "").toLowerCase() === "set_menu" && itemPhotos.length
    ? itemPhotos
    : [...(deal.photoUrl ? [{ src: deal.photoUrl, label: deal.title }] : []), ...itemPhotos, ...freeItemPhotos];
  if (!photoCandidates.length && restaurant.photoUrl) photoCandidates.push({ src: restaurant.photoUrl, label: restaurant.name });
  const photos = [...new Map(photoCandidates.map((photo) => [photo.src, photo])).values()];
  const prices = (deal.offerMenuItems ?? []).map(({ menuItem }) => Number(menuItem.priceAzn)).filter(Number.isFinite);
  const structuredPrice = Number(deal.offerPriceAzn);
  const minimumSpend = Number(deal.minimumSpendAzn);
  const priceRange = structuredPrice > 0
    ? `${structuredPrice.toFixed(2)} AZN total`
    : minimumSpend > 0
      ? `${minimumSpend.toFixed(2)} AZN minimum`
      : prices.length === 0
    ? "Price varies"
    : prices.length === 1
      ? `${prices[0]!.toFixed(2)} AZN`
      : `${Math.min(...prices).toFixed(0)}–${Math.max(...prices).toFixed(0)} AZN`;
  const startsAt = deal.startsAt ? new Date(deal.startsAt) : null;
  const endsAt = new Date(deal.endsAt);
  const open = startsAt
    ? `${format(startsAt, "h:mm a")} – ${format(endsAt, "h:mm a")}`
    : `Until ${format(endsAt, "h:mm a")}`;
  const offerType = (deal.offerType ?? "offer").replaceAll("_", " ");
  const dealTag = deal.offerType === "discount" && deal.discountPct != null ? `${deal.discountPct}% off` : offerType;
  const tags = [...new Set([
    ...(deal.dietaryTags ?? []),
    ...(deal.scopeCategory?.name ? [deal.scopeCategory.name] : []),
    ...((deal.offerMenuItems ?? []).flatMap(({ menuItem }) => menuItem.category?.name ? [menuItem.category.name] : [])),
  ])];
  if (!tags.length) tags.push("Limited-time offer");

  return {
    venue: {
      id: numericId(deal.id),
      name: restaurant.name,
      category: restaurant.cuisine || "Venue",
      mealPeriods: [deal.tag || "All day"],
      rating: restaurant.rating ?? 0,
      reviews: deal.ratingCount ?? 0,
      address: restaurant.address,
      distance: deal.distanceMiles == null ? "Nearby" : `${deal.distanceMiles.toFixed(1)} mi`,
      image: photos[0]?.src || "",
      deal: deal.description || deal.title,
      dealTag,
      dealColor: dealColor(deal.offerType),
      open,
      tags,
      lat: restaurant.lat,
      lng: restaurant.lng,
      priceRange,
      offerTerms: buildOfferTerms(deal),
      isMachineTranslated: deal.isMachineTranslated,
    },
    photos,
  };
}

function buildOfferTerms(deal: Deal) {
  const rows: { label: string; value: string; emphasis?: "amber" | "green" }[] = [];
  const items = deal.offerMenuItems ?? [];
  const quantityOf = (item: { quantity?: number | null }) => Math.max(1, Math.round(item.quantity ?? 1));
  const regularTotal = items.reduce((sum, item) => sum + Number(item.menuItem.priceAzn) * quantityOf(item), 0);
  const offerPrice = Number(deal.offerPriceAzn);
  const minimumSpend = Number(deal.minimumSpendAzn);

  if (minimumSpend > 0 && deal.freeMenuItem) {
    const freeQty = Math.max(1, Math.round(deal.freeMenuItemQty ?? 1));
    const qualifying = deal.scope === "WHOLE_MENU"
      ? "Any eligible venue purchase"
      : deal.scope === "CATEGORY"
        ? deal.scopeCategory?.name ?? "Selected menu category"
        : items.map((item) => item.menuItem.name).join(", ");
    rows.push(
      { label: "Qualifying purchase", value: qualifying || "Selected items" },
      { label: "Minimum spend", value: `${minimumSpend.toFixed(2)} AZN`, emphasis: "amber" },
      { label: "Free item", value: `${freeQty > 1 ? `${freeQty}x ` : ""}${deal.freeMenuItem.name} (${(Number(deal.freeMenuItem.priceAzn) * freeQty).toFixed(2)} AZN value)`, emphasis: "green" },
    );
    return rows;
  }

  if (deal.offerType === "discount") {
    rows.push({ label: "Discount", value: `${deal.discountPct ?? 0}% off`, emphasis: "amber" });
    if (deal.scope === "CATEGORY") rows.push({ label: "Applies to", value: `${deal.scopeCategory?.name ?? "Selected category"} · all category items` });
    else if (deal.scope === "WHOLE_MENU") rows.push({ label: "Applies to", value: "Whole menu" });
    else rows.push({ label: "Applies to", value: items.map((item) => item.menuItem.name).join(", ") });
    return rows;
  }

  if (["combo", "set_menu", "bundle"].includes(deal.offerType ?? "")) {
    items.forEach((item) => {
      const { menuItem, overridePriceAzn, freeQuantity } = item;
      const qty = quantityOf(item);
      const freeQty = Math.max(0, Math.min(qty, Math.round(freeQuantity ?? 0)));
      const billableQty = qty - freeQty;
      const unitPrice = overridePriceAzn == null ? Number(menuItem.priceAzn) : Number(overridePriceAzn);
      const regularPrice = Number(menuItem.priceAzn) * qty;
      const label = qty > 1 ? `${qty}x ${menuItem.name}` : menuItem.name;
      const value = freeQty > 0 && freeQty === qty
        ? `Free · was ${regularPrice.toFixed(2)} AZN`
        : freeQty > 0
          ? `${freeQty} free + ${billableQty} at ${unitPrice.toFixed(2)} AZN · was ${regularPrice.toFixed(2)} AZN`
          : overridePriceAzn != null
            ? `${(unitPrice * billableQty).toFixed(2)} AZN · was ${regularPrice.toFixed(2)} AZN`
            : `${regularPrice.toFixed(2)} AZN`;
      rows.push({ label, value, emphasis: freeQty > 0 ? "green" : undefined });
    });
    const effectiveTotal = offerPrice > 0 ? offerPrice : items.reduce((sum, item) => {
      const qty = quantityOf(item);
      const freeQty = Math.max(0, Math.min(qty, Math.round(item.freeQuantity ?? 0)));
      const unitPrice = item.overridePriceAzn == null ? Number(item.menuItem.priceAzn) : Number(item.overridePriceAzn);
      return sum + unitPrice * (qty - freeQty);
    }, 0);
    if (regularTotal > 0) rows.push({ label: "Regular total", value: `${regularTotal.toFixed(2)} AZN` });
    rows.push({ label: "Offer total", value: `${effectiveTotal.toFixed(2)} AZN`, emphasis: "green" });
    if (regularTotal > effectiveTotal) rows.push({ label: "You save", value: `${(regularTotal - effectiveTotal).toFixed(2)} AZN (${Math.round((1 - effectiveTotal / regularTotal) * 100)}%)`, emphasis: "amber" });
  }
  return rows;
}

function numericId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  return Math.abs(hash);
}

function dealColor(type: Deal["offerType"]) {
  if (type === "discount") return "#ef4444";
  if (type === "perk") return "#10b981";
  return "#f59e0b";
}

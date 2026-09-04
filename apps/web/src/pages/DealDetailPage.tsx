import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useLocation, useNavigate } from "react-router-dom";
import { OfferDetailPage, type OfferPhoto, type Venue } from "../components/OfferDetailPage";
import { ErrorState, LoadingState } from "../components/States";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Deal, Redemption } from "../types";

type DetailResponse = { deal: Deal; saved: boolean; followed: boolean; redemption: Redemption | null };

export function DealDetailPage() {
  const { pathname } = useLocation();
  const id = pathname.match(/^\/deals\/([^/]+)$/)?.[1];
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api<DetailResponse>(`/deals/${id}`)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load offer"); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
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
  const photoCandidates = (deal.offerType ?? "").toLowerCase() === "set_menu" && itemPhotos.length
    ? itemPhotos
    : [...(deal.photoUrl ? [{ src: deal.photoUrl, label: deal.title }] : []), ...itemPhotos];
  if (!photoCandidates.length && restaurant.photoUrl) photoCandidates.push({ src: restaurant.photoUrl, label: restaurant.name });
  const photos = [...new Map(photoCandidates.map((photo) => [photo.src, photo])).values()];
  const prices = (deal.offerMenuItems ?? []).map(({ menuItem }) => Number(menuItem.priceAzn)).filter(Number.isFinite);
  const priceRange = prices.length === 0
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
    },
    photos,
  };
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

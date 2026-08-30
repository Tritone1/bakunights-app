import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ExternalLink, Heart, MapPin, Navigation, Star } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { DealCard } from "../components/DealCard";
import { ErrorState, LoadingState } from "../components/States";
import { SafeImage } from "../components/SafeImage";
import type { Deal, Restaurant } from "../types";

type MenuItem = { id: string; name: string; priceAzn: string | number; description?: string | null; photoUrl?: string | null };
type MenuCategory = { id: string; name: string; sortOrder: number; items: MenuItem[] };
type VenueDetail = Restaurant & { dietaryTags: string[]; menuCategories: MenuCategory[]; deals: Deal[] };
type DetailResponse = { restaurant: VenueDetail; followed: boolean; savedDealIds: string[] };
type ReviewsResponse =
  | { available: false; reason: "not_linked" }
  | { available: true; rating: number | null; reviewCount: number | null; googleMapsUri: string | null; reviews: { reviewerName: string; reviewerUri: string | null; reviewerPhotoUri: string | null; reviewUri: string | null; rating: number; relativeTime: string; text: string }[] };

export function VenuePage() {
  const { pathname } = useLocation();
  const id = pathname.match(/^\/venues\/([^/]+)$/)?.[1];
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api<DetailResponse>(`/restaurants/${id}`)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load venue"); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!id) return;
    api<ReviewsResponse>(`/restaurants/${id}/reviews`).then((result) => { setReviews(result); setReviewError(""); })
      .catch((reason) => setReviewError(reason instanceof Error ? reason.message : "Google reviews are temporarily unavailable."));
  }, [id]);

  function requireCustomer() {
    if (user) return true;
    navigate(`/login/customer?next=${encodeURIComponent(pathname)}`);
    return false;
  }

  async function toggleFollow() {
    if (!data || !requireCustomer()) return;
    setBusy("follow");
    try {
      await api(`/restaurants/${data.restaurant.id}/follow`, { method: data.followed ? "DELETE" : "PUT" });
      setData((current) => current ? { ...current, followed: !current.followed } : current);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not update follow status"); }
    finally { setBusy(""); }
  }

  async function toggleSave(deal: Deal) {
    if (!data || !requireCustomer()) return;
    const saved = data.savedDealIds.includes(deal.id);
    setBusy(deal.id);
    try {
      await api(`/deals/${deal.id}/save`, { method: saved ? "DELETE" : "PUT" });
      setData((current) => current ? { ...current, savedDealIds: saved ? current.savedDealIds.filter((dealId) => dealId !== deal.id) : [...current.savedDealIds, deal.id] } : current);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not update saved offers"); }
    finally { setBusy(""); }
  }

  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return <LoadingState label="Loading venue…" />;
  const venue = data.restaurant;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`;

  return <div className="min-h-screen bg-[#09090e] pb-16 text-white">
    <section className="relative h-[360px] overflow-hidden border-b border-white/10 sm:h-[460px]">
      <SafeImage src={venue.photoUrl || undefined} alt={`${venue.name} venue`} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#09090e] via-black/35 to-black/20" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-5 pb-8 sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">{venue.cuisine}</p>
        <h1 className="mt-2 font-display text-5xl font-semibold sm:text-6xl">{venue.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/70"><span className="flex items-center gap-1 font-semibold text-amber-300"><Star size={17} fill="currentColor" />{(venue.rating ?? 0).toFixed(1)} WhereToGo rating</span><span className="flex items-center gap-1"><MapPin size={17} />{venue.address}</span>{venue.isVerifiedTrusted && <span className="flex items-center gap-1 text-cyan-300"><CheckCircle2 size={17} />Verified trusted</span>}</div>
      </div>
    </section>

    <main className="mx-auto max-w-6xl px-5 py-9 sm:px-8">
      <div className="flex flex-wrap gap-3"><button onClick={() => void toggleFollow()} disabled={busy === "follow"} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 font-semibold hover:bg-white/10"><Heart size={18} fill={data.followed ? "currentColor" : "none"} />{data.followed ? "Following" : "Follow venue"}</button><a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 font-bold text-[#07151a]"><Navigation size={18} />Navigate me<ExternalLink size={14} /></a></div>
      <div className="mt-5 flex flex-wrap gap-2">{venue.dietaryTags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60">{tag}</span>)}</div>

      <section className="mt-12"><Heading eyebrow="Available now" title="Live offers" />{venue.deals.length ? <div className="grid gap-5 text-[#17151f] sm:grid-cols-2 lg:grid-cols-3">{venue.deals.map((deal) => <div key={deal.id} className="relative"><DealCard deal={deal} onSave={() => void toggleSave(deal)} saved={data.savedDealIds.includes(deal.id)} />{busy === deal.id && <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/30 text-xs font-bold text-white">Updating…</span>}</div>)}</div> : <EmptyText>No live offer right now</EmptyText>}</section>

      <section className="mt-14"><Heading eyebrow="Venue menu" title="Menu" />{venue.menuCategories.length ? <div className="grid gap-7 md:grid-cols-2">{venue.menuCategories.map((category) => <article key={category.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h3 className="font-display text-2xl font-semibold text-amber-300">{category.name}</h3><div className="mt-4 divide-y divide-white/10">{category.items.map((item) => <div key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">{item.photoUrl && <SafeImage src={item.photoUrl} alt={item.name} className="h-20 w-24 shrink-0 rounded-xl object-cover" />}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-4"><h4 className="font-semibold">{item.name}</h4><strong className="shrink-0 text-amber-300">{Number(item.priceAzn).toFixed(2)} AZN</strong></div>{item.description && <p className="mt-1 text-sm leading-6 text-white/50">{item.description}</p>}</div></div>)}</div></article>)}</div> : <EmptyText>This venue hasn&apos;t added their menu yet</EmptyText>}</section>

      <section className="mt-14"><Heading eyebrow="From Google" title="Reviews" />{reviewError ? <EmptyText>{reviewError}</EmptyText> : !reviews ? <EmptyText>Loading Google reviews…</EmptyText> : !reviews.available ? <EmptyText>This venue has not linked its Google Business listing yet. Venue owners can link the exact listing from the merchant dashboard.</EmptyText> : <><div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-white/60"><span className="flex items-center gap-1 text-amber-300"><Star size={17} fill="currentColor" />{reviews.rating?.toFixed(1) ?? "—"}</span><span>{reviews.reviewCount ?? 0} Google ratings</span>{reviews.googleMapsUri && <a href={reviews.googleMapsUri} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-cyan-300">View on Google Maps <ExternalLink size={14} /></a>}</div>{reviews.reviews.length ? <><p className="mb-4 text-xs text-white/35">Google displays these reviews in relevance order. Review content is provided by Google Maps users.</p><div className="grid gap-4 md:grid-cols-2">{reviews.reviews.map((review, index) => <article key={`${review.reviewerName}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{review.reviewerPhotoUri ? <img src={review.reviewerPhotoUri} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 font-bold">{review.reviewerName.slice(0, 1)}</span>}<div className="min-w-0">{review.reviewerUri ? <a href={review.reviewerUri} target="_blank" rel="noreferrer" className="truncate font-semibold hover:text-cyan-300">{review.reviewerName}</a> : <h3 className="truncate font-semibold">{review.reviewerName}</h3>}<p className="mt-1 flex text-amber-300">{Array.from({ length: 5 }, (_, star) => <Star key={star} size={14} fill={star < Math.round(review.rating) ? "currentColor" : "none"} />)}</p></div></div><span className="shrink-0 text-xs text-white/40">{review.relativeTime}</span></div>{review.text && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-white/65">{review.text}</p>}{review.reviewUri && <a href={review.reviewUri} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">Read on Google Maps <ExternalLink size={12} /></a>}</article>)}</div></> : <EmptyText>Google has no written reviews to display yet</EmptyText>}</>}</section>
    </main>
    {notice && <button onClick={() => setNotice("")} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-white/15 bg-[#171720] px-4 py-3 text-sm shadow-2xl">{notice}</button>}
  </div>;
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">{eyebrow}</p><h2 className="mt-1 font-display text-4xl font-semibold">{title}</h2></div>;
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-sm text-white/50">{children}</div>;
}

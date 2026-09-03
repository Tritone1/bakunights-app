import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, Heart, MapPin, Navigation, Share2, Star } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import { api } from "../lib/api";
import type { Deal, Redemption } from "../types";
import { DealMap } from "../components/DealMap";
import { ErrorState, LoadingState } from "../components/States";
import { useAuth } from "../context/AuthContext";
import { SafeImage } from "../components/SafeImage";

type DetailResponse = { deal: Deal; saved: boolean; followed: boolean; redemption: Redemption | null };

export function DealDetailPage() {
  const { pathname } = useLocation(); const id = pathname.match(/^\/deals\/([^/]+)$/)?.[1]; const navigate = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState<DetailResponse | null>(null); const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); const [notice, setNotice] = useState("");
  const [ratingValue, setRatingValue] = useState(0);
  const [feedbackChoice, setFeedbackChoice] = useState<boolean | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api<DetailResponse>(`/deals/${id}`)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load offer"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return <LoadingState label="Preparing your offer..." />;
  const { deal } = data; const restaurant = deal.restaurant;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`;
  const badge = offerBadge(deal);

  function requireUser() { if (!user) { navigate("/login/customer"); return false; } return true; }
  async function toggleSave() {
    if (!data) return;
    if (!requireUser()) return; setBusy("save");
    try { await api(`/deals/${deal.id}/save`, { method: data.saved ? "DELETE" : "PUT" }); setData((current) => current ? { ...current, saved: !current.saved } : current); }
    finally { setBusy(""); }
  }
  async function toggleFollow() {
    if (!data) return;
    if (!requireUser()) return; setBusy("follow");
    try { await api(`/restaurants/${restaurant.id}/follow`, { method: data.followed ? "DELETE" : "PUT" }); setData((current) => current ? { ...current, followed: !current.followed } : current); }
    finally { setBusy(""); }
  }
  async function claim() {
    if (!requireUser()) return; setBusy("claim");
    try { const result = await api<{ redemption: Redemption }>(`/deals/${deal.id}/claim`, { method: "POST" }); setData((current) => current ? { ...current, redemption: result.redemption } : current); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not claim"); }
    finally { setBusy(""); }
  }
  async function share() {
    const shareData = { title: `${offerLabel(deal)} at ${restaurant.name}`, text: deal.title, url: window.location.href };
    if (navigator.share) await navigator.share(shareData);
    else { await navigator.clipboard.writeText(window.location.href); setNotice("Link copied to clipboard."); }
  }
  async function rateDeal() {
    if (!ratingValue) return;
    setBusy("rating");
    try {
      await api(`/deals/${deal.id}/rating`, { method: "PUT", body: JSON.stringify({ value: ratingValue }) });
      setNotice("Rating saved. Thanks for keeping the offers honest.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not save rating"); }
    finally { setBusy(""); }
  }
  async function submitFeedback() {
    if (feedbackChoice == null) return;
    setBusy("feedback");
    try { await api(`/deals/${deal.id}/feedback`, { method: "POST", body: JSON.stringify({ wasHonored: feedbackChoice, comment: feedbackChoice ? null : feedbackComment || null }) }); setNotice("Thanks. Your response helps keep WhereToGo trustworthy."); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not save feedback"); }
    finally { setBusy(""); }
  }
  async function skipFeedback() { await api(`/deals/${deal.id}/feedback/skip`, { method: "POST" }); await load(); }

  return <div className="pb-8">
    <div className="relative h-64 border-b-2 border-ink bg-primary-50 sm:h-80 md:mx-8 md:mt-6 md:overflow-hidden md:rounded-xl md:border-2">
      <OfferPhotoGallery deal={deal} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
      <div className="stamp absolute right-4 top-4 flex h-28 w-28 items-center justify-center rounded-full text-center text-white"><span className="relative px-2 font-display text-3xl font-bold uppercase leading-none">{badge.main}<small className="block text-xs tracking-widest">{badge.sub}</small></span></div>
      <div className="absolute bottom-5 left-5 text-white"><p className="eyebrow">{restaurant.cuisine} · {deal.tag}</p><p className="font-display text-xl font-semibold uppercase">{restaurant.name}</p></div>
    </div>
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 md:grid-cols-[1.3fr_.7fr] md:px-8">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase leading-tight sm:text-5xl">{deal.title}</h1>{restaurant.isVerifiedTrusted && <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary-500 px-3 py-1 text-xs font-semibold text-primary-500"><CheckCircle2 size={15} />Verified trusted venue</p>}
        {deal.menuItem && <p className="mt-3 inline-flex rounded-full border-2 border-ink bg-cream px-3 py-1 font-mono text-xs font-semibold uppercase text-primary-500">Applies to: {deal.menuItem}</p>}
        <div className="mt-3 flex flex-wrap gap-2">{(deal.dietaryTags ?? []).map((tag) => <span key={tag} className="rounded-full border border-ink px-2 py-1 font-mono text-[10px] font-semibold uppercase">{tag}</span>)}</div>
        <p className="mt-5 text-lg leading-relaxed text-ink/75">{deal.description}</p>
        {deal.scope === "CATEGORY" && deal.scopeCategory && <p className="mt-3 font-semibold">Covers all active items in {deal.scopeCategory.name}.</p>}
        {deal.scope === "SPECIFIC_ITEMS" && Boolean(deal.offerMenuItems?.length) && <div className="mt-3"><p className="eyebrow text-ink/50">Covered menu items</p><ul className="mt-2 grid gap-2 sm:grid-cols-2">{deal.offerMenuItems!.map(({ menuItem }) => <li key={menuItem.id} className="flex items-center gap-3 rounded-lg border border-ink/15 p-2 font-semibold">{menuItem.photoUrl && <SafeImage src={menuItem.photoUrl} alt={menuItem.name} className="h-12 w-12 shrink-0 rounded-md object-cover" />}<span className="min-w-0"><span className="block truncate">{menuItem.name}</span><span className="block text-sm font-normal text-ink/55">{Number(menuItem.priceAzn).toFixed(2)} AZN</span></span></li>)}</ul></div>}
        <div className="my-6 grid grid-cols-2 gap-3 border-y-2 border-dashed border-ink/25 py-5">
          <div><p className="eyebrow text-ink/50">Offer ends</p><p className="mt-1 flex items-center gap-2 font-semibold"><Clock3 size={17} className="text-primary-500" />{format(new Date(deal.endsAt), "EEE, MMM d · h:mm a")}</p><p className="mt-1 text-xs text-tomato">in {formatDistanceToNowStrict(new Date(deal.endsAt))}</p></div>
          <div><p className="eyebrow text-ink/50">Restaurant rating</p><p className="mt-1 flex items-center gap-2 font-semibold"><Star size={17} fill="#e9bd45" />{(restaurant.rating ?? 0).toFixed(1)}</p>{deal.dealRating && <p className="mt-1 text-xs">Offer score {deal.dealRating.toFixed(1)}/5</p>}</div>
        </div>
        <div className="flex flex-wrap gap-2"><button onClick={() => void toggleSave()} disabled={Boolean(busy)} className="btn-mustard"><Bookmark size={18} fill={data.saved ? "#713d62" : "none"} />{data.saved ? "Saved" : "Save"}</button><button onClick={() => void toggleFollow()} disabled={Boolean(busy)} className="btn-ghost !border-ink"><Heart size={18} fill={data.followed ? "#713d62" : "none"} />{data.followed ? "Following" : "Follow"}</button><button onClick={() => void share()} className="btn-ghost !border-ink"><Share2 size={18} />Share</button></div>

        <section className="mt-8"><h2 className="font-display text-2xl font-bold uppercase">Find your way</h2><p className="mb-4 mt-1 flex items-start gap-2 text-ink/65"><MapPin size={18} className="mt-0.5 shrink-0" />{restaurant.address}</p><DealMap deals={[deal]} center={{ lat: restaurant.lat, lng: restaurant.lng }} /></section>
        {restaurant.hoursJson && <section className="mt-8"><h2 className="font-display text-2xl font-bold uppercase">Opening hours</h2><div className="mt-3 divide-y divide-ink/15 border-y-2 border-ink">{Object.entries(restaurant.hoursJson).map(([day, hours]) => <div key={day} className="flex justify-between gap-4 py-2 text-sm"><span className="font-semibold">{day}</span><span className="text-right text-ink/65">{hours}</span></div>)}</div></section>}
        {data.redemption && <section className="mt-8 border-2 border-ink bg-accent-50 p-5 shadow-ticket-sm"><p className="eyebrow text-accent-500">Offer-specific rating</p><h2 className="font-display text-2xl font-bold uppercase">Was this offer worth it?</h2><div className="mt-3 flex items-center gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => setRatingValue(value)} className="transition hover:scale-110" aria-label={`Rate ${value} stars`}><Star size={30} fill={value <= ratingValue ? "#e9bd45" : "transparent"} /></button>)}<button onClick={() => void rateDeal()} disabled={!ratingValue || busy === "rating"} className="btn-primary ml-2 !min-h-10 !px-3">Submit</button></div></section>}
        {data.redemption?.redeemedAt && !data.redemption.feedback && !data.redemption.feedbackSkippedAt && <section className="mt-8 border-2 border-ink bg-primary-50 p-5 shadow-ticket-sm"><p className="eyebrow text-primary-500">Quick trust check</p><h2 className="font-display text-2xl font-bold uppercase">Was this offer honored as described?</h2><div className="mt-3 flex gap-2"><button onClick={() => setFeedbackChoice(true)} className={feedbackChoice === true ? "btn-primary" : "btn-ghost !border-ink"}>Yes</button><button onClick={() => setFeedbackChoice(false)} className={feedbackChoice === false ? "btn-primary" : "btn-ghost !border-ink"}>No</button></div>{feedbackChoice === false && <textarea value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={500} className="mt-3 min-h-20 w-full border-2 border-ink bg-white p-3" placeholder="Optional: briefly tell us what happened" />}<div className="mt-3 flex gap-3"><button onClick={() => void submitFeedback()} disabled={feedbackChoice == null || busy === "feedback"} className="btn-primary">Send response</button><button onClick={() => void skipFeedback()} className="text-sm underline">Not now</button></div></section>}
      </div>

      <aside className="md:sticky md:top-24 md:self-start">
        <div className="ticket rounded-xl p-5 text-center"><p className="eyebrow text-primary-500">Your app proof</p>{data.redemption ? <div className="mt-3"><Check className="mx-auto text-primary-500" size={30} /><h2 className="font-display text-2xl font-bold uppercase">{data.redemption.redeemedAt ? "Visit confirmed" : "Ready to show"}</h2>{data.redemption.qrDataUrl && !data.redemption.redeemedAt && <SafeImage src={data.redemption.qrDataUrl} alt={`QR code for ${data.redemption.redemptionCode}`} className="mx-auto my-3 w-52 border-2 border-ink" />}<p className="font-mono text-xl font-semibold tracking-wider">{data.redemption.redemptionCode}</p><p className="mt-2 text-xs text-ink/55">{data.redemption.redeemedAt ? "The merchant confirmed your visit and unlocked one points-wheel spin." : "Show this QR/code to the restaurant. When they verify it, one points-wheel spin unlocks."}</p></div> : <div className="mt-3"><h2 className="font-display text-2xl font-bold uppercase">Get your QR proof</h2><p className="mt-2 text-sm text-ink/65">Claim this offer in the app, then show the QR/code at the venue. Merchant verification unlocks one spin.</p><button onClick={() => void claim()} disabled={busy === "claim"} className="btn-primary mt-5 w-full">{busy === "claim" ? "Claiming..." : "Claim offer"}</button></div>}<a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-mustard mt-4 w-full"><Navigation size={18} />Navigate <ExternalLink size={14} /></a></div>
        <p className="mt-4 text-center font-mono text-[10px] uppercase text-ink/50">Always confirm offer details with the restaurant</p>
      </aside>
    </div>
    {notice && <button onClick={() => setNotice("")} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border-2 border-ink bg-ink px-4 py-3 text-sm font-semibold text-white shadow-ticket md:bottom-6">{notice}</button>}
  </div>;
}

function OfferPhotoGallery({ deal }: { deal: Deal }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activePhotoRef = useRef(0);
  const [activePhoto, setActivePhoto] = useState(0);
  const itemPhotos = (deal.offerMenuItems ?? []).flatMap(({ menuItem }) => menuItem.photoUrl ? [{ src: menuItem.photoUrl, label: menuItem.name }] : []);
  const candidates = deal.offerType === "set_menu"
    ? [...itemPhotos, ...(deal.photoUrl ? [{ src: deal.photoUrl, label: deal.title }] : [])]
    : [...(deal.photoUrl ? [{ src: deal.photoUrl, label: deal.title }] : []), ...itemPhotos];
  if (!candidates.length && deal.restaurant.photoUrl) candidates.push({ src: deal.restaurant.photoUrl, label: deal.restaurant.name });
  const photos = [...new Map(candidates.map((photo) => [photo.src, photo])).values()];

  const goToPhoto = useCallback((index: number) => {
    const next = (index + photos.length) % photos.length;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    trackRef.current?.scrollTo({ left: next * trackRef.current.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    activePhotoRef.current = next;
    setActivePhoto(next);
  }, [photos.length]);

  useEffect(() => {
    if (photos.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const autoplay = window.setInterval(() => goToPhoto(activePhotoRef.current + 1), 3_000);
    return () => window.clearInterval(autoplay);
  }, [goToPhoto, photos.length]);

  if (!photos.length) return <SafeImage alt={`${deal.restaurant.name} offer`} className="h-full w-full object-cover" />;

  return <>
    <div ref={trackRef} onScroll={(event) => { const width = event.currentTarget.clientWidth; if (width) { const next = Math.round(event.currentTarget.scrollLeft / width); activePhotoRef.current = next; setActivePhoto(next); } }} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto">
      {photos.map((photo, index) => <figure key={photo.src} className="relative h-full w-full shrink-0 snap-center overflow-hidden bg-ink"><SafeImage src={photo.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl" /><SafeImage src={photo.src} alt={`${photo.label} photo ${index + 1}`} className="relative h-full w-full object-contain" />{photos.length > 1 && <figcaption className="absolute left-1/2 top-16 z-20 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-white/25 bg-ink/95 px-4 py-2 text-center text-sm font-bold text-white shadow-xl backdrop-blur-md sm:top-5">{photo.label}</figcaption>}</figure>)}
    </div>
    {photos.length > 1 && <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/30 bg-ink/90 p-1.5 text-white shadow-xl backdrop-blur-md">
      <button type="button" onClick={() => goToPhoto(activePhoto - 1)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/15" aria-label="Previous offer photo"><ChevronLeft size={18} /></button>
      <div className="flex items-center gap-2 px-1" role="group" aria-label={`Offer photos, showing ${activePhoto + 1} of ${photos.length}`}>
        {photos.map((photo, index) => <button key={photo.src} type="button" onClick={() => goToPhoto(index)} aria-label={`Show ${photo.label} photo ${index + 1}`} aria-current={activePhoto === index ? "true" : undefined} className={`h-2.5 rounded-full border border-white/70 transition-all ${activePhoto === index ? "w-7 bg-white" : "w-2.5 bg-white/35 hover:bg-white/70"}`} />)}
      </div>
      <button type="button" onClick={() => goToPhoto(activePhoto + 1)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/15" aria-label="Next offer photo"><ChevronRight size={18} /></button>
    </div>}
  </>;
}

function offerLabel(deal: Deal) {
  if ((deal.offerType ?? "discount") === "discount" && deal.discountPct != null) return `${deal.discountPct}% off`;
  return (deal.offerType ?? "offer").replaceAll("_", " ");
}

function offerBadge(deal: Deal) {
  if ((deal.offerType ?? "discount") === "discount" && deal.discountPct != null) return { main: `${deal.discountPct}%`, sub: "OFF" };
  return { main: (deal.offerType ?? "offer").replaceAll("_", " "), sub: "OFFER" };
}

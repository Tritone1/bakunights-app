import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clock3,
  Heart,
  MapPin,
  Navigation,
  ShieldCheck,
  Star,
  TicketCheck,
  UsersRound,
  Upload,
} from "lucide-react";
import { SafeImage } from "./SafeImage";
import { loadGoogleMaps } from "../lib/googleMaps";

export interface Venue {
  id: number;
  name: string;
  category: string;
  mealPeriods: string[];
  rating: number;
  reviews: number;
  address: string;
  distance: string;
  image: string;
  deal: string;
  dealTag: string;
  dealColor: string;
  open: string;
  tags: string[];
  lat: number;
  lng: number;
  priceRange: string;
}

export interface OfferPhoto {
  src: string;
  label: string;
}

export interface OfferDetailPageProps {
  venue: Venue;
  onBack: () => void;
  expiresAt?: string;
  photos?: OfferPhoto[];
  initiallySaved?: boolean;
  initiallyFollowed?: boolean;
  initiallyConfirmed?: boolean;
  confirmationCode?: string;
  qrCodeUrl?: string;
  onSaveChange?: (saved: boolean) => void | Promise<void>;
  onFollowChange?: (followed: boolean) => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onSubmitRating?: (rating: number) => void | Promise<void>;
  onConfirmVisit?: () => void | Promise<void>;
}

export function OfferDetailPage({
  venue,
  onBack,
  expiresAt,
  photos,
  initiallySaved = false,
  initiallyFollowed = false,
  initiallyConfirmed = false,
  confirmationCode,
  qrCodeUrl,
  onSaveChange,
  onFollowChange,
  onShare,
  onSubmitRating,
  onConfirmVisit,
}: OfferDetailPageProps) {
  const [saved, setSaved] = useState(initiallySaved);
  const [followed, setFollowed] = useState(initiallyFollowed);
  const [rating, setRating] = useState(0);
  const [confirmed, setConfirmed] = useState(initiallyConfirmed);
  const [claimed, setClaimed] = useState(Boolean(confirmationCode));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const countdown = useCountdown(expiresAt);
  const gallery = useMemo(() => {
    const supplied = photos?.filter((photo) => photo.src) ?? [];
    const candidates = supplied.length ? supplied : [{ src: venue.image, label: venue.name }];
    return [...new Map(candidates.map((photo) => [photo.src, photo])).values()];
  }, [photos, venue.image, venue.name]);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (gallery.length <= 1) return;
    const timer = window.setInterval(() => setActivePhoto((current) => (current + 1) % gallery.length), 3_000);
    return () => window.clearInterval(timer);
  }, [gallery.length]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => setSaved(initiallySaved), [initiallySaved]);
  useEffect(() => setFollowed(initiallyFollowed), [initiallyFollowed]);
  useEffect(() => setConfirmed(initiallyConfirmed), [initiallyConfirmed]);
  useEffect(() => setClaimed(Boolean(confirmationCode)), [confirmationCode]);

  const percent = venue.dealTag.match(/(\d+)%/)?.[1];
  const badgeMain = percent ? `${percent}%` : venue.dealTag.split(/\s+/)[0]?.toUpperCase().slice(0, 4) || "DEAL";
  const badgeSub = percent ? "OFF" : venue.dealTag.split(/\s+/)[1]?.toUpperCase() || "OFFER";
  const code = confirmationCode || `WTG-${venue.id.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    try { await onSaveChange?.(next); }
    catch (reason) { setSaved(!next); setNotice(errorMessage(reason, "Could not update saved offer.")); }
  }

  async function toggleFollow() {
    const next = !followed;
    setFollowed(next);
    try { await onFollowChange?.(next); }
    catch (reason) { setFollowed(!next); setNotice(errorMessage(reason, "Could not update followed venue.")); }
  }

  async function shareOffer() {
    try {
      if (onShare) await onShare();
      else if (navigator.share) await navigator.share({ title: `${venue.dealTag} at ${venue.name}`, text: venue.deal, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setNotice("Offer link copied."); }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setNotice(errorMessage(reason, "Could not share this offer."));
    }
  }

  async function submitRating() {
    if (!rating) return;
    setBusy("rating");
    try { await onSubmitRating?.(rating); setNotice("Rating saved. Thanks for keeping offers honest."); }
    catch (reason) { setNotice(errorMessage(reason, "Could not save your rating.")); }
    finally { setBusy(""); }
  }

  async function confirmVisit() {
    setBusy("confirm");
    try {
      await onConfirmVisit?.();
      if (onConfirmVisit) { setClaimed(true); setNotice("QR proof created. Show it to the merchant to confirm your visit."); }
      else { setClaimed(true); setConfirmed(true); setNotice("Visit confirmed successfully."); }
    }
    catch (reason) { setNotice(errorMessage(reason, "Could not confirm your visit.")); }
    finally { setBusy(""); }
  }

  return <main className="min-h-screen bg-night pb-12 text-white">
    <section className="mx-auto max-w-6xl px-4 pt-20 lg:px-8">
      <div className="grid overflow-hidden rounded-3xl border border-white/[.09] bg-card shadow-2xl shadow-black/30 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="relative h-60 overflow-hidden border-b border-white/[.08] bg-[#0d0d14] sm:h-72 lg:h-[300px] lg:border-b-0 lg:border-r">
          <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${activePhoto * 100}%)` }}>
            {gallery.map((photo, index) => <div key={photo.src} className="h-full min-w-full bg-[#0d0d14]">
              <SafeImage src={photo.src} alt={`${photo.label} photo ${index + 1}`} className="h-full w-full object-contain" />
            </div>)}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          <button type="button" onClick={onBack} className="glass absolute left-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition hover:border-amber-400/50 hover:text-amber-400" aria-label="Go back"><ArrowLeft size={17} />Back</button>
          {gallery.length > 1 && <div className="glass absolute bottom-4 left-4 z-30 max-w-[calc(100%-2rem)] rounded-xl px-3 py-2.5">
            <p className="max-w-52 truncate text-xs font-bold text-white">{gallery[activePhoto]?.label}</p>
            <div className="mt-2 flex gap-2" role="group" aria-label={`Offer photos, showing ${activePhoto + 1} of ${gallery.length}`}>
              {gallery.map((photo, index) => <button key={photo.src} type="button" onClick={() => setActivePhoto(index)} aria-label={`Show ${photo.label} photo ${index + 1}`} aria-current={activePhoto === index ? "true" : undefined} className={`h-2 rounded-full transition-all ${activePhoto === index ? "w-7 bg-amber-400" : "w-2 bg-white/40 hover:bg-white/70"}`} />)}
            </div>
          </div>}
        </div>

        <div className="relative flex min-h-56 flex-col justify-end p-5 sm:p-7 lg:min-h-0">
          <div className="absolute right-5 top-5 flex items-start gap-3">
            <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.16em] shadow-lg" style={{ backgroundColor: venue.dealColor }}>{venue.dealTag}</span>
            <div className="glass grid h-16 w-16 place-items-center rounded-2xl border-amber-400/70 text-center">
              <span className="font-display text-xl font-semibold leading-none text-amber-400">{badgeMain}<small className="mt-1 block font-sans text-[9px] font-extrabold tracking-[.18em] text-white">{badgeSub}</small></span>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 pr-28">
            <span className="rounded-full border border-white/15 bg-white/[.07] px-3 py-1 text-xs font-bold">{venue.category}</span>
            {venue.mealPeriods.map((period) => <span key={period} className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">{period}</span>)}
          </div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">{venue.name}</h1>
          <p className="mt-1.5 text-sm leading-5 text-[#b3b3c8] sm:text-base sm:leading-6">{venue.deal}</p>
        </div>
      </div>
    </section>

    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:px-8 lg:py-7">
      <div className="space-y-7">
        <section className="grid overflow-hidden rounded-2xl border border-white/[.08] bg-card shadow-2xl shadow-black/20 sm:grid-cols-2" aria-label="Offer details">
          <MetaCell icon={<Clock3 size={19} />} iconClass="bg-red-500/10 text-red-400" label="Offer expires" value={venue.open} detail={<span className="font-mono text-sm font-bold tabular-nums text-red-400">{countdown}</span>} />
          <MetaCell icon={<Star size={19} fill="currentColor" />} iconClass="bg-amber-400/10 text-amber-400" label="Rating" value={`${venue.rating.toFixed(1)}/5.0`} detail={`${venue.reviews.toLocaleString()} ${venue.reviews === 1 ? "review" : "reviews"}`} />
          <MetaCell icon={<span className="text-base font-black">₼</span>} iconClass="bg-amber-400/10 text-amber-400" label="Price range" value={venue.priceRange} valueClass="text-amber-400" />
          <MetaCell icon={<Navigation size={19} />} iconClass="bg-white/[.06] text-white" label="Distance" value={venue.distance} />
        </section>

        <div className="flex flex-wrap gap-2" aria-label="Venue tags">
          {venue.tags.map((tag) => <span key={tag} className="rounded-full border border-white/[.07] bg-white/[.055] px-3 py-1.5 text-xs font-semibold text-[#aaaac0]">{tag}</span>)}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ActionButton active={saved} onClick={() => void toggleSave()} icon={<Bookmark size={18} fill={saved ? "currentColor" : "none"} />} label={saved ? "Saved" : "Save"} />
          <ActionButton active={followed} onClick={() => void toggleFollow()} icon={<Heart size={18} fill={followed ? "currentColor" : "none"} />} label={followed ? "Following" : "Follow"} />
          <ActionButton onClick={() => void shareOffer()} icon={<Upload size={18} />} label="Share" />
        </div>

        <section>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><MapPin size={21} className="text-amber-400" />Find Your Way</h2>
            <p className="text-sm text-muted">{venue.address}</p>
          </div>
          <PremiumVenueMap venue={venue} />
        </section>

        <section className="rounded-2xl border border-white/[.08] bg-card p-6">
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-muted">Rate this offer</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">Was this offer worth it?</h2>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} className="text-amber-400 transition hover:scale-110 focus-visible:scale-110" aria-label={`Rate ${value} stars`}><Star size={31} fill={value <= rating ? "currentColor" : "none"} /></button>)}
            {rating > 0 && <button type="button" onClick={() => void submitRating()} disabled={busy === "rating"} className="ml-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-extrabold text-night transition hover:bg-amber-400 disabled:opacity-55">{busy === "rating" ? "Saving…" : "Submit"}</button>}
          </div>
        </section>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-2xl border border-amber-400/35 bg-gradient-to-b from-amber-400/[.09] to-card p-6 text-center shadow-2xl shadow-black/25">
          <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${confirmed ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-400/15 text-amber-400"}`}>{confirmed ? <Check size={27} strokeWidth={3} /> : <TicketCheck size={26} />}</div>
          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.22em] text-muted">Your proof</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">{confirmed ? "Visit Confirmed" : claimed ? "Ready to Scan" : "Claim Offer"}</h2>
          {claimed && qrCodeUrl && <SafeImage src={qrCodeUrl} alt={`QR proof for ${code}`} className="mx-auto mt-4 w-48 rounded-xl border-4 border-white bg-white p-2" />}
          {claimed && <p className="mx-auto mt-4 w-fit rounded-xl border border-white/10 bg-black/25 px-4 py-2 font-mono text-sm font-bold tracking-[.16em] text-amber-300">{code}</p>}
          {confirmed
            ? <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-3 text-sm font-semibold text-emerald-300">The merchant scanned this proof and confirmed your visit.</p>
            : claimed
              ? <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-sm font-semibold text-amber-200">Show this QR code to the merchant. Their scanner confirms the visit and unlocks your spin.</p>
              : <button type="button" onClick={() => void confirmVisit()} disabled={busy === "confirm"} className="mt-5 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-night transition hover:bg-amber-400 disabled:opacity-55">{busy === "confirm" ? "Creating QR…" : "Claim & Show QR"}</button>}
        </section>

        <section className="divide-y divide-white/[.07] rounded-2xl border border-white/[.08] bg-card px-5">
          <QuickInfo icon={<ShieldCheck size={19} />} label={venue.category} />
          <QuickInfo icon={<UsersRound size={19} />} label={`${venue.reviews.toLocaleString()} ${venue.reviews === 1 ? "visitor" : "visitors"}`} />
          <QuickInfo icon={<Star size={19} />} label={venue.priceRange} />
        </section>

        <p className="px-5 text-center text-[10px] uppercase leading-5 tracking-[.13em] text-muted">Always confirm offer details with the restaurant before ordering.</p>
      </aside>
    </div>

    {notice && <button type="button" onClick={() => setNotice("")} className="fixed bottom-6 left-1/2 z-[160] -translate-x-1/2 rounded-xl border border-white/15 bg-[#181821] px-5 py-3 text-sm font-semibold text-white shadow-2xl">{notice}</button>}
  </main>;
}

function PremiumVenueMap({ venue }: { venue: Venue }) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || "DEMO_MAP_ID";
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`;

  useEffect(() => {
    if (!apiKey || !containerRef.current) { setStatus("failed"); return; }
    let cancelled = false;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const handleAuthFailure = () => { if (!cancelled) setStatus("failed"); };
    window.gm_authFailure = handleAuthFailure;
    setStatus("loading");

    void loadGoogleMaps(apiKey).then(async () => {
      if (cancelled || !containerRef.current) return;
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelled || !containerRef.current) return;
      const map = new Map(containerRef.current, {
        center: { lat: venue.lat, lng: venue.lng },
        zoom: 15,
        mapId,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      const pin = document.createElement("div");
      pin.className = "grid h-11 w-11 place-items-center rounded-full border-[3px] border-night bg-amber-500 text-sm font-black text-night shadow-2xl";
      pin.textContent = "WTG";
      marker = new AdvancedMarkerElement({ map, position: { lat: venue.lat, lng: venue.lng }, title: venue.name, content: pin });
      setStatus("ready");
    }).catch((reason: unknown) => {
      console.error("WhereToGo offer map failed:", reason);
      if (!cancelled) setStatus("failed");
    });

    return () => {
      cancelled = true;
      if (marker) marker.map = null;
      if (window.gm_authFailure === handleAuthFailure) window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey, mapId, venue.lat, venue.lng, venue.name]);

  const bbox = `${venue.lng - 0.02}%2C${venue.lat - 0.012}%2C${venue.lng + 0.02}%2C${venue.lat + 0.012}`;
  const openStreetMapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${venue.lat}%2C${venue.lng}`;

  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
    <div className="relative h-60 bg-[#0d0d15]">
      {status === "failed"
        ? <><iframe title={`Map showing ${venue.name}`} src={openStreetMapUrl} className="dark-map h-full w-full border-0" loading="eager" referrerPolicy="no-referrer-when-downgrade" /><span className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/75 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white/70">OpenStreetMap fallback</span></>
        : <><div ref={containerRef} className="h-full w-full" aria-label="Google map of offer venue" />{status === "loading" && <div className="absolute inset-0 grid place-items-center bg-card text-xs font-bold uppercase tracking-[.16em] text-muted">Loading Google Maps…</div>}</>}
    </div>
    <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 bg-amber-500 px-4 py-3.5 text-sm font-extrabold text-[#09090e] transition hover:bg-amber-400"><Navigation size={17} />Open in Google Maps</a>
  </div>;
}

function MetaCell({ icon, iconClass, label, value, detail, valueClass = "text-white" }: { icon: React.ReactNode; iconClass: string; label: string; value: string; detail?: React.ReactNode; valueClass?: string }) {
  return <div className="flex min-h-28 items-center gap-4 border-b border-white/[.07] p-5 last:border-b-0 sm:even:border-l sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0">
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconClass}`}>{icon}</span>
    <span className="min-w-0"><span className="block text-[10px] font-extrabold uppercase tracking-[.17em] text-muted">{label}</span><strong className={`mt-1 block text-base ${valueClass}`}>{value}</strong>{detail && <span className="mt-1 block text-xs text-muted">{detail}</span>}</span>
  </div>;
}

function ActionButton({ active = false, onClick, icon, label }: { active?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${active ? "border-amber-400 bg-amber-500 text-night" : "border-white/[.07] bg-white/[.055] text-[#c4c4d2] hover:border-amber-400/35 hover:text-amber-300"}`}>{icon}<span>{label}</span></button>;
}

function QuickInfo({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-3 py-4 text-sm font-semibold text-[#c4c4d2]"><span className="text-amber-400">{icon}</span>{label}</div>;
}

function useCountdown(expiresAt?: string) {
  const target = useMemo(() => {
    if (expiresAt) return new Date(expiresAt).getTime();
    const fallback = new Date();
    fallback.setHours(23, 59, 59, 999);
    return fallback.getTime();
  }, [expiresAt]);
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, target - Date.now()));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [target]);

  const totalSeconds = Math.floor(remaining / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export default OfferDetailPage;

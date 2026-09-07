import { useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, CheckCircle2, Clock3, MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import type { Deal } from "../types";
import { SafeImage } from "./SafeImage";

type DealPhoto = { src: string; label: string };

export function DealCard({ deal, onSave, saved = false }: { deal: Deal; onSave?: (deal: Deal) => void; saved?: boolean }) {
  const badge = offerBadge(deal);
  const photos = dealPhotos(deal);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => setActivePhoto(0), [deal.id]);
  useEffect(() => {
    if (photos.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActivePhoto((current) => (current + 1) % photos.length), 3_000);
    return () => window.clearInterval(timer);
  }, [photos.length]);

  return <article className="group relative flex h-full min-h-[470px] flex-col overflow-hidden rounded-3xl border border-white/[0.09] bg-[#12121c] text-white shadow-[0_22px_65px_rgba(0,0,0,.3)] transition duration-300 hover:-translate-y-1 hover:border-amber-400/30 hover:shadow-[0_26px_75px_rgba(0,0,0,.42)]">
    <Link to={`/deals/${deal.id}`} className="flex h-full flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400">
      <div className="relative h-56 overflow-hidden bg-[#191923]">
        {photos.length ? <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${activePhoto * 100}%)` }}>
          {photos.map((photo) => <SafeImage key={photo.src} src={photo.src} alt={photo.label} className="h-full min-w-full object-cover transition duration-700 group-hover:scale-[1.025]" />)}
        </div> : <SafeImage alt={`${deal.restaurant.name} offer`} className="h-full w-full" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#12121c] via-transparent to-black/25" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.18em] text-white backdrop-blur-md">{deal.tag || "All day"}</span>
          {deal.isFlash && <span className="rounded-full bg-red-500 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.18em] text-white shadow-lg">Flash</span>}
        </div>
        <div className="absolute bottom-4 right-4 rounded-2xl border border-amber-300/35 bg-[#0b0b11]/85 px-3.5 py-2 text-right shadow-xl backdrop-blur-md">
          <strong className="block font-display text-xl font-bold leading-none text-amber-300">{badge.main}</strong>
          <span className="mt-1 block text-[8px] font-black uppercase tracking-[.2em] text-white/65">{badge.sub}</span>
        </div>
        {photos.length > 1 && <div className="absolute bottom-5 left-4 flex items-center gap-1.5" aria-label={`${photos.length} offer photos`}>
          {photos.map((photo, index) => <span key={photo.src} className={`h-1.5 rounded-full shadow-sm transition-all duration-300 ${index === activePhoto ? "w-6 bg-amber-400" : "w-1.5 bg-white/50"}`} />)}
        </div>}
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-400">{deal.restaurant.cuisine || "Venue"}</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-semibold text-white/75">{deal.restaurant.name}{deal.restaurant.isVerifiedTrusted && <CheckCircle2 size={15} className="shrink-0 text-emerald-400" aria-label="Trusted venue" />}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1.5 text-xs font-bold text-white"><Star size={13} fill="#f59e0b" stroke="#f59e0b" />{deal.dealRating?.toFixed(1) ?? (deal.restaurant.rating ?? 0).toFixed(1)}</span>
        </div>
        <h2 className="mt-4 font-display text-[27px] font-semibold leading-[1.08] tracking-tight text-white">{deal.title}</h2>
        {deal.menuItem && <p className="mt-2 text-sm font-semibold text-amber-200">{deal.menuItem}</p>}
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#9999b3]">{deal.description}</p>

        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[0.08] pt-4 text-[10px] font-bold uppercase tracking-[.08em] text-white/50">
          <span className="flex items-center gap-1.5"><MapPin size={13} className="text-amber-400" />{deal.distanceMiles != null ? `${deal.distanceMiles.toFixed(1)} mi` : deal.restaurant.address.split(",")[0]}</span>
          <span className="flex items-center gap-1.5"><Clock3 size={13} className="text-red-400" />Ends in {formatDistanceToNowStrict(new Date(deal.endsAt))}</span>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 self-start text-xs font-black uppercase tracking-[.15em] text-amber-400 transition group-hover:gap-2">View offer <ArrowUpRight size={15} /></span>
      </div>
    </Link>
    {onSave && <button onClick={() => onSave(deal)} className={`absolute right-4 top-16 z-10 grid h-10 w-10 place-items-center rounded-full border shadow-lg backdrop-blur-md transition ${saved ? "border-amber-300 bg-amber-400 text-[#09090e]" : "border-white/20 bg-black/55 text-white hover:border-amber-300 hover:text-amber-300"}`} aria-label={saved ? "Remove saved deal" : "Save deal"}><Bookmark size={17} fill={saved ? "currentColor" : "none"} /></button>}
  </article>;
}

function dealPhotos(deal: Deal): DealPhoto[] {
  const candidates = [
    ...(deal.photoUrl ? [{ src: deal.photoUrl, label: deal.title }] : []),
    ...(deal.offerMenuItems ?? []).flatMap(({ menuItem }) => menuItem.photoUrl ? [{ src: menuItem.photoUrl, label: menuItem.name }] : []),
    ...(deal.restaurant.photoUrl ? [{ src: deal.restaurant.photoUrl, label: deal.restaurant.name }] : []),
  ];
  return [...new Map(candidates.map((photo) => [photo.src, photo])).values()];
}

function offerBadge(deal: Deal) {
  if ((deal.offerType ?? "discount") === "discount" && deal.discountPct != null) return { main: `${deal.discountPct}%`, sub: "Off" };
  const label = (deal.offerType ?? "offer").replaceAll("_", " ");
  return { main: label, sub: "Offer" };
}

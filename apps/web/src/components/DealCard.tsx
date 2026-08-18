import { Bookmark, CheckCircle2, Clock3, MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import type { Deal } from "../types";
import { SafeImage } from "./SafeImage";

export function DealCard({ deal, onSave, saved = false }: { deal: Deal; onSave?: (deal: Deal) => void; saved?: boolean }) {
  const badge = offerBadge(deal);
  return <article className="ticket group overflow-hidden rounded-xl transition hover:-translate-y-1">
    <Link to={`/deals/${deal.id}`} className="block">
      <div className="relative h-44 overflow-hidden bg-primary-50 sm:h-48">
        <SafeImage src={deal.photoUrl || deal.restaurant.photoUrl || undefined} alt={`${deal.restaurant.name} offer`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute left-3 top-3 border-2 border-ink bg-accent-500 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-white">{deal.tag}</span>
        <div className="stamp absolute -right-1 -top-2 flex h-[92px] w-[92px] items-center justify-center rounded-full text-center text-white drop-shadow-md">
          <span className="relative px-2 font-display text-[22px] font-bold uppercase leading-none">{badge.main}<small className="block text-[10px] tracking-widest">{badge.sub}</small></span>
        </div>
      </div>
      <div className="px-5 pb-4 pt-4">
        <div className="mb-2 flex items-center justify-between gap-3"><p className="eyebrow text-primary-500">{deal.restaurant.cuisine}</p><span className="flex items-center gap-1 text-xs font-semibold"><Star size={14} fill="#e67e35" stroke="#e67e35" />{(deal.restaurant.rating ?? 0).toFixed(1)}</span></div>
        <h2 className="font-display text-2xl font-bold uppercase leading-tight">{deal.title}</h2>
        {deal.menuItem && <p className="mt-1 text-sm font-semibold text-primary-500">For: {deal.menuItem}</p>}
        <p className="mt-1 flex items-center gap-1 font-semibold">{deal.restaurant.name}{deal.restaurant.isVerifiedTrusted && <span title="Trusted venue: strong redemption history"><CheckCircle2 size={16} className="text-primary-500" /></span>}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-ink/15 pt-3 font-mono text-[11px] font-medium uppercase text-ink/65">
          <span className="flex items-center gap-1"><MapPin size={13} />{deal.distanceMiles != null ? `${deal.distanceMiles.toFixed(1)} mi` : deal.restaurant.address.split(",")[0]}</span>
          <span className="flex items-center gap-1"><Clock3 size={13} />Ends in {formatDistanceToNowStrict(new Date(deal.endsAt))}</span>
        </div>
      </div>
    </Link>
    {onSave && <button onClick={() => onSave(deal)} className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-cream transition hover:bg-accent-500 hover:text-white" aria-label={saved ? "Remove saved deal" : "Save deal"}><Bookmark size={18} fill={saved ? "#2e5ba8" : "none"} stroke={saved ? "#2e5ba8" : "currentColor"} /></button>}
  </article>;
}

function offerBadge(deal: Deal) {
  if ((deal.offerType ?? "discount") === "discount" && deal.discountPct != null) return { main: `${deal.discountPct}%`, sub: "OFF" };
  const label = (deal.offerType ?? "offer").replaceAll("_", " ");
  return { main: label, sub: "OFFER" };
}

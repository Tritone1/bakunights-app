import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { AuthPage } from "./pages/AuthPage";
import { DealCard } from "./components/DealCard";
import { DealDetailPage } from "./pages/DealDetailPage";
import { MerchantPage } from "./pages/MerchantPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SavedPage } from "./pages/SavedPage";
import { VenuePage } from "./pages/VenuePage";
import { api } from "./lib/api";
import { useAuth } from "./context/AuthContext";
import type { Deal } from "./types";
import { SafeImage } from "./components/SafeImage";
import { DailyPointsWheel } from "./components/DailyPointsWheel";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { Reveal } from "./components/Reveal";
import { ArrowLeft, Home } from "lucide-react";
import { loadGoogleMaps } from "./lib/googleMaps";

type Category = "Restaurants" | "Bars" | "Pubs" | "Lounges";

type Venue = {
  id: string;
  dealId?: string;
  name: string;
  category: Category;
  rating: number;
  reviews: number;
  address: string;
  distance: string;
  deal: string;
  dealTag: string;
  dealColor: string;
  open: string;
  tags: string[];
  lat: number;
  lng: number;
  priceRange: string;
  image: string;
};

type HomepageRestaurant = {
  id: string; name: string; address: string; cuisine: string; dietaryTags: string[];
  lat: number; lng: number; phone?: string | null; photoUrl?: string | null; rating: number;
  liveDeal?: Deal | null;
};

type HomepageStats = { activeVenues: number; liveDeals: number; areas: number };

type UserPosition = {
  lat: number;
  lng: number;
  accuracy: number;
};

type LocationStatus = "locating" | "ready" | "denied" | "unavailable";
type TravelMode = "transit" | "walking" | "driving";

type InAppRouteState = {
  status: "idle" | "loading" | "active" | "failed";
  mode?: TravelMode;
  distanceMeters?: number;
  durationSeconds?: number;
  message?: string;
};

const IMAGES = {
  restaurant: "https://images.unsplash.com/photo-1709548145082-04d0cde481d4?w=600&h=400&fit=crop",
  cocktail: "https://images.unsplash.com/photo-1597075687490-8f673c6c17f6?w=600&h=400&fit=crop",
  pub: "https://images.unsplash.com/photo-1578911489158-334e5cd2a051?w=600&h=400&fit=crop",
  lounge: "https://images.unsplash.com/photo-1615887584283-91f1be7fdc34?w=600&h=400&fit=crop",
};

const CATEGORIES = ["All", "Restaurants", "Bars", "Pubs", "Lounges"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

function venueCategory(cuisine: string): Category {
  const value = cuisine.toLowerCase();
  if (value.includes("lounge")) return "Lounges";
  if (value.includes("pub")) return "Pubs";
  if (value.includes("bar")) return "Bars";
  return "Restaurants";
}

function fallbackImage(category: Category) {
  if (category === "Bars") return IMAGES.cocktail;
  if (category === "Pubs") return IMAGES.pub;
  if (category === "Lounges") return IMAGES.lounge;
  return IMAGES.restaurant;
}

function toVenue(restaurant: HomepageRestaurant, origin: UserPosition | null): Venue {
  const category = venueCategory(restaurant.cuisine);
  const deal = restaurant.liveDeal;
  const endTime = deal?.endsAt ? new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(deal.endsAt)) : null;
  return {
    id: restaurant.id,
    dealId: deal?.id,
    name: restaurant.name,
    category,
    rating: restaurant.rating || deal?.dealRating || 0,
    reviews: deal?.ratingCount ?? 0,
    address: restaurant.address,
    distance: origin ? `${distanceKm(origin, restaurant).toFixed(1)} km` : "Location needed",
    deal: deal?.title ?? "No live offer right now",
    dealTag: deal?.tag?.toUpperCase() ?? "VENUE",
    dealColor: category === "Bars" ? "#ec4899" : category === "Pubs" ? "#10b981" : category === "Lounges" ? "#8b5cf6" : "#f59e0b",
    open: endTime ? `Offer ends ${endTime}` : "No current offer",
    tags: [restaurant.cuisine, ...(restaurant.dietaryTags ?? [])].filter(Boolean).slice(0, 4),
    lat: restaurant.lat,
    lng: restaurant.lng,
    priceRange: "",
    image: restaurant.photoUrl || deal?.photoUrl || fallbackImage(category),
  };
}

type IconName = "search" | "pin" | "bookmark" | "arrow" | "location" | "clock" | "chevron" | "spark" | "car" | "bus" | "walk" | "copy" | "close";

function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    location: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    spark: <><path d="m12 2 1.4 5.6L19 9l-5.6 1.4L12 16l-1.4-5.6L5 9l5.6-1.4L12 2Z" /><path d="m5 15 .8 3.2L9 19l-3.2.8L5 23l-.8-3.2L1 19l3.2-.8L5 15Z" /></>,
    car: <><path d="m5 17-1.5-1.5V11l2-5h13l2 5v4.5L19 17" /><path d="M5 11h14M7 17v2M17 17v2" /><circle cx="7" cy="14" r="1" /><circle cx="17" cy="14" r="1" /></>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3" /><path d="M5 10h14M8 19v2M16 19v2" /><circle cx="8.5" cy="15" r="1" /><circle cx="15.5" cy="15" r="1" /></>,
    walk: <><circle cx="13" cy="4" r="2" /><path d="m10 22 2-7-3-3 2-5 4 3 3 1M12 15l4 3 1 4M9 12l-4 3" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function countdownToDate(targetDate: string) {
  const now = new Date();
  const target = new Date(targetDate);
  const seconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function useCountdown(targetDate: string) {
  const [countdown, setCountdown] = useState(() => countdownToDate(targetDate));
  useEffect(() => {
    const interval = window.setInterval(() => setCountdown(countdownToDate(targetDate)), 1000);
    return () => window.clearInterval(interval);
  }, [targetDate]);
  return countdown;
}

function SearchBox({ value, onChange, mobile = false }: { value: string; onChange: (value: string) => void; mobile?: boolean }) {
  return <label className={`relative block ${mobile ? "lg:hidden" : "hidden w-full max-w-md lg:block"}`}>
    <span className="sr-only">Search venues</span>
    <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
    <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-full border border-white/10 bg-white/[0.055] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-muted focus:border-gold/60 focus:bg-white/[0.08]" placeholder="Search venues, vibes, or districts…" />
  </label>;
}

function Navigation({ query, setQuery, onLocationClick, locationLabel }: { query: string; setQuery: (value: string) => void; onLocationClick: () => void; locationLabel: string }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-night/80 backdrop-blur-2xl">
    <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-7 px-5 sm:px-8">
      <a href="#top" className="flex shrink-0 items-center gap-3" aria-label="WhereToGo home">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold text-night shadow-[0_0_28px_rgba(245,158,11,.25)]"><WhereToGoMark /></span>
        <span className="hidden text-lg font-bold tracking-tight sm:inline sm:text-xl">Where<span className="text-gold">ToGo</span></span>
      </a>
      <div className="flex flex-1 justify-center"><SearchBox value={query} onChange={setQuery} /></div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {!user && <><Link to="/login/customer" className="inline-flex rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-2 text-[10px] font-semibold text-white transition hover:border-gold/40 hover:text-gold sm:px-3.5 sm:text-xs"><span className="sm:hidden">Customer</span><span className="hidden sm:inline">Customer login</span></Link><Link to="/login/merchant" className="inline-flex rounded-full border border-gold/25 bg-gold/10 px-2.5 py-2 text-[10px] font-semibold text-gold transition hover:bg-gold hover:text-night sm:px-3.5 sm:text-xs"><span className="sm:hidden">Merchant</span><span className="hidden sm:inline">Merchant login</span></Link></>}
        <LanguageSwitcher />
        <button type="button" onClick={onLocationClick} className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.055] text-xs font-semibold text-white transition hover:border-gold/40 hover:text-gold sm:h-auto sm:w-auto sm:max-w-44 sm:px-3.5 sm:py-2" title={`Choose your location (${locationLabel})`} aria-label={`Choose your location. Current: ${locationLabel}`}><Icon name="location" size={15} className="shrink-0 text-gold" /><span className="hidden truncate sm:block">{locationLabel}</span><Icon name="chevron" size={14} className="hidden shrink-0 text-muted sm:block" /></button>
        {user && <div className="relative"><button type="button" onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full border border-gold/30 bg-gradient-to-br from-gold to-amber-700 text-sm font-bold text-night shadow-[0_0_20px_rgba(245,158,11,.18)]" aria-label="Open account menu" aria-expanded={menuOpen}>{user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</button>{menuOpen && <div className="absolute right-0 top-12 w-52 rounded-2xl border border-white/10 bg-[#15151e] p-2 shadow-2xl"><p className="px-3 py-2 text-xs text-white/45">{user.email}</p>{user.role === "CONSUMER" && <><Link to="/profile" className="block rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">Profile</Link><Link to="/saved" className="block rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">Saved deals</Link></>}{user.role === "MERCHANT" && <Link to="/merchant" className="block rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">Merchant dashboard</Link>}{user.role === "ADMIN" && <Link to="/admin" className="block rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">Admin dashboard</Link>}<button type="button" onClick={() => void logout()} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10">Log out</button></div>}</div>}
      </div>
    </div>
  </header>;
}

function WhereToGoMark() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7" fill="none"><path d="M16 30S26 20.3 26 11.8a10 10 0 1 0-20 0C6 20.3 16 30 16 30Z" fill="currentColor" /><path d="M12.2 7v6.2m2.2-6.2v6.2m-4.4-3h4.4m-2.2 3v5.2M20.4 7c-2 0-3.2 1.8-3.2 4s1.2 4 3.2 4m0-8v11.4" stroke="#09090e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Hero({ stats }: { stats: HomepageStats }) {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return <section id="top" className="relative isolate min-h-[calc(100svh-72px)] overflow-hidden border-b border-white/[0.07] sm:min-h-[680px] lg:min-h-[720px]">
    <picture className="absolute inset-0 -z-20">
      <source media="(min-width: 768px)" srcSet="/wheretogo-hero-wide.png" />
      <SafeImage src="/wheretogo-hero.png" alt="WhereToGo — great food and great deals every day" className="h-full w-full object-cover object-center" />
    </picture>
    <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(9,9,14,.1)_0%,transparent_38%,rgba(9,9,14,.12)_62%,rgba(9,9,14,.94)_100%)]" />
    <div className="mx-auto flex min-h-[calc(100svh-72px)] max-w-[1400px] items-end px-5 py-8 sm:min-h-[680px] sm:px-8 sm:py-10 lg:min-h-[720px]">
      <div className="w-full">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-night/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-amber-100 shadow-lg backdrop-blur-md"><span className="deal-pulse h-2 w-2 rounded-full bg-gold shadow-[0_0_12px_#f59e0b]" />Live · {today}</div>
        <div className="flex flex-wrap gap-3">
          <Stat value={String(stats.activeVenues)} label="Active venues" />
          <Stat value={String(stats.liveDeals)} label="Deals today" accent />
          <Stat value={String(stats.areas)} label="Areas" />
        </div>
      </div>
    </div>
  </section>;
}

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-xs"><strong className={`text-base ${accent ? "text-gold" : "text-white"}`}>{value}</strong><span className="text-white/50">{label}</span></div>;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="mb-7 flex items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.24em] text-gold">{eyebrow}</p><h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2></div>{action}</div>;
}

function FlashDeals({ deals, loading }: { deals: Deal[]; loading: boolean }) {
  return <section className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
    <SectionHeading eyebrow="Limited drops" title="Flash deals" action={<span className="hidden text-xs text-muted sm:block">Scroll to explore <span className="ml-1 text-gold">→</span></span>} />
    {loading ? <div className="rounded-2xl border border-white/[0.08] bg-card p-5 text-sm text-muted">Loading flash deals…</div> : deals.length === 0 ? <div className="rounded-2xl border border-white/[0.08] bg-card p-5 text-sm text-muted">No live flash deals right now.</div> : <div className="no-scrollbar -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-3 sm:-mx-8 sm:px-8 xl:mx-0 xl:px-0">{deals.slice(0, 5).map((deal) => <FlashDealCard key={deal.id} deal={deal} />)}</div>}
  </section>;
}

function FlashDealCard({ deal }: { deal: Deal }) {
  const countdown = useCountdown(deal.endsAt);
  const category = venueCategory(deal.restaurant.cuisine);
  return <Link to={`/deals/${deal.id}`} className="group relative h-[310px] w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
    <SafeImage src={deal.photoUrl || deal.restaurant.photoUrl || fallbackImage(category)} alt={`${deal.restaurant.name} offer`} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[9px] font-extrabold tracking-[.14em] text-white backdrop-blur"><span className="deal-pulse h-1.5 w-1.5 rounded-full bg-white" />FLASH DEAL</span><span className="rounded-lg border border-white/15 bg-black/45 px-2 py-1 font-mono text-xs font-semibold tabular-nums text-white backdrop-blur">{countdown}</span></div>
    <div className="absolute inset-x-0 bottom-0 p-5"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-gold">{category}</p><h3 className="font-display text-2xl font-semibold text-white">{deal.restaurant.name}</h3><p className="mt-1 text-sm text-white/70">{deal.title}</p><div className="mt-4 flex items-center justify-between text-xs"><span className="flex items-center gap-1 text-amber-300"><Star filled />{deal.dealRating?.toFixed(1) ?? "New"}</span>{deal.distanceMiles != null && <span className="text-white/55">{(deal.distanceMiles * 1.60934).toFixed(1)} km</span>}</div></div>
  </Link>;
}

function Star({ filled = true }: { filled?: boolean }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6"><path d="m12 2.8 2.8 5.7 6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3-4.5-4.4 6.3-.9L12 2.8Z" /></svg>;
}

function VenueCard({ venue, saved, onToggleSave, onNavigate }: { venue: Venue; saved: boolean; onToggleSave?: () => void; onNavigate: () => void }) {
  const navigate = useNavigate();
  return <article data-venue-card role="link" tabIndex={0} onClick={() => navigate(`/venues/${venue.id}`)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) navigate(`/venues/${venue.id}`); }} className="group h-full cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-card transition-transform duration-200 hover:-translate-y-1 hover:border-white/[0.13]">
    <div className="relative h-44 overflow-hidden">
      <SafeImage src={venue.image} alt={`${venue.name} atmosphere`} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-card via-black/15 to-transparent" />
      <span className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-[.14em] text-white shadow-lg" style={{ backgroundColor: venue.dealColor }}>{venue.dealTag}</span>
      {onToggleSave && <button onClick={(event) => { event.stopPropagation(); onToggleSave(); }} aria-label={saved ? `Remove ${venue.name} from saved` : `Save ${venue.name}`} className={`absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition ${saved ? "border-gold bg-gold text-night" : "border-white/15 bg-black/35 text-white hover:border-gold hover:text-gold"}`}><Icon name="bookmark" size={16} /></button>}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-4"><p className="mb-1 text-[9px] font-bold uppercase tracking-[.2em] text-gold">{venue.category}</p><h3 className="font-display text-[27px] font-semibold leading-tight text-white">{venue.name}</h3></div>
    </div>
    <div className="p-5 pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="flex items-center gap-0.5 text-gold">{Array.from({ length: 5 }, (_, index) => <Star key={index} filled={index < Math.round(venue.rating)} />)}</span>
        <strong className="text-white">{venue.rating}</strong><span className="text-muted">({venue.reviews})</span><span className="ml-auto tracking-[.15em] text-white/65">{venue.priceRange}</span>
      </div>
      <div className="mt-4 flex items-start gap-2 text-xs text-muted"><Icon name="pin" size={15} className="mt-px shrink-0 text-gold" /><span className="flex-1">{venue.address}</span><strong className="shrink-0 text-gold">{venue.distance}</strong></div>
      <div className="mt-4 flex flex-wrap gap-1.5">{venue.tags.map((tag) => <span key={tag} className="rounded-full border border-white/[0.07] bg-white/[0.035] px-2.5 py-1 text-[10px] text-white/55">{tag}</span>)}</div>
      <div className="my-5 h-px bg-white/[0.07]" />
      <p className="text-sm font-semibold text-white">{venue.deal}</p>
      <div className="mt-4 flex items-center gap-2"><span className="mr-auto flex items-center gap-1.5 text-[11px] text-muted"><Icon name="clock" size={14} />{venue.open}</span><button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(); }} className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-bold text-night transition hover:bg-amber-300" aria-label={`Navigate to ${venue.name} in WhereToGo`}>Navigate me<Icon name="location" size={14} /></button></div>
    </div>
  </article>;
}

function VenueDirectory({ venues, query, setQuery, onNavigate, origin }: { venues: Venue[]; query: string; setQuery: (value: string) => void; onNavigate: (venue: Venue) => void; origin: UserPosition | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saveNotice, setSaveNotice] = useState("");
  useEffect(() => {
    if (!user) { setSaved(new Set()); return; }
    api<{ deals: Deal[] }>("/users/me/saved").then(({ deals }) => setSaved(new Set(deals.map((deal) => deal.id)))).catch(() => setSaveNotice("Saved deals could not be loaded."));
  }, [user]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return venues
      .filter((venue) => (category === "All" || venue.category === category) && (!search || [venue.name, venue.category, venue.address, venue.deal, ...venue.tags].join(" ").toLowerCase().includes(search)))
      .map((venue) => origin ? { ...venue, distance: `${distanceKm(origin, venue).toFixed(1)} km` } : venue)
      .sort((a, b) => origin ? distanceKm(origin, a) - distanceKm(origin, b) : a.name.localeCompare(b.name));
  }, [category, origin, query, venues]);
  async function toggleSaved(dealId: string) {
    if (!user) { navigate("/login/customer?next=/"); return; }
    const wasSaved = saved.has(dealId);
    try {
      await api(`/deals/${dealId}/save`, { method: wasSaved ? "DELETE" : "PUT" });
      setSaved((current) => { const next = new Set(current); if (wasSaved) next.delete(dealId); else next.add(dealId); return next; });
      setSaveNotice("");
    } catch (reason) { setSaveNotice(reason instanceof Error ? reason.message : "Could not update saved deals"); }
  }
  return <section id="venues" className="mx-auto max-w-[1400px] px-5 pb-20 sm:px-8">
    <SectionHeading eyebrow="Curated for tonight" title="Find your next stop" action={<span className="hidden text-xs text-muted sm:block">{filtered.length} venues</span>} />
    <SearchBox value={query} onChange={setQuery} mobile />
    {saveNotice && <p className="mb-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{saveNotice}</p>}
    <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-2 lg:mt-0">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${category === item ? "border-gold bg-gold text-night" : "border-white/[0.08] bg-white/[0.035] text-muted hover:border-white/20 hover:text-white"}`}>{item}</button>)}</div>
    {filtered.length ? <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((venue, index) => <Reveal key={venue.id} delay={Math.min(index, 5) * 100} className="h-full"><VenueCard venue={venue} saved={Boolean(venue.dealId && saved.has(venue.dealId))} onToggleSave={venue.dealId ? () => void toggleSaved(venue.dealId!) : undefined} onNavigate={() => onNavigate(venue)} /></Reveal>)}</div> : <div className="mt-8 grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/10 bg-card/50 text-center"><div><Icon name="search" size={30} className="mx-auto text-gold" /><h3 className="mt-3 font-display text-2xl text-white">No venues found</h3><p className="mt-1 text-sm text-muted">No active venue matches this search yet.</p></div></div>}
  </section>;
}

function mapEmbed(venue: Venue) {
  const delta = 0.009;
  const bbox = [venue.lng - delta, venue.lat - delta * 0.65, venue.lng + delta, venue.lat + delta * 0.65].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${venue.lat}%2C${venue.lng}`;
}

function OpenStreetVenueMap({ venue }: { venue: Venue }) {
  return <iframe key={venue.id} title={`Map showing ${venue.name}`} src={mapEmbed(venue)} className="dark-map h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />;
}

function MapProviderBadge({ children }: { children: ReactNode }) {
  return <span className="glass absolute right-3 top-3 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.14em] text-white/70">{children}</span>;
}

function MapFallbackNotice({ reason }: { reason: string }) {
  return <p className="glass absolute right-3 top-12 z-10 max-w-64 rounded-lg px-3 py-2 text-[10px] leading-4 text-amber-200">{reason} OpenStreetMap is active.</p>;
}

function GoogleVenueMap({ venues, selected, onSelect, apiKey, mapId, userPosition, routeRequest, routeMode, onRouteChange }: { venues: Venue[]; selected: Venue; onSelect: (venue: Venue) => void; apiKey: string; mapId: string; userPosition: UserPosition | null; routeRequest: number; routeMode: TravelMode; onRouteChange: (state: InAppRouteState) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Array<{ marker: google.maps.marker.AdvancedMarkerElement; element: HTMLDivElement; venue: Venue }>>([]);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      console.error("WhereToGo Google Maps authentication failed. Check the API key, Railway variable, allowed production referrer, enabled APIs, and billing.");
      if (!cancelled) setStatus("failed");
    };

    void loadGoogleMaps(apiKey).then(async () => {
      if (cancelled || !containerRef.current) return;
      const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
      const { ColorScheme } = await google.maps.importLibrary("core") as google.maps.CoreLibrary;
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
      if (cancelled || !containerRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: 40.399, lng: 49.855 },
        zoom: 12,
        mapId: mapId || "DEMO_MAP_ID",
        colorScheme: ColorScheme.DARK,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      });
      const bounds = new google.maps.LatLngBounds();
      const markers = venues.map((venue, index) => {
        bounds.extend({ lat: venue.lat, lng: venue.lng });
        const element = document.createElement("div");
        element.className = "google-venue-pin";
        element.dataset.selected = String(venue.id === selectedRef.current.id);
        element.style.setProperty("--pin-color", venue.dealColor);
        const label = document.createElement("span");
        label.textContent = String(index + 1);
        element.appendChild(label);
        const marker = new AdvancedMarkerElement({ map, position: { lat: venue.lat, lng: venue.lng }, title: venue.name, content: element, zIndex: venue.id === selectedRef.current.id ? 10 : 1 });
        marker.addListener("click", () => onSelect(venue));
        return { marker, element, venue };
      });
      map.fitBounds(bounds, 64);
      mapRef.current = map;
      markersRef.current = markers;
      setStatus("ready");
    }).catch((error: unknown) => {
      console.error("WhereToGo Google Maps initialization failed:", error instanceof Error ? error.message : "Unknown error");
      if (!cancelled) {
        setStatus("failed");
        onRouteChange({ status: "failed", message: "The in-app map could not load. Please retry when your connection is available." });
      }
    });

    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuthFailure;
      markersRef.current.forEach(({ marker }) => { marker.map = null; });
      markersRef.current = [];
      if (userMarkerRef.current) userMarkerRef.current.map = null;
      userMarkerRef.current = null;
      routePolylineRef.current?.setMap(null);
      routePolylineRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, mapId, onRouteChange, onSelect, venues]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat: selected.lat, lng: selected.lng });
    mapRef.current.setZoom(15);
    markersRef.current.forEach(({ marker, element, venue }) => {
      const isSelected = venue.id === selected.id;
      element.dataset.selected = String(isSelected);
      marker.zIndex = isSelected ? 10 : 1;
    });
  }, [selected]);

  useEffect(() => {
    if (routeRequest > 0 && status === "failed") {
      onRouteChange({ status: "failed", mode: routeMode, message: "The interactive map is unavailable. Check your connection and try again." });
      return;
    }
    if (!mapRef.current || !userPosition || status !== "ready") return;
    let cancelled = false;
    const controller = new AbortController();

    void google.maps.importLibrary("marker").then(async (library) => {
      if (cancelled || !mapRef.current) return;
      if (userMarkerRef.current) {
        userMarkerRef.current.position = userPosition;
      } else {
        const { AdvancedMarkerElement } = library as google.maps.MarkerLibrary;
        const element = document.createElement("div");
        element.className = "google-user-pin";
        const dot = document.createElement("span");
        element.appendChild(dot);
        userMarkerRef.current = new AdvancedMarkerElement({
          map: mapRef.current,
          position: userPosition,
          title: "Your current location",
          content: element,
          zIndex: 50,
        });
      }
      if (routeRequest === 0) return;

      onRouteChange({ status: "loading", mode: routeMode });
      routePolylineRef.current?.setMap(null);
      try {
        let routePath: google.maps.LatLngLiteral[] = [];
        let distanceMeters = 0;
        let durationSeconds = 0;
        let routeMessage = "";

        if (routeMode !== "transit") {
          const coordinates = `${userPosition.lng},${userPosition.lat};${selected.lng},${selected.lat}`;
          const routeService = routeMode === "walking" ? "https://routing.openstreetmap.de/routed-foot" : "https://router.project-osrm.org";
          const response = await fetch(`${routeService}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
          const data = await response.json() as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: number[][] } }> };
          const route = data.routes?.[0];
          routePath = route?.geometry?.coordinates?.flatMap((coordinate) => {
            const lng = coordinate[0];
            const lat = coordinate[1];
            return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
          }) ?? [];
          if (data.code !== "Ok" || !route || routePath.length < 2) throw new Error(`No ${routeMode} route was found`);
          distanceMeters = route.distance;
          durationSeconds = route.duration;
          routeMessage = routeMode === "walking" ? "Walking route active · paths by OpenStreetMap" : "Vehicle route active · roads by OpenStreetMap";
        } else {
          await google.maps.importLibrary("routes");
          const service = new google.maps.DirectionsService();
          const result = await service.route({
            origin: userPosition,
            destination: { lat: selected.lat, lng: selected.lng },
            travelMode: google.maps.TravelMode.TRANSIT,
            transitOptions: { departureTime: new Date() },
          });
          const route = result.routes[0];
          const leg = route?.legs[0];
          routePath = route?.overview_path.map((point) => ({ lat: point.lat(), lng: point.lng() })) ?? [];
          if (!route || !leg || routePath.length < 2) throw new Error(`No ${routeMode} route was found`);
          distanceMeters = leg.distance?.value ?? 0;
          durationSeconds = leg.duration?.value ?? 0;
          routeMessage = route.warnings.length ? route.warnings.join(" ") : "Public transport route active";
        }
        if (cancelled || !mapRef.current) return;

        const polyline = routePolylineRef.current ?? new google.maps.Polyline({
          map: mapRef.current,
          strokeColor: "#67e8f9",
          strokeOpacity: 0.98,
          strokeWeight: 7,
          zIndex: 40,
        });
        routePolylineRef.current = polyline;
        polyline.setMap(mapRef.current);
        polyline.setPath(routePath);
        const bounds = new google.maps.LatLngBounds();
        routePath.forEach((point) => bounds.extend(point));
        mapRef.current.fitBounds(bounds, 90);
        onRouteChange({ status: "active", mode: routeMode, distanceMeters, durationSeconds, message: routeMessage });
      } catch (error: unknown) {
        if (cancelled || controller.signal.aborted) return;
        console.warn("WhereToGo route could not be drawn:", error);
        routePolylineRef.current?.setMap(null);
        const modeName = routeMode === "transit" ? "public transport" : routeMode;
        onRouteChange({ status: "failed", mode: routeMode, message: `A ${modeName} route is not available for this journey. Choose another mode or try again.` });
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.warn("WhereToGo map marker could not be loaded:", error);
      onRouteChange({ status: "failed", message: "The in-app map could not start navigation." });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [onRouteChange, routeMode, routeRequest, selected, status, userPosition]);

  if (status === "failed") return <><OpenStreetVenueMap venue={selected} /><MapProviderBadge>OpenStreetMap fallback</MapProviderBadge><MapFallbackNotice reason="Google Maps could not load." /></>;
  return <>
    <div ref={containerRef} className="h-full w-full" aria-label="Google map of Baku venues" />
    <MapProviderBadge>Google Maps</MapProviderBadge>
    {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-[#0c0c14]"><span className="inline-flex items-center gap-2 text-xs font-semibold text-muted"><span className="deal-pulse h-2 w-2 rounded-full bg-gold" />Loading Google Maps…</span></div>}
  </>;
}

function MapSection({ venues, selected, onSelect, onTaxi, userPosition, locationStatus, locationMessage, onRequestLocation, routeRequest, routeMode, onStartRoute }: { venues: Venue[]; selected: Venue; onSelect: (venue: Venue) => void; onTaxi: (venue: Venue) => void; userPosition: UserPosition | null; locationStatus: LocationStatus; locationMessage: string; onRequestLocation: () => void; routeRequest: number; routeMode: TravelMode; onStartRoute: (mode: TravelMode) => void }) {
  const navigate = useNavigate();
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || "";
  const [routeState, setRouteState] = useState<InAppRouteState>({ status: "idle" });
  const [modeChooserOpen, setModeChooserOpen] = useState(false);
  const handleRouteChange = useCallback((state: InAppRouteState) => setRouteState(state), []);

  function chooseTravelMode(mode: TravelMode) {
    setModeChooserOpen(false);
    if (locationStatus !== "ready") onRequestLocation();
    setRouteState({ status: "loading", mode });
    onStartRoute(mode);
  }

  const routeButtonLabel = routeState.status === "loading"
    ? "Building route…"
    : routeState.status === "active" && routeState.distanceMeters != null && routeState.durationSeconds != null
      ? `${(routeState.distanceMeters / 1000).toFixed(1)} km · ${Math.max(1, Math.round(routeState.durationSeconds / 60))} min`
      : routeState.status === "failed" ? "Choose another route" : "Choose in-app route";
  const routeDescription = routeState.status === "active"
    ? routeState.message ?? "Route active in WhereToGo"
    : routeState.status === "loading" ? "Building your driving route…"
      : routeState.status === "failed" ? routeState.message
        : "Selected route destination";

  return <section id="map" className="border-y border-white/[0.07] bg-[#0c0c14] py-20">
    <div className="mx-auto max-w-[1400px] px-5 sm:px-8"><SectionHeading eyebrow="WhereToGo navigation" title="Navigate without leaving the app" />
      <div className="grid overflow-hidden rounded-2xl border border-white/[0.08] bg-card lg:h-[610px] lg:grid-cols-[minmax(300px,1fr)_2fr]">
        <div className="no-scrollbar order-2 max-h-[420px] overflow-y-auto border-t border-white/[0.07] p-3 lg:order-1 lg:max-h-none lg:border-r lg:border-t-0">
          <p className="px-2 pb-3 pt-1 text-[9px] font-bold uppercase tracking-[.2em] text-muted">All venues · {venues.length}</p>
          <div className="space-y-2">{venues.map((venue) => <button key={venue.id} onClick={() => navigate(`/venues/${venue.id}`)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected.id === venue.id ? "border-gold/50 bg-gold/[0.09]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.035]"}`}>
            <SafeImage src={venue.image} alt={`${venue.name} atmosphere`} className="h-14 w-16 shrink-0 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate font-display text-[17px] font-semibold text-white">{venue.name}</strong><span className="mt-1 block truncate text-[10px] text-muted">{venue.address}</span></span><span className="shrink-0 text-[10px] font-bold text-gold">{venue.distance}</span>
          </button>)}</div>
        </div>
        <div className="relative order-1 h-[480px] bg-[#171720] lg:order-2 lg:h-auto">
          {apiKey ? <GoogleVenueMap venues={venues} selected={selected} onSelect={onSelect} apiKey={apiKey} mapId={mapId} userPosition={userPosition} routeRequest={routeRequest} routeMode={routeMode} onRouteChange={handleRouteChange} /> : <><OpenStreetVenueMap venue={selected} /><MapProviderBadge>OpenStreetMap</MapProviderBadge><MapFallbackNotice reason="Google Maps is not configured." /></>}
          <button type="button" onClick={onRequestLocation} className={`glass absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-bold transition hover:text-white ${locationStatus === "ready" ? "text-cyan-300" : locationStatus === "denied" || locationStatus === "unavailable" ? "text-red-300" : "text-white/75"}`} title={locationMessage}>
            <Icon name="location" size={14} />{locationStatus === "ready" ? "Your location is live" : locationStatus === "locating" ? "Finding your location…" : "Enable your location"}
          </button>
          <div className="glass absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl p-3 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:right-5 sm:p-4">
            <SafeImage src={selected.image} alt={`${selected.name} atmosphere`} className="hidden h-14 w-16 shrink-0 rounded-lg object-cover min-[430px]:block sm:h-16 sm:w-20" />
            <div className="min-w-0 flex-1"><p className="truncate font-display text-lg font-semibold text-white sm:text-xl">{selected.name}</p><p className="truncate text-[10px] text-muted sm:text-xs">{selected.address}</p><p className={`mt-1 truncate text-[10px] font-semibold sm:text-xs ${routeState.status === "failed" ? "text-red-300" : routeState.status === "active" ? "text-cyan-300" : "text-gold"}`}>{routeDescription}</p></div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => setModeChooserOpen(true)} disabled={routeState.status === "loading"} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 text-[11px] font-black text-[#07151a] transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-wait disabled:opacity-75" aria-label={`Choose in-app route to ${selected.name}`}><Icon name="location" size={15} />{routeButtonLabel}</button>
              <button type="button" onClick={() => onTaxi(selected)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-[11px] font-black text-white transition hover:border-white/30 hover:bg-white/[0.12]" aria-label={`Other navigation options for ${selected.name}`}><Icon name="car" size={15} />Other options</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    {modeChooserOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModeChooserOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="route-mode-title" className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#12121a] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">In-app navigation</p><h2 id="route-mode-title" className="mt-1 font-display text-3xl font-semibold text-white">How are you travelling?</h2><p className="mt-2 text-sm text-muted">Choose a route to {selected.name}.</p></div>
          <button type="button" onClick={() => setModeChooserOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-muted transition hover:text-white" aria-label="Close travel mode selection"><Icon name="close" /></button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => chooseTravelMode("transit")} className="group flex min-h-32 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center transition hover:border-cyan-300/60 hover:bg-cyan-300/10"><span className="grid h-12 w-12 place-items-center rounded-full bg-cyan-300/15 text-cyan-300"><Icon name="bus" size={24} /></span><strong className="mt-3 text-sm text-white">Public transport</strong><span className="mt-1 text-[10px] text-muted">Bus and metro</span></button>
          <button type="button" onClick={() => chooseTravelMode("walking")} className="group flex min-h-32 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center transition hover:border-cyan-300/60 hover:bg-cyan-300/10"><span className="grid h-12 w-12 place-items-center rounded-full bg-cyan-300/15 text-cyan-300"><Icon name="walk" size={24} /></span><strong className="mt-3 text-sm text-white">Walking</strong><span className="mt-1 text-[10px] text-muted">Pedestrian route</span></button>
          <button type="button" onClick={() => chooseTravelMode("driving")} className="group flex min-h-32 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center transition hover:border-cyan-300/60 hover:bg-cyan-300/10"><span className="grid h-12 w-12 place-items-center rounded-full bg-cyan-300/15 text-cyan-300"><Icon name="car" size={24} /></span><strong className="mt-3 text-sm text-white">Vehicle</strong><span className="mt-1 text-[10px] text-muted">Driving route</span></button>
        </div>
      </section>
    </div>}
  </section>;
}

function TaxiSheet({ venue, onClose }: { venue: Venue; onClose: () => void }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const destination = `${venue.name}, ${venue.address}`;
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}&travelmode=driving`;
  const wazeUrl = `https://waze.com/ul?ll=${venue.lat}%2C${venue.lng}&navigate=yes&zoom=17&utm_source=wheretogo`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function copyDestination() {
    try {
      await navigator.clipboard.writeText(destination);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function openBoltApp() {
    try {
      await navigator.clipboard.writeText(destination);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    const isAndroid = /Android/i.test(navigator.userAgent);
    const fallbackUrl = isAndroid
      ? "https://play.google.com/store/apps/details?id=ee.mtakso.client"
      : "https://apps.apple.com/app/bolt-request-a-ride/id675033630";
    let leftPage = false;
    const markHidden = () => {
      if (document.visibilityState === "hidden") leftPage = true;
    };
    document.addEventListener("visibilitychange", markHidden, { once: true });
    window.location.href = "bolt://";
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", markHidden);
      if (!leftPage && document.visibilityState === "visible") window.location.href = fallbackUrl;
    }, 1600);
  }

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="taxi-title" className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#12121a] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#2fdf84]">Optional external apps</p><h2 id="taxi-title" className="mt-1 font-display text-3xl font-semibold text-white">Other navigation options</h2></div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-muted transition hover:text-white" aria-label="Close navigation options"><Icon name="close" /></button>
      </div>
      <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted">Destination</p>
        <p className="mt-2 font-semibold text-white">{venue.name}</p><p className="mt-1 text-sm text-muted">{venue.address}</p>
      </div>
      <div className="mt-4 rounded-2xl border border-[#2fdf84]/25 bg-[#2fdf84]/[0.07] p-4">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2fdf84] text-lg font-black tracking-[-.08em] text-[#07150d]">bolt</span><div><p className="font-semibold text-white">Bolt</p><p className="text-xs text-white/50">Ride-hailing partner app</p></div></div>
        <p className="mt-4 text-xs leading-5 text-white/55">We copy the destination and open the Bolt app. Paste it into Bolt&apos;s destination field to continue.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={copyDestination} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-white transition hover:border-white/25"><Icon name="copy" size={15} />{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy destination"}</button>
          <button type="button" onClick={() => void openBoltApp()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2fdf84] px-3 py-3 text-xs font-bold text-[#07150d] transition hover:bg-[#5bed9b]">Open Bolt app<Icon name="arrow" size={15} /></button>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-[#4285f4]/25 bg-[#4285f4]/[0.07] p-4">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#4285f4] text-white"><Icon name="pin" size={21} /></span><div><p className="font-semibold text-white">Google Maps</p><p className="text-xs text-white/50">Turn-by-turn driving directions</p></div></div>
        <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4285f4] px-3 py-3 text-xs font-bold text-white transition hover:bg-[#5a95f5]">Open Google Maps<Icon name="arrow" size={15} /></a>
      </div>
      <div className="mt-3 rounded-2xl border border-[#33ccff]/25 bg-[#33ccff]/[0.07] p-4">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#33ccff] text-[#07151a]"><Icon name="car" size={21} /></span><div><p className="font-semibold text-white">Waze</p><p className="text-xs text-white/50">Destination ready in the Waze app</p></div></div>
        <a href={wazeUrl} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#33ccff] px-3 py-3 text-xs font-bold text-[#07151a] transition hover:bg-[#66dcff]">Open destination in Waze<Icon name="arrow" size={15} /></a>
      </div>
      <p className="mt-4 text-center text-[10px] leading-4 text-white/35">Your route stays in WhereToGo unless you choose one of these external apps.</p>
    </section>
  </div>;
}

function useUserLocation() {
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("locating");
  const [locationMessage, setLocationMessage] = useState("Waiting for location permission");
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      setLocationMessage("Location is not supported by this browser");
      return;
    }

    setLocationStatus("locating");
    setLocationMessage("Allow location access when your browser asks");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserPosition({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
        setLocationStatus("ready");
        setLocationMessage(`Live location found (accurate to about ${Math.round(position.coords.accuracy)} m)`);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
          setLocationMessage("Location permission is blocked. Allow it in your browser settings, then press this button again.");
        } else {
          setLocationStatus("unavailable");
          setLocationMessage(error.code === error.TIMEOUT ? "Location request timed out. Press to try again." : "Your location is temporarily unavailable. Press to try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [requestNumber]);

  return {
    userPosition,
    locationStatus,
    locationMessage,
    requestLocation: () => setRequestNumber((value) => value + 1),
  };
}

function distanceKm(origin: Pick<UserPosition, "lat" | "lng">, venue: Pick<Venue, "lat" | "lng">) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(venue.lat - origin.lat);
  const lngDelta = radians(venue.lng - origin.lng);
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(origin.lat)) * Math.cos(radians(venue.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function LocationPickerModal({ apiKey, detectedPosition, currentPosition, onConfirm, onClose }: { apiKey: string; detectedPosition: UserPosition | null; currentPosition: UserPosition | null; onConfirm: (position: UserPosition, label: string) => void; onClose: () => void }) {
  const initialPosition = useRef<UserPosition>(currentPosition || detectedPosition || { lat: 40.3719, lng: 49.8412, accuracy: 0 }).current;
  const [draft, setDraft] = useState<UserPosition>(initialPosition);
  const [status, setStatus] = useState(apiKey ? "Loading map…" : "Google Maps key is not configured.");
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const pickerMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (!apiKey || !mapContainer.current) return;
    let active = true;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    void loadGoogleMaps(apiKey).then(async () => {
      if (!active || !mapContainer.current) return;
      const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
      const map = new Map(mapContainer.current, { center: initialPosition, zoom: 14, mapId: (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || "DEMO_MAP_ID", disableDefaultUI: false, gestureHandling: "greedy" });
      marker = new AdvancedMarkerElement({ map, position: initialPosition, gmpDraggable: true, title: "Selected location" });
      pickerMarker.current = marker;
      const update = (lat: number, lng: number) => { const next = { lat, lng, accuracy: 0 }; setDraft(next); marker!.position = next; };
      map.addListener("click", (event: google.maps.MapMouseEvent) => { if (event.latLng) update(event.latLng.lat(), event.latLng.lng()); });
      marker.addListener("dragend", () => { const position = marker?.position; if (position && "lat" in position) update(typeof position.lat === "function" ? position.lat() : position.lat, typeof position.lng === "function" ? position.lng() : position.lng); });
      setStatus("Click the map or drag the pin to choose a location.");
    }).catch((error: unknown) => {
      console.error("WhereToGo location picker Google Maps failed:", error);
      setStatus("Google Maps could not load. Check the API key and allowed website origin.");
    });
    return () => { active = false; if (marker) marker.map = null; pickerMarker.current = null; };
  }, [apiKey, initialPosition]);

  useEffect(() => {
    if (pickerMarker.current) pickerMarker.current.position = draft;
  }, [draft]);

  async function confirm() {
    let label = "Custom location";
    if (apiKey && window.google?.maps) {
      try {
        const result = await new google.maps.Geocoder().geocode({ location: draft });
        const components = result.results[0]?.address_components ?? [];
        label = components.find((item) => item.types.includes("sublocality") || item.types.includes("neighborhood"))?.long_name || components.find((item) => item.types.includes("route"))?.long_name || "Custom location";
      } catch { /* Coordinates still work when reverse geocoding is unavailable. */ }
    }
    onConfirm(draft, label);
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Choose location"><section className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#12121a] shadow-2xl"><div className="flex items-start justify-between border-b border-white/10 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-gold">Deals near you</p><h2 className="mt-1 font-display text-3xl text-white">Choose your location</h2><p className="mt-1 text-sm text-white/50">{status}</p></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/60 hover:text-white"><Icon name="close" /></button></div><div ref={mapContainer} className="h-[420px] w-full bg-[#0c0c14]" /> <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center"><button type="button" disabled={!detectedPosition} onClick={() => detectedPosition && setDraft(detectedPosition)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40">Use detected location</button><p className="text-xs text-white/40 sm:mr-auto">{draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</p><button type="button" onClick={() => void confirm()} className="panel-button justify-center">Confirm location</button></div></section></div>;
}

export default function App() {
  const { pathname: path } = useLocation();
  const { user, loading } = useAuth();

  if (loading) return <main className="grid min-h-screen place-items-center bg-night text-sm text-white/60">Loading WhereToGo...</main>;
  if (user?.role === "MERCHANT" && !path.startsWith("/merchant")) return <Navigate to="/merchant" replace />;

  const routedPage = path.startsWith("/verify-email") ? <VerifyEmailPage />
    : path.startsWith("/admin") ? <AdminPage />
      : path.startsWith("/merchant") ? <MerchantPage />
        : path.startsWith("/login") || path.startsWith("/register") ? <AuthPage />
          : path.startsWith("/profile") ? <ProfilePage />
            : path.startsWith("/saved") ? <SavedPage />
              : path.startsWith("/deals/") ? <DealDetailPage />
                : path.startsWith("/venues/") ? <VenuePage />
                  : null;
  if (path.startsWith("/merchant")) return routedPage;
  if (routedPage) return <><RouteNavigation /><LanguageSwitcher floating />{routedPage}</>;
  return <ConsumerApp />;
}

function RouteNavigation() {
  const navigate = useNavigate();
  return <nav className="fixed left-3 top-3 z-[140] flex gap-2" aria-label="Page navigation">
    <button type="button" onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")} className="glass inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-white transition hover:border-gold/50 hover:text-gold" aria-label="Go back"><ArrowLeft size={16} />Back</button>
    <Link to="/" className="glass inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-white transition hover:border-gold/50 hover:text-gold" aria-label="Go to main page"><Home size={16} />Home</Link>
  </nav>;
}

function ConsumerApp() {
  const [query, setQuery] = useState("");
  const [restaurants, setRestaurants] = useState<HomepageRestaurant[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stats, setStats] = useState<HomepageStats>({ activeVenues: 0, liveDeals: 0, areas: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [taxiVenue, setTaxiVenue] = useState<Venue | null>(null);
  const [routeRequest, setRouteRequest] = useState(0);
  const [routeMode, setRouteMode] = useState<TravelMode>("driving");
  const { userPosition, locationStatus, locationMessage, requestLocation } = useUserLocation();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [manualPosition, setManualPosition] = useState<UserPosition | null>(null);
  const [locationLabel, setLocationLabel] = useState("Baku, AZ");
  const feedPosition = manualPosition || userPosition;
  const mapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";
  const venues = useMemo(() => restaurants.map((restaurant) => toVenue(restaurant, feedPosition)), [restaurants, feedPosition]);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    const lat = feedPosition?.lat ?? 40.3719;
    const lng = feedPosition?.lng ?? 49.8412;
    Promise.all([
      api<{ restaurants: HomepageRestaurant[] }>("/restaurants"),
      api<{ stats: HomepageStats }>("/restaurants/stats/home"),
      api<{ deals: Deal[] }>(`/deals?lat=${lat}&lng=${lng}&radius=100&all=true&sort=ending`),
    ]).then(([venueData, statsData, dealData]) => {
      if (cancelled) return;
      setRestaurants(venueData.restaurants); setStats(statsData.stats); setDeals(dealData.deals); setDataError("");
    }).catch((reason) => { if (!cancelled) setDataError(reason instanceof Error ? reason.message : "Could not load homepage data"); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [feedPosition?.lat, feedPosition?.lng]);

  useEffect(() => {
    setSelectedVenue((current) => venues.find((venue) => venue.id === current?.id) ?? venues[0] ?? null);
  }, [venues]);

  function navigateInApp(venue: Venue) {
    setSelectedVenue(venue);
    window.requestAnimationFrame(() => document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function startRoute(mode: TravelMode) {
    setRouteMode(mode);
    setRouteRequest((request) => request + 1);
  }

  return <div className="min-h-screen overflow-x-hidden bg-night text-white">
    <Navigation query={query} setQuery={setQuery} locationLabel={locationLabel} onLocationClick={() => { requestLocation(); setLocationPickerOpen(true); }} />
    <main>
      <Hero stats={stats} />
      {dataError && <div className="mx-auto mt-6 max-w-[1340px] rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{dataError}</div>}
      <Reveal><LiveOffers deals={deals} loading={dataLoading} error={dataError} /></Reveal>
      <Reveal><DailyPointsWheel /></Reveal>
      <Reveal><FlashDeals deals={deals} loading={dataLoading} /></Reveal>
      <Reveal><VenueDirectory venues={venues} query={query} setQuery={setQuery} onNavigate={navigateInApp} origin={feedPosition} /></Reveal>
      <Reveal>{selectedVenue ? <MapSection venues={venues} selected={selectedVenue} onSelect={setSelectedVenue} onTaxi={setTaxiVenue} userPosition={feedPosition} locationStatus={locationStatus} locationMessage={locationMessage} onRequestLocation={requestLocation} routeRequest={routeRequest} routeMode={routeMode} onStartRoute={startRoute} /> : <section id="map" className="border-y border-white/[0.07] bg-[#0c0c14] py-20"><div className="mx-auto max-w-[1400px] px-5 text-center text-muted">No active venues are available to show on the map.</div></section>}</Reveal>
    </main>
    <footer className="px-5 py-9 text-center text-[11px] text-muted"><p>© {new Date().getFullYear()} WhereToGo · Great food. Great deals. Every day.</p></footer>
    {taxiVenue && <TaxiSheet venue={taxiVenue} onClose={() => setTaxiVenue(null)} />}
    {locationPickerOpen && <LocationPickerModal apiKey={mapsApiKey} detectedPosition={userPosition} currentPosition={feedPosition} onClose={() => setLocationPickerOpen(false)} onConfirm={(position, label) => { setManualPosition(position); setLocationLabel(label); setLocationPickerOpen(false); }} />}
  </div>;
}

function LiveOffers({ deals, loading, error }: { deals: Deal[]; loading: boolean; error: string }) {
  return <section className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
    <SectionHeading eyebrow="Live now" title="Live offers from restaurants" action={<span className="hidden text-xs text-muted sm:block">{loading ? "Loading..." : `${deals.length} live offer${deals.length === 1 ? "" : "s"}`}</span>} />
    {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">{error}</div>
      : loading ? <div className="rounded-2xl border border-white/[0.08] bg-card p-5 text-sm text-muted">Loading approved offers...</div>
        : deals.length === 0 ? <div className="rounded-2xl border border-white/[0.08] bg-card p-5 text-sm text-muted">No live offers right now. New merchant offers will appear here when their scheduled start time arrives.</div>
          : <div className="grid gap-5 text-ink sm:grid-cols-2 lg:grid-cols-3">{deals.map((deal) => <DealCard key={deal.id} deal={deal} />)}</div>}
  </section>;
}

import { useCallback, useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { BarChart3, Bookmark, Camera, Check, ChevronDown, Copy, Eye, ImagePlus, Link2, List, LogOut, MapPin, Pencil, Play, Plus, QrCode, Search, Store, TicketCheck, Upload, UserRound, Users, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { SafeImage } from "../components/SafeImage";
import { MerchantProfilePage } from "./MerchantProfilePage";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

type MerchantDeal = {
  id: string; restaurantId: string; title: string; description: string; menuItem?: string | null; photoUrl?: string | null; offerType: OfferType; discountPct: number | null; offerPriceAzn?: string | number | null; minimumSpendAzn?: string | number | null; freeMenuItemId?: string | null; isFlash: boolean; tag: string; dietaryTags: string[]; startsAt: string; endsAt: string; isActive: boolean; status: "draft" | "pending_review" | "approved" | "rejected" | "expired"; reviewNotes?: string | null;
  scope: OfferScope; scopeCategoryId?: string | null; offerMenuItems: { menuItemId: string; overridePriceAzn?: string | number | null; menuItem: MenuItem }[];
  _count: { views: number; savedBy: number; redemptions: number };
};
type ManagedVenue = { id: string; name: string; address: string; cuisine: string; lat: number; lng: number; phone?: string | null; photoUrl: string | null; googlePlaceId?: string | null; hoursJson?: { open?: string | null; close?: string | null } | null; deals: MerchantDeal[]; _count: { followers: number } };
type MenuCategory = { id: string; name: string; sortOrder: number; isGlobal: boolean; createdByVenueId?: string | null };
type VenueMenuCategory = { venueId: string; categoryId: string; sortOrder: number; category: MenuCategory };
type VenueMenuCategoryOptions = { selected: VenueMenuCategory[]; available: MenuCategory[] };
type MenuItem = { id: string; venueId: string; categoryId: string; name: string; priceAzn: number; description?: string | null; photoUrl?: string | null; isActive: boolean; category: MenuCategory };
type CatalogItem = { id: string; name: string; categoryId: string; photoUrl?: string | null; category: MenuCategory };
type OfferScope = "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS";
type OfferType = "discount" | "combo" | "set_menu" | "perk" | "event" | "bundle" | "other";
const OFFER_TYPE_CONFIG: Record<OfferType, {
  label: string;
  description: string;
  allowedScopes: OfferScope[];
  minimumItems: number;
  itemLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  usesItemPrices?: boolean;
  usesTotalPrice?: boolean;
  showDietaryTags?: boolean;
}> = {
  discount: { label: "Discount", description: "Take a percentage off the whole menu, one menu section, or selected items.", allowedScopes: ["WHOLE_MENU", "CATEGORY", "SPECIFIC_ITEMS"], minimumItems: 1, itemLabel: "Discounted items", titleLabel: "Discount title", titlePlaceholder: "30% off dinner", descriptionPlaceholder: "Explain the discount and any conditions.", showDietaryTags: true },
  combo: { label: "Combo", description: "Combine two or more specific menu items and set one clear total combo price.", allowedScopes: ["SPECIFIC_ITEMS"], minimumItems: 2, itemLabel: "Items in this combo", titleLabel: "Combo name", titlePlaceholder: "Burger lunch combo", descriptionPlaceholder: "Describe what is included in the combo and any conditions.", usesTotalPrice: true, showDietaryTags: true },
  set_menu: { label: "Set menu", description: "Create a fixed multi-item menu and show customers the exact total saving.", allowedScopes: ["SPECIFIC_ITEMS"], minimumItems: 2, itemLabel: "Courses in this set menu", titleLabel: "Set menu name", titlePlaceholder: "Three-course dinner", descriptionPlaceholder: "List the courses, choices, and any conditions.", usesTotalPrice: true, showDietaryTags: true },
  perk: { label: "Perk", description: "Offer an extra benefit such as a free dessert, welcome drink, or buy-one-get-one reward.", allowedScopes: ["WHOLE_MENU", "CATEGORY", "SPECIFIC_ITEMS"], minimumItems: 1, itemLabel: "Items receiving this perk", titleLabel: "Perk title", titlePlaceholder: "Free dessert with every main", descriptionPlaceholder: "Explain what the customer receives and how they qualify.", showDietaryTags: true },
  event: { label: "Event", description: "Promote a venue-wide scheduled experience such as live music, a tasting, or a themed night.", allowedScopes: ["WHOLE_MENU"], minimumItems: 0, itemLabel: "", titleLabel: "Event name", titlePlaceholder: "Friday live jazz", descriptionPlaceholder: "Add the event time, entry details, inclusions, and conditions." },
  bundle: { label: "Bundle", description: "Price each included item, mark selected items free, or create a spend-and-get-free reward.", allowedScopes: ["SPECIFIC_ITEMS"], minimumItems: 2, itemLabel: "Items in this bundle", titleLabel: "Bundle name", titlePlaceholder: "Family dinner bundle", descriptionPlaceholder: "Describe the bundle contents, quantities, and conditions.", usesItemPrices: true, showDietaryTags: true },
  other: { label: "Other", description: "Use only when the offer does not fit another type, then choose exactly what it covers.", allowedScopes: ["WHOLE_MENU", "CATEGORY", "SPECIFIC_ITEMS"], minimumItems: 1, itemLabel: "Covered items", titleLabel: "Offer title", titlePlaceholder: "Special venue offer", descriptionPlaceholder: "Clearly explain what the customer receives and any conditions.", showDietaryTags: true },
};
const OFFER_TYPES = (Object.entries(OFFER_TYPE_CONFIG) as [OfferType, (typeof OFFER_TYPE_CONFIG)[OfferType]][]).map(([value, config]) => ({ value, label: config.label }));
const FLASH_MIN_DISCOUNT = 25;
const FLASH_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
const FLASH_ELIGIBLE_OFFER_TYPES: OfferType[] = ["discount", "combo", "set_menu", "bundle"];
// Keep in sync with DAYPART_HOURS in apps/api/src/routes/merchant.ts.
// Breakfast has no fixed start hour since venues open at different times - it defaults to 8:00 AM
// but adapts to each venue's declared opening time (venue.hoursJson.open) when available.
const DAYPART_HOURS: Record<string, { startMinutes: number; endMinutes: number; label: string }> = {
  breakfast: { startMinutes: 8 * 60, endMinutes: 12 * 60, label: "8:00 AM\u201312:00 PM" },
  lunch: { startMinutes: 12 * 60, endMinutes: 16 * 60, label: "12:00 PM\u20134:00 PM" },
  "happy hour": { startMinutes: 16 * 60, endMinutes: 19 * 60, label: "4:00 PM\u20137:00 PM" },
  dinner: { startMinutes: 19 * 60, endMinutes: 23 * 60, label: "7:00 PM\u201311:00 PM" },
};

function formatMinutesOfDay(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function venueOpenTimeMinutes(hoursJson: { open?: string | null; close?: string | null } | null | undefined) {
  const open = hoursJson?.open;
  if (typeof open !== "string") return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(open);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function resolveDaypartWindow(tag: string, venueHoursJson?: { open?: string | null; close?: string | null } | null) {
  const base = DAYPART_HOURS[tag];
  if (!base) return null;
  if (tag !== "breakfast") return base;
  const openMinutes = venueOpenTimeMinutes(venueHoursJson);
  if (openMinutes == null || openMinutes >= base.endMinutes) return base;
  return { startMinutes: openMinutes, endMinutes: base.endMinutes, label: `${formatMinutesOfDay(openMinutes)}\u2013${formatMinutesOfDay(base.endMinutes)}` };
}

function toLocalInputValue(date: Date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function daypartWindow(referenceValue: string, tag: string, venueHoursJson?: { open?: string | null; close?: string | null } | null) {
  const window = resolveDaypartWindow(tag, venueHoursJson);
  if (!window || !referenceValue) return null;
  const base = new Date(referenceValue);
  const start = new Date(base);
  start.setHours(Math.floor(window.startMinutes / 60), window.startMinutes % 60, 0, 0);
  const end = new Date(base);
  end.setHours(Math.floor(window.endMinutes / 60), window.endMinutes % 60, 0, 0);
  return { startsAt: toLocalInputValue(start), endsAt: toLocalInputValue(end) };
}

function daypartValidationError(tag: string, startsAt: string, endsAt: string, venueHoursJson?: { open?: string | null; close?: string | null } | null) {
  const window = resolveDaypartWindow(tag, venueHoursJson);
  if (!window) return null;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const sameDay = start.toDateString() === end.toDateString();
  if (!sameDay || startMinutes < window.startMinutes || endMinutes > window.endMinutes) {
    return `${tag.charAt(0).toUpperCase() + tag.slice(1)} offers must run within that day's ${tag} hours (${window.label}).`;
  }
  return null;
}

function localDateTimeValue(date?: string, offset = 0) {
  const value = date ? new Date(date) : new Date(Date.now() + offset);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function isFlashEligible(offerType: OfferType, effectiveDiscountPct: number | null, startsAt: string, endsAt: string) {
  const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return FLASH_ELIGIBLE_OFFER_TYPES.includes(offerType) && effectiveDiscountPct != null && effectiveDiscountPct >= FLASH_MIN_DISCOUNT && durationMs > 0 && durationMs <= FLASH_MAX_DURATION_MS;
}

export function MerchantPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MerchantDeal | null>(null);
  const [menuCategoriesByVenue, setMenuCategoriesByVenue] = useState<Record<string, VenueMenuCategoryOptions>>({});
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [publishNotice, setPublishNotice] = useState("");

  const load = useCallback(async (showPageLoader = false) => {
    if (user?.role !== "MERCHANT" && user?.role !== "ADMIN") { setLoading(false); return; }
    try {
      if (showPageLoader) setLoading(true);
      const data = await api<{ restaurants: ManagedVenue[] }>("/merchant/dashboard");
      setVenues(data.restaurants);
      const venueMenus = await Promise.all(data.restaurants.map(async (venue) => {
        const [menu, categoryOptions] = await Promise.all([
          api<{ items: MenuItem[] }>(`/merchant/venues/${venue.id}/menu`),
          api<VenueMenuCategoryOptions>(`/merchant/menu-categories?venueId=${encodeURIComponent(venue.id)}`),
        ]);
        return { venueId: venue.id, menu, categoryOptions };
      }));
      setMenuItems(venueMenus.flatMap(({ menu }) => menu.items));
      setMenuCategoriesByVenue(Object.fromEntries(venueMenus.map(({ venueId, categoryOptions }) => [venueId, categoryOptions])));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load dashboard");
    } finally {
      if (showPageLoader) setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => { void load(true); }, [load]);

  const activeTab = pathname.startsWith("/merchant/profile") ? "profile" : pathname.startsWith("/merchant/menu") ? "menu" : "dashboard";

  if (authLoading || loading) return <Shell><p className="text-white/60">Loading merchant dashboard...</p></Shell>;
  if (!user) return <Shell><Gate title="Log in to manage a venue" action={<Link to="/login/merchant" className="panel-button">Log in</Link>} /></Shell>;
  if (user.role === "CONSUMER") return <Shell><Gate title="Merchant account required" subtitle="Log in with the merchant account created for your venue." /></Shell>;

  async function leaveApplication() {
    await logout();
    navigate("/login/merchant", { replace: true });
  }

  const navigation = <MerchantNavigation activeTab={activeTab} name={user.name} email={user.email} onLogout={leaveApplication} />;
  if (activeTab === "profile") return <Shell>{navigation}<MerchantProfilePage venues={venues} onVenueChanged={load} /></Shell>;
  if (error) return <Shell>{navigation}<div className="mt-6"><Gate title="Could not load merchant dashboard" subtitle={error} /></div></Shell>;
  if (venues.length === 0) return <Shell>{navigation}<div className="mt-6"><Gate title="Venue profile unavailable" subtitle="This merchant account does not contain a complete registered venue profile." action={<Link to="/merchant/profile" className="panel-button">Open account settings</Link>} /></div></Shell>;

  const allDeals = venues.flatMap((venue) => venue.deals);
  const totals = allDeals.reduce((sum, deal) => ({
    views: sum.views + deal._count.views,
    saves: sum.saves + deal._count.savedBy,
    redemptions: sum.redemptions + deal._count.redemptions,
  }), { views: 0, saves: 0, redemptions: 0 });

  async function expire(deal: MerchantDeal) {
    if (!window.confirm(`Expire "${deal.title}" now?`)) return;
    await api(`/merchant/deals/${deal.id}/expire`, { method: "POST" });
    void load();
  }

  async function goLive(deal: MerchantDeal) {
    await api(`/merchant/deals/${deal.id}/go-live`, { method: "POST" });
    setPublishNotice(`“${deal.title}” is live now and available on the main offer feed.`);
    await load();
  }

  return <Shell>
    {navigation}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300"><BarChart3 className="mr-1 inline" size={14} />Merchant dashboard</p><h1 className="mt-1 text-3xl font-semibold">Today at a glance</h1><p className="mt-1 text-white/55">{venues.map((venue) => venue.name).join(" · ")}</p></div>
      <button onClick={() => { setEditing(null); setShowForm(true); }} className="panel-button"><Plus size={16} />New offer</button>
    </div>
    {publishNotice && <button type="button" onClick={() => setPublishNotice("")} className="mt-4 w-full rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-left text-sm text-emerald-100">{publishNotice}</button>}
    {activeTab === "menu" ? <MenuManager venues={venues} categoryOptions={menuCategoriesByVenue} items={menuItems} onChanged={load} /> : <>
    <section className="mt-6 grid gap-3 md:grid-cols-2">
      {venues.map((venue) => <article key={venue.id} className="rounded-xl border border-white/10 bg-white/[0.045] p-4"><div className="flex gap-4">{venue.photoUrl ? <SafeImage src={venue.photoUrl} alt={`${venue.name} logo`} className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-white/[0.06]"><Store className="text-cyan-300" /></span>}<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Your registered venue</p><h2 className="mt-1 truncate text-xl font-semibold">{venue.name}</h2><p className="mt-1 flex items-start gap-1 text-sm text-white/55"><MapPin className="mt-0.5 shrink-0 text-cyan-300" size={14} />{venue.address}</p><a href={`https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-cyan-300 underline">View registered map location</a></div></div><GooglePlaceLinker venue={venue} onChanged={load} /></article>)}
    </section>
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric icon={Eye} label="Offer views" value={totals.views} />
      <Metric icon={Bookmark} label="Saves" value={totals.saves} />
      <Metric icon={TicketCheck} label="QR claims" value={totals.redemptions} />
      <Metric icon={Users} label="Followers" value={venues.reduce((sum, venue) => sum + venue._count.followers, 0)} />
    </div>
    <RedeemCode venues={venues} />
    <section className="mt-8">
      <h2 className="text-xl font-semibold">Your offer board</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.035]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.055] text-xs uppercase tracking-[.14em] text-white/45"><tr><th className="p-3">Offer</th><th className="p-3">Status</th><th className="p-3">Ends</th><th className="p-3">Views</th><th className="p-3">Saves</th><th className="p-3">QR proofs</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody>{allDeals.map((deal) => { const visibility = offerVisibility(deal); return <tr key={deal.id} className="border-t border-white/10"><td className="p-3"><strong>{deal.title}</strong><p className="text-xs text-white/45">{offerSummary(deal)} · {deal.tag}</p>{deal.status === "rejected" && deal.reviewNotes && <p className="mt-1 text-xs text-red-300">{deal.reviewNotes}</p>}</td><td className="p-3"><StatusPill label={visibility.label} tone={visibility.tone} /><p className="mt-1 max-w-36 text-[10px] leading-4 text-white/40">{visibility.detail}</p></td><td className="p-3">{format(new Date(deal.endsAt), "MMM d, HH:mm")}</td><td className="p-3">{deal._count.views}</td><td className="p-3">{deal._count.savedBy}</td><td className="p-3">{deal._count.redemptions}</td><td className="p-3 text-right"><button onClick={() => { setEditing(deal); setShowForm(true); }} className="mr-3 font-semibold text-cyan-300">Edit</button>{visibility.kind !== "live" && <button onClick={() => void goLive(deal)} className="mr-3 inline-flex items-center gap-1 font-semibold text-emerald-300"><Play size={13} />Go live now</button>}{deal.status === "approved" && deal.isActive && <button onClick={() => void expire(deal)} className="font-semibold text-red-300">Expire</button>}</td></tr>; })}</tbody>
        </table>
      </div>
    </section>
    {showForm && <DealForm venues={venues} categoryOptions={menuCategoriesByVenue} menuItems={menuItems} editing={editing} onOpenMenu={() => { setShowForm(false); navigate("/merchant/menu"); }} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setPublishNotice(editing ? "Offer updated. Check its live status below." : "Offer published. It appears on the main feed as soon as its start time arrives."); void load(); }} />}
    </>}
  </Shell>;
}

function GooglePlaceLinker({ venue, onChanged }: { venue: ManagedVenue; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(venue.name);
  const [suggestions, setSuggestions] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || query.trim().length < 3) { setSuggestions([]); return; }
    const timeout = window.setTimeout(() => {
      setBusy(true);
      api<{ suggestions: { id: string; label: string }[] }>(`/places/autocomplete?input=${encodeURIComponent(query)}`)
        .then((result) => { setSuggestions(result.suggestions); setError(""); })
        .catch((reason) => { setSuggestions([]); setError(reason instanceof Error ? reason.message : "Google search is unavailable"); })
        .finally(() => setBusy(false));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [open, query]);

  async function choose(placeId: string) {
    setBusy(true);
    try {
      const { place } = await api<{ place: { id: string; name?: string; address: string } }>(`/places/${placeId}`);
      if (!window.confirm(`Link ${venue.name} to the Google listing “${place.name || place.address}”?`)) return;
      await api(`/merchant/venues/${venue.id}/google-place`, { method: "PATCH", body: JSON.stringify({ googlePlaceId: place.id }) });
      setOpen(false); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not link this Google listing"); }
    finally { setBusy(false); }
  }

  async function unlink() {
    if (!window.confirm("Remove this Google listing link? Google reviews will no longer appear.")) return;
    setBusy(true);
    try { await api(`/merchant/venues/${venue.id}/google-place`, { method: "PATCH", body: JSON.stringify({ googlePlaceId: null }) }); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove Google listing"); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 border-t border-white/10 pt-4">{venue.googlePlaceId ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm text-emerald-300"><Link2 size={16} />Google listing linked</p><div className="flex gap-3"><button onClick={() => setOpen(true)} className="text-xs font-semibold text-cyan-300">Change</button><button onClick={() => void unlink()} disabled={busy} className="text-xs font-semibold text-red-300">Unlink</button></div></div> : <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300"><Link2 size={16} />Link Google listing for reviews</button>}{open && <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3"><label className="relative block"><Search className="absolute left-3 top-3 text-white/35" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="form-field pl-10" placeholder="Search exact venue name and address" /></label>{busy && <p className="mt-2 text-xs text-white/45">Searching…</p>}<div className="mt-2 divide-y divide-white/10">{suggestions.map((suggestion) => <button key={suggestion.id} onClick={() => void choose(suggestion.id)} className="block w-full py-2 text-left text-sm text-white/70 hover:text-cyan-300">{suggestion.label}</button>)}</div><button onClick={() => setOpen(false)} className="mt-2 text-xs text-white/45">Cancel</button></div>}{error && <p className="mt-2 text-xs text-red-300">{error}</p>}</div>;
}

function MerchantNavigation({ activeTab, name, email, onLogout }: { activeTab: "dashboard" | "menu" | "profile"; name: string; email: string; onLogout: () => Promise<void> }) {
  const linkClass = (tab: typeof activeTab) => `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${activeTab === tab ? "bg-cyan-300 text-[#07151a]" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`;
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <header className="mb-7 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
    <div className="flex flex-wrap items-center gap-3">
      <Link to="/merchant" className="mr-auto flex min-w-0 items-center gap-3 px-1"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-300 text-[#07151a]"><Store size={21} /></span><span className="min-w-0"><strong className="block truncate">Merchant portal</strong><span className="block truncate text-xs text-white/40">{email}</span></span></Link>
      <nav className="order-3 flex w-full gap-1 overflow-x-auto border-t border-white/10 pt-3 sm:order-none sm:w-auto sm:border-0 sm:pt-0" aria-label="Merchant navigation"><Link to="/merchant" className={linkClass("dashboard")}><BarChart3 size={16} />Dashboard</Link><Link to="/merchant/menu" className={linkClass("menu")}><List size={16} />Menu</Link><Link to="/merchant/profile" className={linkClass("profile")}><UserRound size={16} />Profile</Link></nav>
      <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-xs font-black text-cyan-200" title={name}>{initials}</span><button type="button" onClick={() => void onLogout()} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/55 transition hover:border-red-300/30 hover:bg-red-500/10 hover:text-red-200" aria-label="Log out" title="Log out"><LogOut size={17} /></button></div>
    </div>
  </header>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#09090e] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-6xl"><div className="mb-3 flex justify-end"><LanguageSwitcher /></div>{children}</div></div>;
}

function Gate({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center"><Store className="mx-auto text-cyan-300" size={44} /><h1 className="mt-4 text-2xl font-semibold">{title}</h1>{subtitle && <p className="mt-2 text-white/55">{subtitle}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5"><Icon className="text-cyan-300" size={22} /><p className="mt-4 text-3xl font-semibold">{value}</p><p className="text-xs uppercase tracking-[.16em] text-white/45">{label}</p></div>;
}

function RedeemCode({ venues }: { venues: ManagedVenue[] }) {
  const [code, setCode] = useState("");
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [billAmount, setBillAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function redeem(scannedCode = code) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<
        | { kind: "DEAL"; spinUnlocked: true; redemption: { redemptionCode: string; deal: { title: string }; user: { name: string; email: string } } }
        | { kind: "POINT_REWARD"; reward: { rewardCode: string; discountPct: number; maxBillAzn: number; billAmountAzn: number; discountAmountAzn: number; user: { name: string; email: string } } }
      >("/merchant/redemptions/redeem", {
        method: "POST",
        body: JSON.stringify({ code: scannedCode, venueId, billAmountAzn: billAmount ? Number(billAmount) : undefined }),
      });
      setMessage(result.kind === "POINT_REWARD"
        ? `Points reward verified for ${result.reward.user.name || result.reward.user.email}. Apply ${result.reward.discountAmountAzn.toFixed(2)} AZN discount to the ${result.reward.billAmountAzn.toFixed(2)} AZN bill.`
        : `Verified ${result.redemption.deal.title} for ${result.redemption.user.name || result.redemption.user.email}. One points-wheel spin is now unlocked.`);
      setCode("");
      setBillAmount("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not verify this QR/code.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void redeem();
  }

  function scanned(value: string) {
    const scannedCode = normalizeScannedCode(value);
    setScanning(false);
    setCode(scannedCode);
    if (scannedCode.startsWith("GS-")) {
      setMessage("QR scanned. Verifying visit…");
      void redeem(scannedCode);
    } else {
      setMessage("Reward QR scanned. Enter the bill amount, then press Verify.");
    }
  }

  return <section className="mt-8 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300"><QrCode className="mr-1 inline" size={14} />Customer proof</p><h2 className="mt-1 text-xl font-semibold">Verify QR or reward code</h2><p className="mt-1 text-sm text-white/55">Scan the customer&apos;s GS proof to confirm the visit automatically. Manual entry remains available. PTS rewards also need the bill amount.</p></div><button type="button" onClick={() => setScanning(true)} className="panel-button shrink-0 justify-center"><Camera size={17} />Scan QR</button></div>
    <form onSubmit={submit} className="mt-4 grid max-w-3xl gap-2 sm:grid-cols-[minmax(190px,1fr)_160px_auto]">
      {venues.length > 1 && <select value={venueId} onChange={(event) => setVenueId(event.target.value)} className="form-field sm:col-span-3">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select>}
      <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="form-field font-mono uppercase" placeholder="GS-... or PTS-..." required />
      <input value={billAmount} onChange={(event) => setBillAmount(event.target.value)} type="number" min="0.01" step="0.01" className="form-field" placeholder="Bill AZN (PTS only)" />
      <button className="panel-button justify-center" disabled={busy}>{busy ? "Checking..." : "Verify"}</button>
    </form>
    {message && <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/75">{message}</p>}
    {scanning && <QrCameraScanner onDetected={scanned} onClose={() => setScanning(false)} />}
  </section>;
}

function QrCameraScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(onDetected);
  const [cameraMessage, setCameraMessage] = useState("Point the camera at the customer’s QR code.");
  useEffect(() => { detectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let active = true;
    let controls: { stop: () => void } | undefined;
    void import("@zxing/browser").then(async ({ BrowserQRCodeReader }) => {
      if (!active || !videoRef.current) return;
      const reader = new BrowserQRCodeReader();
      controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, error, scannerControls) => {
          if (!active || !result) return;
          active = false;
          scannerControls.stop();
          detectedRef.current(result.getText());
          if (error) console.debug("QR scan retry", error);
        },
      );
    }).catch((reason: unknown) => {
      console.error("QR camera could not start:", reason);
      if (active) setCameraMessage("Camera access failed. Allow camera permission or enter the code manually.");
    });
    return () => { active = false; controls?.stop(); };
  }, []);

  return <div className="fixed inset-0 z-[220] grid place-items-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Scan customer QR code">
    <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-300/25 bg-[#11111a] shadow-2xl">
      <div className="flex items-start justify-between border-b border-white/10 p-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Camera scanner</p><h2 className="mt-1 text-xl font-semibold">Scan customer proof</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close scanner"><X size={19} /></button></div>
      <div className="relative aspect-square overflow-hidden bg-black"><video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(0,0,0,.38)]" /></div>
      <p className="p-4 text-center text-sm text-white/60">{cameraMessage}</p>
    </section>
  </div>;
}

function normalizeScannedCode(value: string) {
  const match = value.trim().toUpperCase().match(/(?:GS|PTS)-[A-Z0-9-]+/);
  return (match?.[0] || value.trim().toUpperCase()).slice(0, 30);
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "live" | "scheduled" | "ended" }) {
  const colors = tone === "live" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : tone === "scheduled" ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : tone === "ended" ? "border-red-300/20 bg-red-300/10 text-red-200" : "border-white/10 bg-white/[0.06] text-white/70";
  return <span className={`rounded-full border px-2 py-1 text-xs capitalize ${colors}`}>{label.replaceAll("_", " ")}</span>;
}

function offerVisibility(deal: MerchantDeal) {
  const now = Date.now(); const starts = new Date(deal.startsAt).getTime(); const ends = new Date(deal.endsAt).getTime();
  if (deal.status === "approved" && deal.isActive && starts <= now && ends > now) return { kind: "live", label: "Live now", tone: "live" as const, detail: "Visible on the main offer feed." };
  if (deal.status === "approved" && deal.isActive && starts > now) return { kind: "scheduled", label: "Scheduled", tone: "scheduled" as const, detail: `Starts ${format(new Date(deal.startsAt), "MMM d, HH:mm")}.` };
  if (ends <= now || deal.status === "expired") return { kind: "ended", label: "Ended", tone: "ended" as const, detail: "Not visible to customers." };
  return { kind: "hidden", label: deal.status, tone: "neutral" as const, detail: deal.isActive ? "Waiting for publication." : "Offer is inactive." };
}

function offerSummary(deal: Pick<MerchantDeal, "offerType" | "discountPct">) {
  if (deal.offerType === "discount" && deal.discountPct != null) return `${deal.discountPct}% off`;
  return OFFER_TYPES.find((item) => item.value === deal.offerType)?.label ?? "Offer";
}

type MenuDraft = { name: string; priceAzn: string; categoryId: string };

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error("Image must be 2 MB or smaller."));
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read image.")); reader.readAsDataURL(file);
  });
}

function MenuManager({ venues, categoryOptions, items, onChanged }: { venues: ManagedVenue[]; categoryOptions: Record<string, VenueMenuCategoryOptions>; items: MenuItem[]; onChanged: () => Promise<void> }) {
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [drafts, setDrafts] = useState<MenuDraft[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState("");
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [customSectionName, setCustomSectionName] = useState("");
  const [sectionsBusy, setSectionsBusy] = useState(false);
  const sectionOptions = categoryOptions[venueId] ?? { selected: [], available: [] };
  const categories = sectionOptions.selected.map((row) => ({ ...row.category, sortOrder: row.sortOrder }));
  const venueItems = items.filter((item) => item.venueId === venueId);

  function focusSections(messageText = "Add at least one menu section before adding items.") {
    setMessage(messageText);
    document.getElementById("menu-sections")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function updateSections(categoryIds: string[], successMessage: string) {
    setSectionsBusy(true);
    try {
      await api("/merchant/menu-categories", { method: "PUT", body: JSON.stringify({ venueId, categoryIds }) });
      setMessage(successMessage);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not update menu sections.");
    } finally { setSectionsBusy(false); }
  }

  async function createCustomSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customSectionName.trim()) return;
    setSectionsBusy(true);
    try {
      await api("/merchant/menu-categories/custom", { method: "POST", body: JSON.stringify({ venueId, name: customSectionName.trim() }) });
      setCustomSectionName("");
      setMessage("Custom menu section created for this venue.");
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not create the custom section.");
    } finally { setSectionsBusy(false); }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const reordered = [...sectionOptions.selected];
    const target = index + direction;
    if (!reordered[index] || target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    void updateSections(reordered.map((row) => row.categoryId), "Menu section order updated.");
  }

  function parseBulk() {
    const defaultCategory = categories[0]?.id ?? "";
    const parsed = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
      const match = line.match(/^(.*?)\s*(?:,|\s+-\s+)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:AZN|₼)?$/i);
      return match ? [{ name: match[1]!.trim(), priceAzn: match[2]!.replace(",", "."), categoryId: defaultCategory }] : [];
    });
    setDrafts(parsed);
    setMessage(parsed.length ? `${parsed.length} draft rows parsed. Review every row before saving.` : "No rows matched. Try: Lule Kebab - 12 AZN");
  }

  async function saveBulk() {
    await api(`/merchant/venues/${venueId}/menu/bulk`, { method: "POST", body: JSON.stringify({ items: drafts.map((draft) => ({ ...draft, priceAzn: Number(draft.priceAzn), isActive: true })) }) });
    setDrafts([]); setBulkText(""); setBulkOpen(false); setMessage("Menu items saved."); await onChanged();
  }

  async function toggleItem(item: MenuItem) {
    await api(`/merchant/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) });
    await onChanged();
  }

  async function cloneMenu() {
    if (!cloneSource) return;
    const result = await api<{ created: number }>(`/merchant/venues/${venueId}/menu/clone`, { method: "POST", body: JSON.stringify({ sourceVenueId: cloneSource }) });
    setMessage(`${result.created} menu items copied. Review and edit them for this venue.`); await onChanged();
  }

  async function scanMenu(file?: File) {
    if (!file) return;
    setScanning(true); setMessage("Reading the menu. This may take a moment...");
    try {
      const form = new FormData(); form.append("menu", file);
      const result = await api<{ drafts: { name: string; priceAzn: number; categoryId: string }[]; message: string }>(`/merchant/venues/${venueId}/menu/ocr`, { method: "POST", body: form });
      setDrafts(result.drafts.map((item) => ({ ...item, priceAzn: String(item.priceAzn) }))); setBulkOpen(true); setMessage(result.message);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Menu scan failed. Use paste or manual entry."); }
    finally { setScanning(false); }
  }

  async function searchCatalog() {
    if (!categories.length) return focusSections();
    const result = await api<{ items: CatalogItem[] }>(`/merchant/menu/catalog?venueId=${encodeURIComponent(venueId)}&q=${encodeURIComponent(catalogQuery)}`); setCatalogItems(result.items);
  }
  async function addCatalogItem(item: CatalogItem) {
    const price = window.prompt(`Price at this venue for ${item.name} (AZN)`); if (!price || Number(price) <= 0) return;
    await api(`/merchant/venues/${venueId}/menu/from-catalog`, { method: "POST", body: JSON.stringify({ catalogItemId: item.id, priceAzn: Number(price) }) }); setMessage(`${item.name} added. You can now edit its details.`); await onChanged();
  }

  return <section className="mt-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-gold">Venue menu</p><h2 className="mt-1 text-2xl font-semibold">Build a reliable item list</h2></div><div className="flex flex-wrap gap-2"><label className={`rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75 ${categories.length ? "cursor-pointer" : "cursor-not-allowed opacity-45"}`}><Upload className="mr-1 inline" size={15} />{scanning ? "Scanning..." : "Scan photo/PDF"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={scanning || !categories.length} className="hidden" onChange={(event) => void scanMenu(event.target.files?.[0])} /></label><button onClick={() => categories.length ? setBulkOpen(!bulkOpen) : focusSections()} className={`rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75 ${categories.length ? "" : "opacity-45"}`}><Upload className="mr-1 inline" size={15} />Bulk paste</button><button onClick={() => categories.length ? setEditing("new") : focusSections()} className={`panel-button ${categories.length ? "" : "opacity-55"}`}><Plus size={15} />Add item</button></div></div>
    {venues.length > 1 && <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_1fr_auto]"><select value={venueId} onChange={(event) => { setVenueId(event.target.value); setEditing(null); setDrafts([]); setCatalogItems([]); setMessage(""); }} className="form-field">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><select value={cloneSource} onChange={(event) => setCloneSource(event.target.value)} className="form-field"><option value="">Copy menu from...</option>{venues.filter((venue) => venue.id !== venueId).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><button onClick={() => void cloneMenu()} disabled={!cloneSource} className="panel-button justify-center"><Copy size={15} />Clone</button></div>}
    {venues.length === 1 && <p className="mt-3 text-sm text-white/50">{venues[0]!.name}</p>}
    <div id="menu-sections" className="mt-4 scroll-mt-24 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.055] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Menu sections</p><h3 className="mt-1 text-xl font-semibold">Choose what this venue serves</h3><p className="mt-1 text-sm text-white/50">These sections control item forms, menu scans, offers, and the public venue menu.</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50">{categories.length} selected</span></div>
      {sectionOptions.selected.length ? <div className="mt-4 flex flex-wrap gap-2">{sectionOptions.selected.map((section, index) => <span key={section.categoryId} className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-black/20 py-1 pl-3 pr-1 text-sm"><span>{section.category.name}</span>{!section.category.isGlobal && <span className="rounded-full bg-amber-300/15 px-1.5 text-[9px] font-bold uppercase text-amber-200">Custom</span>}<button type="button" onClick={() => moveSection(index, -1)} disabled={sectionsBusy || index === 0} className="grid h-6 w-6 place-items-center rounded-full text-white/45 disabled:opacity-20" aria-label={`Move ${section.category.name} earlier`}>↑</button><button type="button" onClick={() => moveSection(index, 1)} disabled={sectionsBusy || index === sectionOptions.selected.length - 1} className="grid h-6 w-6 place-items-center rounded-full text-white/45 disabled:opacity-20" aria-label={`Move ${section.category.name} later`}>↓</button><button type="button" onClick={() => void updateSections(sectionOptions.selected.filter((row) => row.categoryId !== section.categoryId).map((row) => row.categoryId), `${section.category.name} removed.`)} disabled={sectionsBusy} className="grid h-6 w-6 place-items-center rounded-full text-red-200 hover:bg-red-500/15" aria-label={`Remove ${section.category.name}`}>×</button></span>)}</div> : <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">No sections selected yet. Add one below before creating menu items.</p>}
      {sectionOptions.available.length > 0 && <div className="mt-5"><p className="form-label">Add a section</p><div className="flex flex-wrap gap-2">{sectionOptions.available.map((category) => <button key={category.id} type="button" disabled={sectionsBusy} onClick={() => void updateSections([...sectionOptions.selected.map((row) => row.categoryId), category.id], `${category.name} added.`)} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-sm text-white/70 transition hover:border-cyan-300/50 hover:text-cyan-200 disabled:opacity-40">+ {category.name}</button>)}</div></div>}
      <form onSubmit={createCustomSection} className="mt-5 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-[1fr_auto]"><label><span className="form-label">Create custom section</span><input value={customSectionName} onChange={(event) => setCustomSectionName(event.target.value)} className="form-field" maxLength={60} placeholder="e.g. Tea Ceremony" /></label><button disabled={sectionsBusy || customSectionName.trim().length < 2} className="panel-button self-end justify-center disabled:opacity-40"><Plus size={15} />Create custom</button></form>
    </div>
    <div className={`mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4 ${categories.length ? "" : "opacity-50"}`}><p className="form-label">Add a common catalog item</p><div className="flex gap-2"><input value={catalogQuery} disabled={!categories.length} onChange={(event) => setCatalogQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCatalog(); } }} className="form-field" placeholder="Coca-Cola, Heineken, Nescafé..." /><button onClick={() => void searchCatalog()} disabled={!categories.length} className="panel-button">Search</button></div>{catalogItems.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{catalogItems.map((item) => <button key={item.id} onClick={() => void addCatalogItem(item)} className="rounded-full border border-white/10 px-3 py-1 text-sm hover:border-cyan-300">+ {item.name}</button>)}</div>}</div>
    {message && <p className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">{message}</p>}
    {bulkOpen && <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4"><label><span className="form-label">One item per line</span><textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} className="form-field min-h-32" placeholder={"Lule Kebab, 12\nAzerbaijani Tea - 4 AZN"} /></label><button onClick={parseBulk} className="panel-button mt-3">Parse into drafts</button>{drafts.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="text-left text-xs uppercase text-white/45"><tr><th className="p-2">Item</th><th className="p-2">Price AZN</th><th className="p-2">Category</th><th /></tr></thead><tbody>{drafts.map((draft, index) => <tr key={index} className="border-t border-white/10"><td className="p-2"><input value={draft.name} onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} className="form-field" /></td><td className="p-2"><input value={draft.priceAzn} type="number" min="0.01" step="0.01" onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, priceAzn: event.target.value } : row))} className="form-field" /></td><td className="p-2"><select value={draft.categoryId} onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, categoryId: event.target.value } : row))} className="form-field">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td><td><button onClick={() => setDrafts((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="text-red-300">Remove</button></td></tr>)}</tbody></table><button onClick={() => void saveBulk()} className="panel-button mt-3">Confirm and save {drafts.length} items</button></div>}</div>}
    <div className="mt-5 space-y-5">{categories.map((category) => { const group = venueItems.filter((item) => item.categoryId === category.id); return group.length ? <div key={category.id}><h3 className="mb-2 text-sm font-bold uppercase tracking-[.16em] text-white/45">{category.name}</h3><div className="grid gap-2 md:grid-cols-2">{group.map((item) => <article key={item.id} className={`flex items-center gap-3 rounded-xl border border-white/10 p-3 ${item.isActive ? "bg-white/[0.04]" : "bg-black/20 opacity-55"}`}>{item.photoUrl ? <SafeImage src={item.photoUrl} alt={`${item.name} menu item`} className="h-14 w-14 rounded-lg object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-lg bg-white/5"><List size={20} /></span>}<div className="min-w-0 flex-1"><strong className="block truncate">{item.name}</strong><p className="text-sm text-gold">{item.priceAzn.toFixed(2)} AZN</p></div><button onClick={() => setEditing(item)} title="Edit"><Pencil size={17} /></button><button onClick={() => void toggleItem(item)} className={item.isActive ? "text-red-300" : "text-emerald-300"}>{item.isActive ? "Deactivate" : "Activate"}</button></article>)}</div></div> : null; })}{!venueItems.length && <Gate title="No menu items yet" subtitle="Add one manually or paste multiple lines into the review table." />}</div>
    {editing && <MenuItemForm venueId={venueId} categories={categories} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); }} />}
  </section>;
}

function MenuItemForm({ venueId, categories, item, onClose, onSaved }: { venueId: string; categories: MenuCategory[]; item: MenuItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [photoUrl, setPhotoUrl] = useState(item?.photoUrl ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedCategory = categories.find((category) => category.id === categoryId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (!categoryId) { setError("Choose a category."); return; }
    setSaving(true); setError("");
    try {
      const body = { name: String(form.get("name")), categoryId, priceAzn: Number(form.get("priceAzn")), description: String(form.get("description") || "") || null, photoUrl: photoUrl || null, isActive: item?.isActive ?? true };
      await api(item ? `/merchant/menu/items/${item.id}` : `/merchant/venues/${venueId}/menu`, { method: item ? "PATCH" : "POST", body: JSON.stringify(body) });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this menu item.");
    } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="menu-item-title" className="mx-auto my-6 max-w-xl overflow-visible rounded-3xl border border-white/[0.09] bg-[#111119] p-5 shadow-[0_28px_90px_rgba(0,0,0,.72)] sm:my-10 sm:p-7">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-gold">Venue menu</p><h2 id="menu-item-title" className="mt-1 font-display text-3xl font-semibold text-white">{item ? "Edit menu item" : "Add menu item"}</h2><p className="mt-1 text-sm text-white/45">Keep the item clear, priced, and easy to find.</p></div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-white/55 transition hover:border-gold/40 hover:bg-gold/10 hover:text-gold" aria-label="Close menu item form"><X size={18} /></button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Input name="name" label="Item name" defaultValue={item?.name} className="form-field merchant-modal-field" wide />
        <label className="relative"><span className="form-label">Category</span><input type="hidden" name="categoryId" value={categoryId} /><button type="button" onClick={() => setCategoryOpen((open) => !open)} className={`merchant-modal-field flex w-full items-center justify-between gap-3 text-left ${categoryOpen ? "border-gold/70 ring-4 ring-gold/10" : ""}`} aria-haspopup="listbox" aria-expanded={categoryOpen}><span className={selectedCategory ? "text-white" : "text-white/40"}>{selectedCategory?.name ?? "Choose category"}</span><ChevronDown size={17} className={`shrink-0 text-gold transition ${categoryOpen ? "rotate-180" : ""}`} /></button>{categoryOpen && <div role="listbox" aria-label="Category" className="absolute inset-x-0 top-[calc(100%+.45rem)] z-40 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#181820] p-1.5 shadow-[0_22px_55px_rgba(0,0,0,.72)]">{categories.map((category) => <button key={category.id} type="button" role="option" aria-selected={category.id === categoryId} onClick={() => { setCategoryId(category.id); setCategoryOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${category.id === categoryId ? "bg-gold/15 font-bold text-amber-100" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}><span>{category.name}</span>{category.id === categoryId && <Check size={15} className="text-gold" />}</button>)}</div>}</label>
        <label><span className="form-label">Price</span><span className="relative block"><input name="priceAzn" aria-label="Price in AZN" type="number" min="0.01" step="0.01" defaultValue={item?.priceAzn} required className="form-field merchant-modal-field pr-16" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black tracking-wider text-gold">AZN</span></span></label>
        <label className="sm:col-span-2"><span className="form-label">Photo (optional)</span><span className="flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-3 transition hover:border-gold/40 hover:bg-gold/[0.035]">{photoUrl ? <SafeImage src={photoUrl} alt="Item preview" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-gold"><ImagePlus size={25} /></span>}<span><strong className="block text-sm text-white/80">{photoUrl ? "Replace image" : "Choose an image"}</strong><span className="mt-1 block text-xs text-white/40">JPG, PNG or WebP · maximum 2 MB</span></span><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImage(file).then(setPhotoUrl).catch((reason) => setError(reason.message)); }} /></span></label>
        <label className="sm:col-span-2"><span className="form-label">Description (optional)</span><textarea name="description" className="form-field merchant-modal-field min-h-28 resize-y" defaultValue={item?.description ?? ""} placeholder="Ingredients, serving details, or a short description..." /></label>
      </div>
      {error && <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-white/[0.08] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-white/65 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white">Cancel</button><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-black text-[#111119] shadow-[0_10px_28px_rgba(245,158,11,.18)] transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-55">{saving ? "Saving..." : "Save item"}</button></div>
    </form>
  </div>;
}

function DealForm({ venues, categoryOptions, menuItems, editing, onOpenMenu, onClose, onSaved }: { venues: ManagedVenue[]; categoryOptions: Record<string, VenueMenuCategoryOptions>; menuItems: MenuItem[]; editing: MerchantDeal | null; onOpenMenu: () => void; onClose: () => void; onSaved: () => void }) {
  const initialOfferType = editing?.offerType ?? "combo";
  const initialTypeConfig = OFFER_TYPE_CONFIG[initialOfferType];
  const [venueId, setVenueId] = useState(editing?.restaurantId ?? venues[0]?.id ?? "");
  const [scope, setScope] = useState<OfferScope>(() => {
    const editingScope = editing?.scope ?? "WHOLE_MENU";
    return initialTypeConfig.allowedScopes.includes(editingScope) ? editingScope : initialTypeConfig.allowedScopes[0]!;
  });
  const [scopeCategoryId, setScopeCategoryId] = useState(editing?.scopeCategoryId ?? "");
  const [selectedItems, setSelectedItems] = useState<string[]>(editing?.offerMenuItems?.map((item) => item.menuItemId) ?? []);
  const [itemSearch, setItemSearch] = useState("");
  const [itemOverrides, setItemOverrides] = useState<Record<string, string>>(Object.fromEntries((editing?.offerMenuItems ?? []).filter((item) => item.overridePriceAzn != null).map((item) => [item.menuItemId, String(item.overridePriceAzn)])));
  const [photoUrl, setPhotoUrl] = useState(editing?.photoUrl ?? "");
  const [formError, setFormError] = useState("");
  const [offerType, setOfferType] = useState<OfferType>(initialOfferType);
  const [manualDiscount, setManualDiscount] = useState(editing?.discountPct == null ? "" : String(editing.discountPct));
  const [offerPrice, setOfferPrice] = useState(editing?.offerPriceAzn == null ? "" : String(editing.offerPriceAzn));
  const [minimumSpend, setMinimumSpend] = useState(editing?.minimumSpendAzn == null ? "" : String(editing.minimumSpendAzn));
  const [freeMenuItemId, setFreeMenuItemId] = useState(editing?.freeMenuItemId ?? "");
  const [bundleRewardMode, setBundleRewardMode] = useState(editing?.offerType === "bundle" && (editing.minimumSpendAzn != null || editing.freeMenuItemId != null));
  const [startsAt, setStartsAt] = useState(localDateTimeValue(editing?.startsAt, -60_000));
  const [endsAt, setEndsAt] = useState(localDateTimeValue(editing?.endsAt, 24 * 60 * 60 * 1000));
  const [isFlash, setIsFlash] = useState(editing?.isFlash ?? false);
  const [tag, setTag] = useState(editing?.tag ?? "all day");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const typeConfig = OFFER_TYPE_CONFIG[offerType];
  const isSpendReward = offerType === "perk" || (offerType === "bundle" && bundleRewardMode);
  const minimumItems = offerType === "bundle" && bundleRewardMode ? 1 : typeConfig.minimumItems;
  const usesItemPrices = offerType === "bundle" && !bundleRewardMode;
  const showReprice = usesItemPrices || (offerType === "discount" && scope === "SPECIFIC_ITEMS");
  const selectedCategories = (categoryOptions[venueId]?.selected ?? []).map((row) => ({ ...row.category, sortOrder: row.sortOrder }));
  const activeItems = menuItems.filter((item) => item.venueId === venueId && item.isActive);
  const selectedVenue = venues.find((venue) => venue.id === venueId);
  const venueHoursJson = selectedVenue?.hoursJson;
  const selectedMenuItems = activeItems.filter((item) => selectedItems.includes(item.id));
  const scopedItemPhotos = scope === "SPECIFIC_ITEMS"
    ? selectedMenuItems.filter((item) => item.photoUrl)
    : scope === "CATEGORY"
      ? activeItems.filter((item) => item.categoryId === scopeCategoryId && item.photoUrl)
    : scope === "WHOLE_MENU" && offerType !== "event"
      ? activeItems.filter((item) => item.photoUrl)
      : [];
  const freeMenuItem = activeItems.find((item) => item.id === freeMenuItemId);
  const freeItemOptions = scope === "SPECIFIC_ITEMS" ? selectedMenuItems : scope === "CATEGORY" ? activeItems.filter((item) => item.categoryId === scopeCategoryId) : activeItems;
  const selectedItemPhotos = [...new Map([...scopedItemPhotos, ...(freeMenuItem?.photoUrl ? [freeMenuItem] : [])].map((item) => [item.id, item])).values()];
  const regularTotal = selectedMenuItems.reduce((sum, item) => sum + item.priceAzn, 0);
  const offerTotal = selectedMenuItems.reduce((sum, item) => sum + (itemOverrides[item.id] === undefined || itemOverrides[item.id] === "" ? item.priceAzn : Number(itemOverrides[item.id])), 0);
  const numericOfferPrice = Number(offerPrice);
  const displayedOfferTotal = typeConfig.usesTotalPrice ? numericOfferPrice : offerTotal;
  const savingsAmount = regularTotal > 0 && displayedOfferTotal >= 0 && displayedOfferTotal < regularTotal ? regularTotal - displayedOfferTotal : 0;
  const savingsPercent = savingsAmount > 0 ? Math.round((savingsAmount / regularTotal) * 100) : 0;
  const effectiveDiscountPercent = offerType === "discount"
    ? (manualDiscount.trim() ? Number(manualDiscount) : null)
    : (["combo", "set_menu", "bundle"].includes(offerType) && !isSpendReward ? savingsPercent : null);
  const flashEligible = isFlashEligible(offerType, effectiveDiscountPercent, startsAt, endsAt);
  const flashCapableType = FLASH_ELIGIBLE_OFFER_TYPES.includes(offerType) && !isSpendReward;
  const activeCategoryIds = new Set(activeItems.map((item) => item.categoryId));
  const offerCategories = selectedCategories.filter((category) => activeCategoryIds.has(category.id));
  useEffect(() => {
    if (!isSpendReward || scope !== "SPECIFIC_ITEMS") return;
    const total = selectedMenuItems.filter((item) => item.id !== freeMenuItemId).reduce((sum, item) => sum + item.priceAzn, 0);
    if (total > 0) setMinimumSpend(String(total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpendReward, scope, selectedItems, freeMenuItemId]);
  useEffect(() => {
    if (offerType !== "discount" || scope !== "SPECIFIC_ITEMS") return;
    const hasReprice = selectedMenuItems.some((item) => itemOverrides[item.id] !== undefined && itemOverrides[item.id] !== "");
    if (hasReprice && regularTotal > 0 && offerTotal < regularTotal) setManualDiscount(String(Math.round(((regularTotal - offerTotal) / regularTotal) * 100)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerType, scope, itemOverrides, selectedItems]);
  function clearFieldError(...fields: string[]) {
    setFieldErrors((current) => {
      if (!fields.some((field) => field in current)) return current;
      const next = { ...current };
      fields.forEach((field) => delete next[field]);
      return next;
    });
    setFormError("");
  }
  function handleTagChange(nextTag: string) {
    setTag(nextTag);
    const window = daypartWindow(startsAt, nextTag, venueHoursJson);
    if (window) { setStartsAt(window.startsAt); setEndsAt(window.endsAt); }
    clearFieldError("tag", "startsAt", "endsAt");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const discountValue = offerType === "discount" ? manualDiscount.trim() : "";
    const menuItem = String(form.get("menuItem") || "").trim();
    function fail(message: string, fields: string[] = []) {
      setFormError(message);
      if (fields.length) setFieldErrors(Object.fromEntries(fields.map((field) => [field, message])));
    }
    if (!typeConfig.allowedScopes.includes(scope)) return fail(`${typeConfig.label} cannot use that offer scope.`, ["scope"]);
    if (scope === "SPECIFIC_ITEMS" && selectedItems.length < minimumItems) return fail(`Choose at least ${minimumItems} menu ${minimumItems === 1 ? "item" : "items"} for this ${typeConfig.label.toLowerCase()}.`, ["menuItemIds"]);
    if (typeConfig.usesTotalPrice && (!(numericOfferPrice > 0) || numericOfferPrice >= regularTotal)) return fail(`Enter one total ${typeConfig.label.toLowerCase()} price below the ${regularTotal.toFixed(2)} AZN regular total.`, ["offerPriceAzn"]);
    if (isSpendReward && !(Number(minimumSpend) > 0)) return fail("Choose a minimum purchase amount.", ["minimumSpendAzn"]);
    if (isSpendReward && !freeMenuItemId) return fail("Choose the item the customer receives free.", ["freeMenuItemId"]);
    if (usesItemPrices && offerTotal >= regularTotal) return fail("Reduce at least one bundle item price or mark an item as free.", ["menuItemOverrides"]);
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return fail("End time must be after start time.", ["endsAt"]);
    const daypartError = daypartValidationError(tag, startsAt, endsAt, venueHoursJson);
    if (daypartError) return fail(daypartError, ["tag", "startsAt", "endsAt"]);
    if (isFlash && !flashEligible) return fail("Flash deals need an effective discount of 25% or more and a window of 6 hours or less.", ["isFlash"]);
    const body = { restaurantId: String(form.get("restaurantId")), scope, scopeCategoryId: scope === "CATEGORY" ? scopeCategoryId : null, menuItemIds: scope === "SPECIFIC_ITEMS" ? selectedItems : [], menuItemOverrides: usesItemPrices ? Object.fromEntries(Object.entries(itemOverrides).filter(([id, value]) => selectedItems.includes(id) && value !== "").map(([id, value]) => [id, Number(value)])) : {}, offerPriceAzn: typeConfig.usesTotalPrice ? numericOfferPrice : usesItemPrices ? offerTotal : null, minimumSpendAzn: isSpendReward ? Number(minimumSpend) : null, freeMenuItemId: isSpendReward ? freeMenuItemId : null, photoUrl: selectedItemPhotos.length ? null : photoUrl || null, title: String(form.get("title")), description: String(form.get("description")), menuItem: menuItem || null, offerType: String(form.get("offerType")), discountPct: discountValue ? Number(discountValue) : null, isFlash: flashCapableType && isFlash, tag, dietaryTags: typeConfig.showDietaryTags ? String(form.get("dietaryTags") || "").split(",").map((item) => item.trim()).filter(Boolean) : [], startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), isRecurring: false };
    try { await api(editing ? `/merchant/deals/${editing.id}` : "/merchant/deals", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) }); onSaved(); }
    catch (reason) {
      if (reason instanceof ApiError) {
        setFormError(reason.message);
        const issues = Array.isArray(reason.details?.issues) ? reason.details.issues as { path: (string | number)[]; message: string }[] : [];
        if (issues.length) setFieldErrors(Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message])));
      } else {
        setFormError(reason instanceof Error ? reason.message : "Could not submit offer.");
      }
    }
  }
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"><form onSubmit={submit} className="mx-auto my-4 max-w-2xl rounded-xl border border-white/10 bg-[#12121a] p-5">
    <div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-semibold">{editing ? "Edit offer" : "Submit new offer"}</h2><button type="button" onClick={onClose} className="text-2xl text-white/60">x</button></div>
    {!activeItems.length && offerType !== "event" && <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">This venue has no active menu items yet. <button type="button" onClick={onOpenMenu} className="font-bold underline">Add menu items</button>{typeConfig.allowedScopes.includes("WHOLE_MENU") ? <>, or continue with <strong>Whole menu</strong> and describe the coverage in free text.</> : <> before creating this {typeConfig.label.toLowerCase()}.</>}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <label><span className="form-label">Venue</span><select name="restaurantId" value={venueId} onChange={(event) => { setVenueId(event.target.value); setSelectedItems([]); setScopeCategoryId(""); }} className="form-field">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
      <label><span className="form-label">Offer type</span><select name="offerType" className="form-field" value={offerType} onChange={(event) => { const nextType = event.target.value as OfferType; const nextConfig = OFFER_TYPE_CONFIG[nextType]; setOfferType(nextType); setScope((current) => nextConfig.allowedScopes.includes(current) ? current : nextConfig.allowedScopes[0]!); setScopeCategoryId(""); setSelectedItems([]); setItemOverrides({}); setManualDiscount(""); setOfferPrice(""); setMinimumSpend(""); setFreeMenuItemId(""); setBundleRewardMode(false); setIsFlash(false); setFormError(""); }}>{OFFER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <div className="md:col-span-2 rounded-xl border border-gold/20 bg-gold/[0.06] p-3"><strong className="text-sm text-amber-100">{typeConfig.label}</strong><p className="mt-1 text-sm leading-5 text-white/55">{typeConfig.description}</p></div>
      {offerType === "bundle" && <fieldset className="md:col-span-2"><legend className="form-label">Bundle style</legend><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => { setBundleRewardMode(false); setMinimumSpend(""); setFreeMenuItemId(""); setItemOverrides({}); setFormError(""); }} className={`rounded-xl border p-3 text-left transition ${!bundleRewardMode ? "border-gold/50 bg-gold/10 text-amber-100" : "border-white/10 bg-white/[0.025] text-white/60"}`}><strong className="block text-sm">Fixed bundle</strong><span className="mt-1 block text-xs">Set each included item’s offer price or mark it free.</span></button><button type="button" onClick={() => { setBundleRewardMode(true); setItemOverrides({}); setOfferPrice(""); setFormError(""); }} className={`rounded-xl border p-3 text-left transition ${bundleRewardMode ? "border-gold/50 bg-gold/10 text-amber-100" : "border-white/10 bg-white/[0.025] text-white/60"}`}><strong className="block text-sm">Spend & get one free</strong><span className="mt-1 block text-xs">Example: spend 30 AZN on pizza and get one pizza free.</span></button></div></fieldset>}
      {offerType !== "event" && <label><span className="form-label">What does it cover?</span><select value={scope} disabled={typeConfig.allowedScopes.length === 1} onChange={(event) => { setScope(event.target.value as OfferScope); setScopeCategoryId(""); setSelectedItems([]); setItemOverrides({}); setFreeMenuItemId(""); }} className="form-field disabled:cursor-not-allowed disabled:opacity-75">{typeConfig.allowedScopes.includes("WHOLE_MENU") && <option value="WHOLE_MENU">Whole menu</option>}{typeConfig.allowedScopes.includes("CATEGORY") && <option value="CATEGORY">One menu category</option>}{typeConfig.allowedScopes.includes("SPECIFIC_ITEMS") && <option value="SPECIFIC_ITEMS">Selected menu items</option>}</select>{typeConfig.allowedScopes.length === 1 && <span className="mt-1 block text-xs text-cyan-200">{isSpendReward ? "Choose the item the customer must buy." : `${typeConfig.label} offers require at least ${minimumItems} specific menu items.`}</span>}</label>}
      {scope === "CATEGORY" && <label className="md:col-span-2"><span className="form-label">Covered category</span><select name="scopeCategoryId" value={scopeCategoryId} onChange={(event) => { setScopeCategoryId(event.target.value); clearFieldError("scopeCategoryId"); }} className={`form-field ${fieldErrors.scopeCategoryId ? "border-red-400/70 ring-2 ring-red-400/20" : ""}`} required><option value="">Choose an enabled section with active items</option>{offerCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><FieldNote message={fieldErrors.scopeCategoryId} />{!offerCategories.length && <span className="mt-2 block text-xs text-amber-200">No selected section has active menu items. Add or activate items from the Menu tab first.</span>}</label>}
      {scope === "SPECIFIC_ITEMS" && <div className="md:col-span-2 rounded-xl border border-white/10 p-3">
        <div className="mb-2 flex items-end justify-between gap-3"><p className="form-label mb-0">{isSpendReward ? "Qualifying items" : typeConfig.itemLabel}</p><span className="text-xs text-white/40">Choose at least {minimumItems}</span></div>
        {activeItems.length ? <><input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} className="form-field mb-2" placeholder={`Search items for this ${typeConfig.label.toLowerCase()}...`} /><div className="max-h-60 space-y-1 overflow-y-auto">{activeItems.filter((item) => item.name.toLowerCase().includes(itemSearch.toLowerCase())).map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg p-2 hover:bg-white/5"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => { setSelectedItems((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]); if (isSpendReward && freeMenuItemId === item.id) setFreeMenuItemId(""); }} /><span className="flex-1 truncate">{item.name}</span>{item.photoUrl && <span className="text-xs text-cyan-300">photo</span>}<span className="text-gold">{item.priceAzn.toFixed(2)} AZN</span></label>{selectedItems.includes(item.id) && showReprice && <div className="flex items-center gap-1.5"><input aria-label={`Reprice ${item.name}`} value={itemOverrides[item.id] ?? ""} onChange={(event) => setItemOverrides((values) => ({ ...values, [item.id]: event.target.value }))} type="number" min="0" step="0.01" className="w-28 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm" placeholder="New price" /><button type="button" onClick={() => setItemOverrides((values) => ({ ...values, [item.id]: "0" }))} className={`rounded-lg border px-2 py-1 text-xs font-bold ${itemOverrides[item.id] === "0" ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-white/55"}`}>Free</button></div>}</div>)}</div>{showReprice && selectedMenuItems.length > 0 && <div className="mt-3 rounded-lg bg-black/20 p-3 text-sm"><div className="flex justify-between text-white/55"><span>Regular total</span><span>{regularTotal.toFixed(2)} AZN</span></div><div className="mt-1 flex justify-between font-bold text-emerald-200"><span>Bundle total</span><span>{offerTotal.toFixed(2)} AZN</span></div>{savingsAmount > 0 && <div className="mt-1 flex justify-between text-amber-200"><span>Total saving</span><span>{savingsAmount.toFixed(2)} AZN ({savingsPercent}%)</span></div>}</div>}</> : <p className="text-sm text-white/55">No active items yet. <button type="button" onClick={onOpenMenu} className="font-bold text-cyan-300 underline">Add menu items</button> before creating this offer.</p>}
      </div>}
      {offerType === "discount" && <label><span className="form-label">Discount percentage</span><input name="discountPct" className="form-field" type="number" min={1} max={100} value={manualDiscount} required onChange={(event) => setManualDiscount(event.target.value)} placeholder="25" /><span className="mt-1 block text-xs text-white/40">{scope === "SPECIFIC_ITEMS" ? "Enter a value, or set a new price per item below to calculate it automatically." : "Enter a value from 1 to 100."}</span></label>}
      {typeConfig.usesTotalPrice && <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/[0.025] p-3"><label><span className="form-label">Total {typeConfig.label.toLowerCase()} price</span><span className="relative block"><input value={offerPrice} onChange={(event) => { setOfferPrice(event.target.value); clearFieldError("offerPriceAzn"); }} className={`form-field pr-16 ${fieldErrors.offerPriceAzn ? "border-red-400/70 ring-2 ring-red-400/20" : ""}`} type="number" min="0.01" step="0.01" required placeholder="Enter one total price" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gold">AZN</span></span><FieldNote message={fieldErrors.offerPriceAzn} /></label>{selectedMenuItems.length >= minimumItems && <div className="mt-3 grid gap-1 rounded-lg bg-black/20 p-3 text-sm sm:grid-cols-3"><p><span className="block text-xs text-white/40">Regular total</span><strong>{regularTotal.toFixed(2)} AZN</strong></p><p><span className="block text-xs text-white/40">Offer total</span><strong className="text-emerald-200">{numericOfferPrice > 0 ? `${numericOfferPrice.toFixed(2)} AZN` : "—"}</strong></p><p><span className="block text-xs text-white/40">Total discount</span><strong className="text-amber-200">{savingsAmount > 0 ? `${savingsAmount.toFixed(2)} AZN (${savingsPercent}%)` : "Enter a lower price"}</strong></p></div>}</div>}
      {isSpendReward && <div className="md:col-span-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3"><p className="form-label text-emerald-200">Spend & get one free</p><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs text-white/50">Minimum purchase amount</span><span className="relative block"><input value={minimumSpend} onChange={(event) => { setMinimumSpend(event.target.value); clearFieldError("minimumSpendAzn"); }} className={`form-field pr-16 ${fieldErrors.minimumSpendAzn ? "border-red-400/70 ring-2 ring-red-400/20" : ""}`} type="number" min="0.01" step="0.01" required placeholder="30" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gold">AZN</span></span><FieldNote message={fieldErrors.minimumSpendAzn} />{scope === "SPECIFIC_ITEMS" && <span className="mt-1 block text-xs text-white/40">Auto-filled from the qualifying items total; edit if needed.</span>}</label><label><span className="mb-1 block text-xs text-white/50">Customer receives free</span><select value={freeMenuItemId} onChange={(event) => { setFreeMenuItemId(event.target.value); clearFieldError("freeMenuItemId"); }} className={`form-field ${fieldErrors.freeMenuItemId ? "border-red-400/70 ring-2 ring-red-400/20" : ""}`} required><option value="">{scope === "SPECIFIC_ITEMS" && !freeItemOptions.length ? "Choose qualifying items first" : "Choose the free item"}</option>{freeItemOptions.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.priceAzn.toFixed(2)} AZN</option>)}</select><FieldNote message={fieldErrors.freeMenuItemId} />{scope === "SPECIFIC_ITEMS" && <span className="mt-1 block text-xs text-white/40">Only the qualifying items selected above can be the free item.</span>}</label></div>{Number(minimumSpend) > 0 && freeMenuItemId && <p className="mt-3 rounded-lg bg-black/20 p-3 text-sm font-semibold text-emerald-100">Customer spends at least {Number(minimumSpend).toFixed(2)} AZN{scope === "SPECIFIC_ITEMS" && selectedMenuItems.length ? ` on ${selectedMenuItems.map((item) => item.name).join(", ")}` : scope === "CATEGORY" ? " in the selected category" : " at the venue"} and receives {freeItemOptions.find((item) => item.id === freeMenuItemId)?.name ?? "the selected item"} free.</p>}</div>}
      <Input name="title" label={typeConfig.titleLabel} defaultValue={editing?.title} placeholder={typeConfig.titlePlaceholder} error={fieldErrors.title} wide />
      {offerType !== "event" && typeConfig.allowedScopes.length > 1 && <Input name="menuItem" label="Extra coverage note (optional)" defaultValue={editing?.menuItem ?? ""} placeholder="Add a short clarification only if needed..." wide required={false} />}
      {selectedItemPhotos.length ? <div className="md:col-span-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3"><span className="form-label text-emerald-200">Offer photos</span><div className="no-scrollbar flex snap-x gap-3 overflow-x-auto pb-2">{selectedItemPhotos.map((item) => <figure key={item.id} className="w-28 shrink-0 snap-start"><SafeImage src={item.photoUrl!} alt={item.name} className="h-20 w-28 rounded-lg object-cover" /><figcaption className="mt-1 truncate text-xs text-emerald-100">{item.name}</figcaption></figure>)}</div><p className="mt-1 text-sm text-emerald-100">Customers can swipe through every saved item photo in this gallery.</p>{selectedMenuItems.some((item) => !item.photoUrl) && <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-sm text-amber-100">Items without photos: {selectedMenuItems.filter((item) => !item.photoUrl).map((item) => item.name).join(", ")}. <button type="button" onClick={onOpenMenu} className="font-bold underline">Add their photos in Menu</button>.</p>}</div> : <label className="md:col-span-2"><span className="form-label">{offerType === "event" ? "Event photo" : "Offer photo"}</span>{scope === "SPECIFIC_ITEMS" && selectedMenuItems.length > 0 && <p className="mb-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-sm text-amber-100">{selectedMenuItems.map((item) => item.name).join(", ")} {selectedMenuItems.length === 1 ? "does" : "do"} not have a saved menu photo. <button type="button" onClick={onOpenMenu} className="font-bold underline">Add the photo in Menu</button> to reuse it automatically.</p>}<input type="file" accept="image/jpeg,image/png,image/webp" className="form-field" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImage(file).then(setPhotoUrl).catch((reason) => setFormError(reason.message)); }} />{photoUrl && <SafeImage src={photoUrl} alt="Offer preview" className="mt-2 h-32 w-48 rounded-lg object-cover" />}<p className="mt-1 text-xs text-white/45">{offerType === "event" ? "Required. Event offers use their own image and never pull unrelated menu photos." : "Required when none of the covered menu items has a saved photo."}</p></label>}
      <label className="md:col-span-2"><span className="form-label">{offerType === "event" ? "Event details" : `${typeConfig.label} details`}</span><textarea name="description" className={`form-field min-h-24 ${fieldErrors.description ? "border-red-400/70 ring-2 ring-red-400/20" : ""}`} required defaultValue={editing?.description} placeholder={typeConfig.descriptionPlaceholder} /><FieldNote message={fieldErrors.description} /></label>
      <label><span className="form-label">Daypart</span><select name="tag" value={tag} onChange={(event) => handleTagChange(event.target.value)} className={`form-field ${fieldErrors.tag ? "border-red-400/70 ring-2 ring-red-400/20" : ""}`}>{["breakfast", "lunch", "dinner", "happy hour", "all day"].map((option) => <option key={option}>{option}</option>)}</select><FieldNote message={fieldErrors.tag} />{resolveDaypartWindow(tag, venueHoursJson) && <span className="mt-1 block text-xs text-cyan-200">Automatically sets the start/end time to that day's {tag} hours ({resolveDaypartWindow(tag, venueHoursJson)!.label}).</span>}</label>
      {typeConfig.showDietaryTags && <Input name="dietaryTags" label="Dietary tags" defaultValue={editing?.dietaryTags.join(", ") ?? ""} placeholder="vegan, halal, gluten-free" required={false} />}
      <Input name="startsAt" label="Starts (date and time)" type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); clearFieldError("startsAt"); }} error={fieldErrors.startsAt} />
      <Input name="endsAt" label="Ends (date and time)" type="datetime-local" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); clearFieldError("endsAt"); }} error={fieldErrors.endsAt} />
      {flashCapableType && <label className={`md:col-span-2 flex gap-3 rounded-xl border p-4 transition ${isFlash ? "border-gold/45 bg-gold/[0.08]" : "border-white/10 bg-white/[0.025]"}`}>
        <input type="checkbox" checked={isFlash} disabled={!flashEligible && !isFlash} onChange={(event) => setIsFlash(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-500 disabled:cursor-not-allowed" />
        <span>
          <strong className="block text-sm text-white">Flash Deal</strong>
          <span className="mt-1 block text-xs leading-5 text-white/55">Flash deals get featured in the Flash Deals carousel with a countdown, but must be a steep, time-limited discount.</span>
          <span className={`mt-2 block text-xs font-semibold ${flashEligible ? "text-emerald-300" : "text-amber-300"}`}>{flashEligible ? "Eligible for Flash: 25%+ discount and a window no longer than 6 hours." : "Flash deals need 25%+ discount and a 6-hour or shorter window."}</span>
        </span>
      </label>}
    </div>
    {formError && <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{formError}</p>}
    <p className="mt-4 text-sm text-white/50">Your offer will be published automatically. Admins can monitor offer activity but no approval is required.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 font-semibold text-white/70">Cancel</button><button className="panel-button">Publish offer</button></div>
  </form></div>;
}

function Input({ label, wide, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean; error?: string }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="form-label">{label}</span><input className={`form-field ${error ? "border-red-400/70 ring-2 ring-red-400/20" : ""} ${className ?? ""}`} required {...props} /><FieldNote message={error} /></label>;
}

function FieldNote({ message }: { message?: string }) {
  return message ? <span className="mt-1 block text-xs text-red-300">{message}</span> : null;
}

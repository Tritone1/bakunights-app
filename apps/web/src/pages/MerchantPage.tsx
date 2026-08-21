import { useCallback, useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { BarChart3, Bookmark, Copy, Eye, Link2, List, MapPin, Pencil, Play, Plus, QrCode, Search, Store, TicketCheck, Upload, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { SafeImage } from "../components/SafeImage";

type MerchantDeal = {
  id: string; restaurantId: string; title: string; description: string; menuItem?: string | null; photoUrl?: string | null; offerType: OfferType; discountPct: number | null; tag: string; dietaryTags: string[]; startsAt: string; endsAt: string; isActive: boolean; status: "draft" | "pending_review" | "approved" | "rejected" | "expired"; reviewNotes?: string | null;
  scope: OfferScope; scopeCategoryId?: string | null; offerMenuItems: { menuItemId: string; overridePriceAzn?: string | number | null; menuItem: MenuItem }[];
  _count: { views: number; savedBy: number; redemptions: number };
};
type ManagedVenue = { id: string; name: string; address: string; cuisine: string; lat: number; lng: number; photoUrl: string | null; googlePlaceId?: string | null; deals: MerchantDeal[]; _count: { followers: number } };
type MenuCategory = { id: string; name: string; sortOrder: number };
type MenuItem = { id: string; venueId: string; categoryId: string; name: string; priceAzn: number; description?: string | null; photoUrl?: string | null; isActive: boolean; category: MenuCategory };
type CatalogItem = { id: string; name: string; categoryId: string; photoUrl?: string | null; category: MenuCategory };
type OfferScope = "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS";
type OfferType = "discount" | "combo" | "set_menu" | "perk" | "event" | "bundle" | "other";
const OFFER_TYPES: { value: OfferType; label: string }[] = [
  { value: "discount", label: "Discount" },
  { value: "combo", label: "Combo" },
  { value: "set_menu", label: "Set menu" },
  { value: "perk", label: "Perk" },
  { value: "event", label: "Event" },
  { value: "bundle", label: "Bundle" },
  { value: "other", label: "Other" },
];

export function MerchantPage() {
  const { user, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MerchantDeal | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "menu">("dashboard");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [publishNotice, setPublishNotice] = useState("");

  const load = useCallback(async () => {
    if (user?.role !== "MERCHANT" && user?.role !== "ADMIN") { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await api<{ restaurants: ManagedVenue[] }>("/merchant/dashboard");
      setVenues(data.restaurants);
      const categoryData = await api<{ categories: MenuCategory[] }>("/merchant/menu/categories");
      setCategories(categoryData.categories);
      const menus = await Promise.all(data.restaurants.map((venue) => api<{ items: MenuItem[] }>(`/merchant/venues/${venue.id}/menu`)));
      setMenuItems(menus.flatMap((menu) => menu.items));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (authLoading || loading) return <Shell><p className="text-white/60">Loading merchant dashboard...</p></Shell>;
  if (!user) return <Shell><Gate title="Log in to manage a venue" action={<Link to="/login/merchant" className="panel-button">Log in</Link>} /></Shell>;
  if (user.role === "CONSUMER") return <Shell><Gate title="Merchant account required" subtitle="Log in with the merchant account created for your venue." /></Shell>;
  if (error) return <Shell><Gate title="Could not load merchant dashboard" subtitle={error} /></Shell>;
  if (venues.length === 0) return <Shell><Gate title="Venue profile unavailable" subtitle="This merchant account does not contain a complete registered venue profile." /></Shell>;

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
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300"><BarChart3 className="mr-1 inline" size={14} />Merchant dashboard</p><h1 className="mt-1 text-3xl font-semibold">Today at a glance</h1><p className="mt-1 text-white/55">{venues.map((venue) => venue.name).join(" · ")}</p></div>
      <button onClick={() => { setEditing(null); setShowForm(true); }} className="panel-button"><Plus size={16} />New offer</button>
    </div>
    <div className="mt-6 flex gap-2 border-b border-white/10 pb-3"><button onClick={() => setActiveTab("dashboard")} className={activeTab === "dashboard" ? "panel-button" : "rounded-xl px-4 py-2 text-sm font-semibold text-white/55 hover:bg-white/5"}><BarChart3 size={16} />Dashboard</button><button onClick={() => setActiveTab("menu")} className={activeTab === "menu" ? "panel-button" : "rounded-xl px-4 py-2 text-sm font-semibold text-white/55 hover:bg-white/5"}><List size={16} />Menu</button></div>
    {publishNotice && <button type="button" onClick={() => setPublishNotice("")} className="mt-4 w-full rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-left text-sm text-emerald-100">{publishNotice}</button>}
    {activeTab === "menu" ? <MenuManager venues={venues} categories={categories} items={menuItems} onChanged={load} /> : <>
    <section className="mt-6 grid gap-3 md:grid-cols-2">
      {venues.map((venue) => <article key={venue.id} className="rounded-xl border border-white/10 bg-white/[0.045] p-4"><div className="flex gap-4">{venue.photoUrl ? <SafeImage src={venue.photoUrl} alt={`${venue.name} logo`} className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-white/[0.06]"><Store className="text-cyan-300" /></span>}<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Your registered venue</p><h2 className="mt-1 truncate text-xl font-semibold">{venue.name}</h2><p className="mt-1 flex items-start gap-1 text-sm text-white/55"><MapPin className="mt-0.5 shrink-0 text-cyan-300" size={14} />{venue.address}</p><a href={`https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-cyan-300 underline">View registered map location</a></div></div><GooglePlaceLinker venue={venue} onChanged={load} /></article>)}
    </section>
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric icon={Eye} label="Offer views" value={totals.views} />
      <Metric icon={Bookmark} label="Saves" value={totals.saves} />
      <Metric icon={TicketCheck} label="QR claims" value={totals.redemptions} />
      <Metric icon={Users} label="Followers" value={venues.reduce((sum, venue) => sum + venue._count.followers, 0)} />
    </div>
    <RedeemCode />
    <section className="mt-8">
      <h2 className="text-xl font-semibold">Your offer board</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.035]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.055] text-xs uppercase tracking-[.14em] text-white/45"><tr><th className="p-3">Offer</th><th className="p-3">Status</th><th className="p-3">Ends</th><th className="p-3">Views</th><th className="p-3">Saves</th><th className="p-3">QR proofs</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody>{allDeals.map((deal) => { const visibility = offerVisibility(deal); return <tr key={deal.id} className="border-t border-white/10"><td className="p-3"><strong>{deal.title}</strong><p className="text-xs text-white/45">{offerSummary(deal)} · {deal.tag}</p>{deal.status === "rejected" && deal.reviewNotes && <p className="mt-1 text-xs text-red-300">{deal.reviewNotes}</p>}</td><td className="p-3"><StatusPill label={visibility.label} tone={visibility.tone} /><p className="mt-1 max-w-36 text-[10px] leading-4 text-white/40">{visibility.detail}</p></td><td className="p-3">{format(new Date(deal.endsAt), "MMM d, HH:mm")}</td><td className="p-3">{deal._count.views}</td><td className="p-3">{deal._count.savedBy}</td><td className="p-3">{deal._count.redemptions}</td><td className="p-3 text-right"><button onClick={() => { setEditing(deal); setShowForm(true); }} className="mr-3 font-semibold text-cyan-300">Edit</button>{visibility.kind !== "live" && <button onClick={() => void goLive(deal)} className="mr-3 inline-flex items-center gap-1 font-semibold text-emerald-300"><Play size={13} />Go live now</button>}{deal.status === "approved" && deal.isActive && <button onClick={() => void expire(deal)} className="font-semibold text-red-300">Expire</button>}</td></tr>; })}</tbody>
        </table>
      </div>
    </section>
    {showForm && <DealForm venues={venues} categories={categories} menuItems={menuItems} editing={editing} onOpenMenu={() => { setShowForm(false); setActiveTab("menu"); }} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setPublishNotice(editing ? "Offer updated. Check its live status below." : "Offer published. It appears on the main feed as soon as its start time arrives."); void load(); }} />}
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

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#09090e] px-4 py-6 text-white md:px-8"><div className="mx-auto max-w-6xl">{children}</div></div>;
}

function Gate({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center"><Store className="mx-auto text-cyan-300" size={44} /><h1 className="mt-4 text-2xl font-semibold">{title}</h1>{subtitle && <p className="mt-2 text-white/55">{subtitle}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5"><Icon className="text-cyan-300" size={22} /><p className="mt-4 text-3xl font-semibold">{value}</p><p className="text-xs uppercase tracking-[.16em] text-white/45">{label}</p></div>;
}

function RedeemCode() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ redemption: { redemptionCode: string; deal: { title: string }; user: { name: string; email: string } } }>("/merchant/redemptions/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setMessage(`Verified ${result.redemption.deal.title} for ${result.redemption.user.name || result.redemption.user.email}.`);
      setCode("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not verify this QR/code.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-8 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] p-5">
    <div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300"><QrCode className="mr-1 inline" size={14} />Customer proof</p><h2 className="mt-1 text-xl font-semibold">Verify QR or code</h2><p className="mt-1 text-sm text-white/55">Ask the customer to show their QR from the app, then enter the code here.</p></div>
    <form onSubmit={submit} className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
      <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="form-field font-mono uppercase" placeholder="GS-AB12CD34" required />
      <button className="panel-button justify-center" disabled={busy}>{busy ? "Checking..." : "Verify"}</button>
    </form>
    {message && <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/75">{message}</p>}
  </section>;
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

function MenuManager({ venues, categories, items, onChanged }: { venues: ManagedVenue[]; categories: MenuCategory[]; items: MenuItem[]; onChanged: () => Promise<void> }) {
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
  const venueItems = items.filter((item) => item.venueId === venueId);

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
    const result = await api<{ items: CatalogItem[] }>(`/merchant/menu/catalog?q=${encodeURIComponent(catalogQuery)}`); setCatalogItems(result.items);
  }
  async function addCatalogItem(item: CatalogItem) {
    const price = window.prompt(`Price at this venue for ${item.name} (AZN)`); if (!price || Number(price) <= 0) return;
    await api(`/merchant/venues/${venueId}/menu/from-catalog`, { method: "POST", body: JSON.stringify({ catalogItemId: item.id, priceAzn: Number(price) }) }); setMessage(`${item.name} added. You can now edit its details.`); await onChanged();
  }

  return <section className="mt-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-gold">Venue menu</p><h2 className="mt-1 text-2xl font-semibold">Build a reliable item list</h2></div><div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75"><Upload className="mr-1 inline" size={15} />{scanning ? "Scanning..." : "Scan photo/PDF"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={scanning} className="hidden" onChange={(event) => void scanMenu(event.target.files?.[0])} /></label><button onClick={() => setBulkOpen(!bulkOpen)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75"><Upload className="mr-1 inline" size={15} />Bulk paste</button><button onClick={() => setEditing("new")} className="panel-button"><Plus size={15} />Add item</button></div></div>
    {venues.length > 1 && <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_1fr_auto]"><select value={venueId} onChange={(event) => setVenueId(event.target.value)} className="form-field">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><select value={cloneSource} onChange={(event) => setCloneSource(event.target.value)} className="form-field"><option value="">Copy menu from...</option>{venues.filter((venue) => venue.id !== venueId).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><button onClick={() => void cloneMenu()} disabled={!cloneSource} className="panel-button justify-center"><Copy size={15} />Clone</button></div>}
    {venues.length === 1 && <p className="mt-3 text-sm text-white/50">{venues[0]!.name}</p>}
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4"><p className="form-label">Add a common catalog item</p><div className="flex gap-2"><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCatalog(); } }} className="form-field" placeholder="Coca-Cola, Heineken, Nescafé..." /><button onClick={() => void searchCatalog()} className="panel-button">Search</button></div>{catalogItems.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{catalogItems.map((item) => <button key={item.id} onClick={() => void addCatalogItem(item)} className="rounded-full border border-white/10 px-3 py-1 text-sm hover:border-cyan-300">+ {item.name}</button>)}</div>}</div>
    {message && <p className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">{message}</p>}
    {bulkOpen && <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4"><label><span className="form-label">One item per line</span><textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} className="form-field min-h-32" placeholder={"Lule Kebab, 12\nAzerbaijani Tea - 4 AZN"} /></label><button onClick={parseBulk} className="panel-button mt-3">Parse into drafts</button>{drafts.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="text-left text-xs uppercase text-white/45"><tr><th className="p-2">Item</th><th className="p-2">Price AZN</th><th className="p-2">Category</th><th /></tr></thead><tbody>{drafts.map((draft, index) => <tr key={index} className="border-t border-white/10"><td className="p-2"><input value={draft.name} onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} className="form-field" /></td><td className="p-2"><input value={draft.priceAzn} type="number" min="0.01" step="0.01" onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, priceAzn: event.target.value } : row))} className="form-field" /></td><td className="p-2"><select value={draft.categoryId} onChange={(event) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, categoryId: event.target.value } : row))} className="form-field">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td><td><button onClick={() => setDrafts((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="text-red-300">Remove</button></td></tr>)}</tbody></table><button onClick={() => void saveBulk()} className="panel-button mt-3">Confirm and save {drafts.length} items</button></div>}</div>}
    <div className="mt-5 space-y-5">{categories.map((category) => { const group = venueItems.filter((item) => item.categoryId === category.id); return group.length ? <div key={category.id}><h3 className="mb-2 text-sm font-bold uppercase tracking-[.16em] text-white/45">{category.name}</h3><div className="grid gap-2 md:grid-cols-2">{group.map((item) => <article key={item.id} className={`flex items-center gap-3 rounded-xl border border-white/10 p-3 ${item.isActive ? "bg-white/[0.04]" : "bg-black/20 opacity-55"}`}>{item.photoUrl ? <SafeImage src={item.photoUrl} alt={`${item.name} menu item`} className="h-14 w-14 rounded-lg object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-lg bg-white/5"><List size={20} /></span>}<div className="min-w-0 flex-1"><strong className="block truncate">{item.name}</strong><p className="text-sm text-gold">{item.priceAzn.toFixed(2)} AZN</p></div><button onClick={() => setEditing(item)} title="Edit"><Pencil size={17} /></button><button onClick={() => void toggleItem(item)} className={item.isActive ? "text-red-300" : "text-emerald-300"}>{item.isActive ? "Deactivate" : "Activate"}</button></article>)}</div></div> : null; })}{!venueItems.length && <Gate title="No menu items yet" subtitle="Add one manually or paste multiple lines into the review table." />}</div>
    {editing && <MenuItemForm venueId={venueId} categories={categories} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); }} />}
  </section>;
}

function MenuItemForm({ venueId, categories, item, onClose, onSaved }: { venueId: string; categories: MenuCategory[]; item: MenuItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [photoUrl, setPhotoUrl] = useState(item?.photoUrl ?? "");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = { name: String(form.get("name")), categoryId: String(form.get("categoryId")), priceAzn: Number(form.get("priceAzn")), description: String(form.get("description") || "") || null, photoUrl: photoUrl || null, isActive: item?.isActive ?? true };
    await api(item ? `/merchant/menu/items/${item.id}` : `/merchant/venues/${venueId}/menu`, { method: item ? "PATCH" : "POST", body: JSON.stringify(body) }); await onSaved();
  }
  return <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/75 p-4"><form onSubmit={submit} className="mx-auto my-10 max-w-lg rounded-2xl border border-white/10 bg-[#12121a] p-5"><div className="flex justify-between"><h2 className="text-2xl font-semibold">{item ? "Edit menu item" : "Add menu item"}</h2><button type="button" onClick={onClose}>x</button></div><div className="mt-5 grid gap-3"><Input name="name" label="Item name" defaultValue={item?.name} /><label><span className="form-label">Category</span><select name="categoryId" defaultValue={item?.categoryId} className="form-field">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Input name="priceAzn" label="Price (AZN)" type="number" min="0.01" step="0.01" defaultValue={item?.priceAzn} /><label><span className="form-label">Photo (optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" className="form-field" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImage(file).then(setPhotoUrl).catch((reason) => setError(reason.message)); }} />{photoUrl && <SafeImage src={photoUrl} alt="Item preview" className="mt-2 h-24 w-24 rounded-lg object-cover" />}</label><label><span className="form-label">Description (optional)</span><textarea name="description" className="form-field min-h-24" defaultValue={item?.description ?? ""} /></label></div>{error && <p className="mt-3 text-sm text-red-300">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2">Cancel</button><button className="panel-button">Save item</button></div></form></div>;
}

function DealForm({ venues, categories, menuItems, editing, onOpenMenu, onClose, onSaved }: { venues: ManagedVenue[]; categories: MenuCategory[]; menuItems: MenuItem[]; editing: MerchantDeal | null; onOpenMenu: () => void; onClose: () => void; onSaved: () => void }) {
  const [venueId, setVenueId] = useState(editing?.restaurantId ?? venues[0]?.id ?? "");
  const [scope, setScope] = useState<OfferScope>(editing?.scope ?? "WHOLE_MENU");
  const [selectedItems, setSelectedItems] = useState<string[]>(editing?.offerMenuItems?.map((item) => item.menuItemId) ?? []);
  const [itemSearch, setItemSearch] = useState("");
  const [itemOverrides, setItemOverrides] = useState<Record<string, string>>(Object.fromEntries((editing?.offerMenuItems ?? []).filter((item) => item.overridePriceAzn != null).map((item) => [item.menuItemId, String(item.overridePriceAzn)])));
  const [photoUrl, setPhotoUrl] = useState(editing?.photoUrl ?? "");
  const [formError, setFormError] = useState("");
  const [offerType, setOfferType] = useState<OfferType>(editing?.offerType ?? "combo");
  const [manualDiscount, setManualDiscount] = useState(editing?.discountPct == null ? "" : String(editing.discountPct));
  const activeItems = menuItems.filter((item) => item.venueId === venueId && item.isActive);
  const selectedMenuItems = activeItems.filter((item) => selectedItems.includes(item.id));
  const selectedItemPhoto = scope === "SPECIFIC_ITEMS" ? activeItems.find((item) => selectedItems.includes(item.id) && item.photoUrl)?.photoUrl ?? null : null;
  const overriddenItems = selectedMenuItems.filter((item) => Number(itemOverrides[item.id]) > 0);
  const regularTotal = overriddenItems.reduce((sum, item) => sum + item.priceAzn, 0);
  const offerTotal = overriddenItems.reduce((sum, item) => sum + Number(itemOverrides[item.id]), 0);
  const calculatedDiscount = regularTotal > 0 && offerTotal < regularTotal ? Math.round((1 - offerTotal / regularTotal) * 100) : null;
  const activeCategoryIds = new Set(activeItems.map((item) => item.categoryId));
  const localValue = (date?: string, offset = 0) => { const value = date ? new Date(date) : new Date(Date.now() + offset); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 16); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const discountValue = String(form.get("discountPct") || "").trim();
    const menuItem = String(form.get("menuItem") || "").trim();
    const body = { restaurantId: String(form.get("restaurantId")), scope, scopeCategoryId: scope === "CATEGORY" ? String(form.get("scopeCategoryId")) : null, menuItemIds: scope === "SPECIFIC_ITEMS" ? selectedItems : [], menuItemOverrides: Object.fromEntries(Object.entries(itemOverrides).filter(([id, value]) => selectedItems.includes(id) && value).map(([id, value]) => [id, Number(value)])), photoUrl: selectedItemPhoto ? null : photoUrl || null, title: String(form.get("title")), description: String(form.get("description")), menuItem: menuItem || null, offerType: String(form.get("offerType")), discountPct: discountValue ? Number(discountValue) : null, tag: String(form.get("tag")), dietaryTags: String(form.get("dietaryTags") || "").split(",").map((item) => item.trim()).filter(Boolean), startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString(), isRecurring: false };
    try { await api(editing ? `/merchant/deals/${editing.id}` : "/merchant/deals", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) }); onSaved(); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : "Could not submit offer."); }
  }
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"><form onSubmit={submit} className="mx-auto my-4 max-w-2xl rounded-xl border border-white/10 bg-[#12121a] p-5">
    <div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-semibold">{editing ? "Edit offer" : "Submit new offer"}</h2><button type="button" onClick={onClose} className="text-2xl text-white/60">x</button></div>
    {!activeItems.length && <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">This venue has no active menu items yet. <button type="button" onClick={onOpenMenu} className="font-bold underline">Add menu items</button>, or continue with <strong>Whole menu</strong> and describe the coverage in free text.</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <label><span className="form-label">Venue</span><select name="restaurantId" value={venueId} onChange={(event) => { setVenueId(event.target.value); setSelectedItems([]); }} className="form-field">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
      <label><span className="form-label">Offer scope</span><select value={scope} onChange={(event) => setScope(event.target.value as OfferScope)} className="form-field"><option value="WHOLE_MENU">Whole menu</option><option value="CATEGORY">Specific category</option><option value="SPECIFIC_ITEMS">Specific items</option></select></label>
      {scope === "CATEGORY" && <label className="md:col-span-2"><span className="form-label">Covered category</span><select name="scopeCategoryId" defaultValue={editing?.scopeCategoryId ?? ""} className="form-field" required><option value="">Choose category</option>{categories.filter((category) => activeCategoryIds.has(category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
      {scope === "SPECIFIC_ITEMS" && <div className="md:col-span-2 rounded-xl border border-white/10 p-3"><p className="form-label">Covered items</p>{activeItems.length ? <><input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} className="form-field mb-2" placeholder="Search menu items..." /><div className="max-h-60 space-y-1 overflow-y-auto">{activeItems.filter((item) => item.name.toLowerCase().includes(itemSearch.toLowerCase())).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => setSelectedItems((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /><span className="flex-1 truncate">{item.name}</span>{item.photoUrl && <span className="text-xs text-cyan-300">photo</span>}<span className="text-gold">{item.priceAzn.toFixed(2)} AZN</span></label>{selectedItems.includes(item.id) && <input aria-label={`Offer price for ${item.name}`} value={itemOverrides[item.id] ?? ""} onChange={(event) => setItemOverrides((values) => ({ ...values, [item.id]: event.target.value }))} type="number" min="0.01" step="0.01" className="w-24 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm" placeholder="Offer AZN" />}</div>)}</div></> : <p className="text-sm text-white/55">No active items yet. <button type="button" onClick={onOpenMenu} className="font-bold text-cyan-300 underline">Add menu items</button>, or use Whole menu with free text.</p>}</div>}
      <label><span className="form-label">Offer type</span><select name="offerType" className="form-field" value={offerType} onChange={(event) => setOfferType(event.target.value as OfferType)}>{OFFER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label><span className="form-label">Discount % {calculatedDiscount != null ? "(calculated automatically)" : "(only for discount offers)"}</span><input name="discountPct" className="form-field" type="number" min={1} max={100} value={calculatedDiscount ?? manualDiscount} readOnly={calculatedDiscount != null} required={offerType === "discount"} onChange={(event) => setManualDiscount(event.target.value)} />{calculatedDiscount != null && <span className="mt-1 block text-xs text-emerald-300">{regularTotal.toFixed(2)} AZN → {offerTotal.toFixed(2)} AZN = {calculatedDiscount}% saving</span>}{overriddenItems.length > 0 && calculatedDiscount == null && <span className="mt-1 block text-xs text-amber-300">The offer price must be lower than the normal menu price to calculate a saving.</span>}</label>
      <Input name="title" label="Offer title" defaultValue={editing?.title} wide />
      <Input name="menuItem" label="Free-text coverage fallback (optional)" defaultValue={editing?.menuItem ?? ""} placeholder="Lule Kebab, lunch combo, dessert plate..." wide required={false} />
      {selectedItemPhoto ? <div className="md:col-span-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3"><span className="form-label text-emerald-200">Offer photo</span><div className="flex items-center gap-3"><SafeImage src={selectedItemPhoto} alt="Selected menu item" className="h-20 w-24 rounded-lg object-cover" /><p className="text-sm text-emerald-100">The selected menu item's saved photo will be used automatically. No additional upload is needed.</p></div></div> : <label className="md:col-span-2"><span className="form-label">Offer photo</span>{scope === "SPECIFIC_ITEMS" && selectedMenuItems.length > 0 && <p className="mb-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-sm text-amber-100">{selectedMenuItems.map((item) => item.name).join(", ")} {selectedMenuItems.length === 1 ? "does" : "do"} not have a saved menu photo. <button type="button" onClick={onOpenMenu} className="font-bold underline">Add the photo in Menu</button> to reuse it automatically.</p>}<input type="file" accept="image/jpeg,image/png,image/webp" className="form-field" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImage(file).then(setPhotoUrl).catch((reason) => setFormError(reason.message)); }} />{photoUrl && <SafeImage src={photoUrl} alt="Offer preview" className="mt-2 h-32 w-48 rounded-lg object-cover" />}<p className="mt-1 text-xs text-white/45">Required when none of the covered menu items has a saved photo.</p></label>}
      <label className="md:col-span-2"><span className="form-label">Description</span><textarea name="description" className="form-field min-h-24" required defaultValue={editing?.description} placeholder="Combo details, items, price, conditions, and what the customer receives." /></label>
      <label><span className="form-label">Daypart</span><select name="tag" className="form-field" defaultValue={editing?.tag ?? "all day"}>{["breakfast", "lunch", "dinner", "happy hour", "all day"].map((tag) => <option key={tag}>{tag}</option>)}</select></label>
      <Input name="dietaryTags" label="Tags" defaultValue={editing?.dietaryTags.join(", ") ?? ""} required={false} />
      <Input name="startsAt" label="Starts (date and time)" type="datetime-local" defaultValue={localValue(editing?.startsAt, -60_000)} />
      <Input name="endsAt" label="Ends (date and time)" type="datetime-local" defaultValue={localValue(editing?.endsAt, 24 * 60 * 60 * 1000)} />
    </div>
    {formError && <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{formError}</p>}
    <p className="mt-4 text-sm text-white/50">Your offer will be published automatically. Admins can monitor offer activity but no approval is required.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 font-semibold text-white/70">Cancel</button><button className="panel-button">Publish offer</button></div>
  </form></div>;
}

function Input({ label, wide, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="form-label">{label}</span><input className="form-field" required {...props} /></label>;
}

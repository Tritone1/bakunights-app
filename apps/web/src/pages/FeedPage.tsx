import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter, List, LocateFixed, Map, SlidersHorizontal, Sparkles } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import type { Deal } from "../types";
import { DealCard } from "../components/DealCard";
import { DealMap } from "../components/DealMap";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { LocationDialog } from "../components/LocationDialog";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

type Location = { lat: number; lng: number; label: string };
type Filters = { radius: number; cuisine: string; minDiscount: number; dietary: string; endingSoon: boolean; sort: "distance" | "discount" | "ending" | "rating" };
const BAKU = { lat: 40.3855, lng: 49.8671, label: "Baku, Azerbaijan" };
const DEFAULT_FILTERS: Filters = { radius: 10, cuisine: "", minDiscount: 0, dietary: "", endingSoon: false, sort: "distance" };

export function FeedPage() {
  const stored = localStorage.getItem("haragedek-location");
  const [location, setLocation] = useState<Location>(() => {
    try { return stored ? JSON.parse(stored) as Location : BAKU; }
    catch { return BAKU; }
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => {
    try { return JSON.parse(localStorage.getItem("haragedek-filters") || "null") || DEFAULT_FILTERS; }
    catch { return DEFAULT_FILTERS; }
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  const loadDeals = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const params = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng), radius: String(filters.radius), minDiscount: String(filters.minDiscount), sort: filters.sort });
      if (filters.cuisine) params.set("cuisine", filters.cuisine);
      if (filters.dietary) params.set("dietary", filters.dietary);
      if (filters.endingSoon) params.set("endingSoon", "true");
      const result = await api<{ deals: Deal[]; cuisines: string[] }>(`/deals?${params}`);
      setDeals(result.deals); setCuisines(result.cuisines);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unknown error"); }
    finally { setLoading(false); }
  }, [location, filters]);

  useEffect(() => { void loadDeals(); }, [loadDeals]);
  useEffect(() => {
    if (!user) { setPreferencesLoaded(true); return; }
    setPreferencesLoaded(false);
    void api<{ preferences: Filters | null }>("/users/me/preferences")
      .then(({ preferences }) => { if (preferences) setFilters(preferences); })
      .catch(() => undefined)
      .finally(() => setPreferencesLoaded(true));
  }, [user]);
  useEffect(() => {
    if (!preferencesLoaded) return;
    localStorage.setItem("haragedek-filters", JSON.stringify(filters));
    if (!user) return;
    const timer = window.setTimeout(() => void api("/users/me/preferences", { method: "PUT", body: JSON.stringify(filters) }), 500);
    return () => window.clearTimeout(timer);
  }, [filters, preferencesLoaded, user]);
  useEffect(() => {
    if (!stored && "geolocation" in navigator) locate(false);
  // Only ask on the first visit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate(showError = true) {
    if (!("geolocation" in navigator)) { setLocationOpen(true); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      selectLocation({ lat: position.coords.latitude, lng: position.coords.longitude, label: "Current location" });
    }, () => { if (showError) setLocationOpen(true); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
  }
  function selectLocation(next: Location) {
    setLocation(next); localStorage.setItem("haragedek-location", JSON.stringify(next)); setLocationOpen(false);
    if (user) void api("/users/me/location", { method: "PATCH", body: JSON.stringify({ lat: next.lat, lng: next.lng }) });
  }
  async function save(deal: Deal) {
    if (!user) { navigate("/login/customer"); return; }
    const wasSaved = savedIds.has(deal.id);
    setSavedIds((current) => { const next = new Set(current); if (wasSaved) next.delete(deal.id); else next.add(deal.id); return next; });
    try { await api(`/deals/${deal.id}/save`, { method: wasSaved ? "DELETE" : "PUT" }); }
    catch { setSavedIds((current) => { const next = new Set(current); if (wasSaved) next.add(deal.id); else next.delete(deal.id); return next; }); }
  }
  const filterCount = useMemo(() => Number(filters.radius !== 10) + Number(Boolean(filters.cuisine)) + Number(filters.minDiscount > 0) + Number(Boolean(filters.dietary)) + Number(filters.endingSoon), [filters]);

  return <div className="px-4 py-5 md:px-8 md:py-8">
    <section className="mb-6 md:flex md:items-end md:justify-between">
      <div><p className="eyebrow flex items-center gap-1 text-accent-500"><Sparkles size={13} />Local recommendations</p><h1 className="mt-1 font-display text-4xl font-bold uppercase leading-none sm:text-5xl">Discover <span className="text-primary-500">Amazing</span> <span className="text-accent-500">Deals</span></h1></div>
      <button onClick={() => setLocationOpen(true)} className="mt-4 flex max-w-full items-center gap-2 rounded-full border-2 border-ink/20 bg-cream px-3 py-2 font-semibold shadow-sm md:mt-0 hover:border-primary-500 transition"><LocateFixed size={17} className="text-primary-500" /><span className="truncate">{location.label}</span><ChevronDown size={16} /></button>
    </section>

    <div className="sticky top-[66px] z-30 -mx-4 mb-6 border-y border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-xl md:border md:border-ink/10 md:bg-cream">
      <div className="flex items-center gap-2">
        <button onClick={() => setFiltersOpen(!filtersOpen)} className="btn-mustard min-w-0 flex-1 !px-2 sm:flex-none sm:!px-4"><Filter size={17} />Filters{filterCount > 0 && <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] text-white">{filterCount}</span>}</button>
        <label className="relative hidden sm:block"><span className="sr-only">Sort deals</span><select className="field min-w-44 appearance-none pr-9 font-semibold" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as Filters["sort"] })}><option value="distance">Nearest first</option><option value="discount">Biggest discount</option><option value="ending">Ending soon</option><option value="rating">Top rated</option></select><SlidersHorizontal className="pointer-events-none absolute right-3 top-3" size={18} /></label>
        <div className="ml-auto flex shrink-0 overflow-hidden rounded-lg border border-ink/20 bg-cream"><button onClick={() => setView("list")} className={clsx("flex h-11 w-11 items-center justify-center gap-1 font-display uppercase sm:w-auto sm:px-3", view === "list" && "bg-primary-500 text-white")} aria-label="List view"><List size={18} /><span className="hidden sm:inline">List</span></button><button onClick={() => setView("map")} className={clsx("flex h-11 w-11 items-center justify-center gap-1 border-l border-ink/20 font-display uppercase sm:w-auto sm:px-3", view === "map" && "bg-primary-500 text-white")} aria-label="Map view"><Map size={18} /><span className="hidden sm:inline">Map</span></button></div>
      </div>
      {filtersOpen && <div className="mt-3 grid grid-cols-2 gap-3 border-t border-dashed border-ink/20 pt-3 md:grid-cols-5">
        <FilterSelect label="Cuisine" value={filters.cuisine} onChange={(value) => setFilters({ ...filters, cuisine: value })} options={["", ...cuisines]} empty="All cuisines" />
        <FilterSelect label="Radius" value={String(filters.radius)} onChange={(value) => setFilters({ ...filters, radius: Number(value) })} options={["3", "5", "10", "25", "50"]} suffix=" mi" />
        <FilterSelect label="Discount" value={String(filters.minDiscount)} onChange={(value) => setFilters({ ...filters, minDiscount: Number(value) })} options={["0", "20", "30", "40", "50"]} prefix="At least " suffix="%" />
        <FilterSelect label="Dietary" value={filters.dietary} onChange={(value) => setFilters({ ...filters, dietary: value })} options={["", "vegan", "vegetarian", "gluten-free", "halal"]} empty="Any diet" />
        <label className="flex items-end"><span className="flex h-[46px] w-full items-center gap-2 rounded-lg border border-ink/20 bg-white px-3 font-semibold"><input type="checkbox" checked={filters.endingSoon} onChange={(event) => setFilters({ ...filters, endingSoon: event.target.checked })} className="h-5 w-5 accent-primary-500" />Ending soon</span></label>
        <label className="col-span-2 sm:hidden"><span className="eyebrow mb-1 block">Sort</span><select className="field" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as Filters["sort"] })}><option value="distance">Nearest first</option><option value="discount">Biggest discount</option><option value="ending">Ending soon</option><option value="rating">Top rated</option></select></label>
      </div>}
    </div>

    {!loading && !error && <div className="mb-4 flex items-baseline justify-between"><p className="font-display text-xl font-semibold uppercase">{deals.length} deal{deals.length === 1 ? "" : "s"} nearby</p><p className="font-mono text-[10px] uppercase text-ink/55">Updated just now</p></div>}
    {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void loadDeals()} /> : deals.length === 0 ? <EmptyState title="No deals found" message="Try widening your radius or clearing a filter. Fresh deals land throughout the day." action={<button className="btn-mustard" onClick={() => setFilters({ radius: 25, cuisine: "", minDiscount: 0, dietary: "", endingSoon: false, sort: "distance" })}>Clear filters</button>} /> : view === "map" ? <DealMap deals={deals} center={location} /> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{deals.map((deal) => <DealCard key={deal.id} deal={deal} onSave={save} saved={savedIds.has(deal.id)} />)}</div>}
    <LocationDialog open={locationOpen} onClose={() => setLocationOpen(false)} onSelect={selectLocation} onCurrentLocation={() => locate(true)} />
  </div>;
}

function FilterSelect({ label, value, onChange, options, empty, prefix = "", suffix = "" }: { label: string; value: string; onChange: (value: string) => void; options: string[]; empty?: string; prefix?: string; suffix?: string }) {
  return <label><span className="eyebrow mb-1 block">{label}</span><select className="field capitalize" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option ? `${prefix}${option}${suffix}` : empty}</option>)}</select></label>;
}

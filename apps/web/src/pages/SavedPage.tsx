import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Deal } from "../types";
import { DealCard } from "../components/DealCard";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export function SavedPage() {
  const { user, loading: authLoading } = useAuth(); const [deals, setDeals] = useState<Deal[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { if (!user) { setLoading(false); return; } try { setLoading(true); setDeals((await api<{ deals: Deal[] }>("/users/me/saved")).deals); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load saves"); } finally { setLoading(false); } }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function remove(deal: Deal) { setDeals((items) => items.filter((item) => item.id !== deal.id)); await api(`/deals/${deal.id}/save`, { method: "DELETE" }).catch(() => void load()); }
  if (authLoading || loading) return <LoadingState />;
  if (!user) return <EmptyState title="Keep your best finds" message="Log in to save deals and find them again before they expire." action={<Link to="/login/customer" className="btn-primary">Log in</Link>} />;
  return <div className="px-4 py-7 md:px-8"><div className="mb-6"><p className="eyebrow flex items-center gap-1 text-primary-500"><Bookmark size={13} />Your shortlist</p><h1 className="font-display text-4xl font-bold uppercase">Saved deals</h1><p className="mt-1 text-ink/60">Never miss a great offer. Your favorites are always here.</p></div>{error ? <ErrorState message={error} retry={() => void load()} /> : deals.length === 0 ? <EmptyState title="Nothing tucked away" message="Tap the bookmark on any deal to save it here." action={<Link to="/" className="btn-mustard">Browse deals</Link>} /> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{deals.map((deal) => <DealCard key={deal.id} deal={deal} saved onSave={remove} />)}</div>}</div>;
}

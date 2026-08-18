import { useState } from "react";
import { Bell, LogOut, Store, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { enableNotifications } from "../lib/push";
import { LoadingState } from "../components/States";

export function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth(); const navigate = useNavigate(); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  if (loading) return <LoadingState />;
  if (!user) return <div className="p-8 text-center"><p className="mb-4">Log in to see your account.</p><Link to="/login/customer" className="btn-primary">Log in</Link></div>;
  async function notifications() { setBusy(true); try { await enableNotifications(); setNotice("Notifications are on. We’ll keep them useful."); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not enable notifications"); } finally { setBusy(false); } }
  async function enroll() { setBusy(true); try { await api("/merchant/enroll", { method: "POST" }); await refresh(); navigate("/merchant"); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not create merchant account"); } finally { setBusy(false); } }
  return <div className="mx-auto max-w-2xl px-4 py-8"><div className="ticket rounded-xl p-6"><div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-accent-500 text-white"><UserRound size={30} /></div><div><p className="eyebrow text-accent-500">{user.role.toLowerCase()} account</p><h1 className="font-display text-3xl font-bold uppercase">{user.name}</h1><p className="text-sm text-ink/55">{user.email}</p></div></div><div className="mt-6 grid gap-3 border-t-2 border-dashed border-ink/20 pt-6"><button onClick={() => void notifications()} disabled={busy} className="btn-mustard justify-start"><Bell size={18} />Enable deal alerts</button>{user.role === "CONSUMER" ? <button onClick={() => void enroll()} disabled={busy} className="btn-ghost justify-start !border-ink"><Store size={18} />I own a restaurant</button> : <Link to="/merchant" className="btn-ghost justify-start !border-ink"><Store size={18} />Open merchant dashboard</Link>}<button onClick={() => void logout()} className="btn-ghost justify-start !border-ink text-tomato"><LogOut size={18} />Log out</button></div>{notice && <p className="mt-4 border-l-4 border-primary-500 bg-primary-50 p-3 text-sm">{notice}</p>}</div></div>;
}

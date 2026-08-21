import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Compass, KeyRound, LocateFixed, LogOut, Save, SlidersHorizontal, Store, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { enableNotifications } from "../lib/push";
import { LoadingState } from "../components/States";

type Preferences = { radius: number; cuisine: string; minDiscount: number; dietary: string; endingSoon: boolean; sort: "distance" | "discount" | "ending" | "rating" };
type Profile = { id: string; email: string; name: string; role: "CONSUMER" | "MERCHANT" | "ADMIN"; homeLat: number | null; homeLng: number | null; preferencesJson: Preferences | null; createdAt: string };
type Enrollment = { id: string; venueName: string; venueAddress: string; venueLat: number; venueLng: number; contactPhone: string; contactEmail: string; proofNotes: string; status: "pending" | "approved" | "rejected"; reviewNotes?: string | null };
const DEFAULT_PREFERENCES: Preferences = { radius: 10, cuisine: "", minDiscount: 0, dietary: "", endingSoon: false, sort: "distance" };

export function ProfilePage() {
  const { user, loading: authLoading, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    api<{ profile: Profile }>("/users/me/profile").then(({ profile: result }) => { setProfile(result); setError(""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load your profile."));
  }, [user]);

  useEffect(() => {
    if (user?.role !== "CONSUMER") return;
    api<{ enrollment: Enrollment | null }>("/merchant/enrollment").then(({ enrollment: request }) => { setEnrollment(request); setShowEnrollment(request?.status === "rejected"); }).catch(() => setError("Could not load merchant application status."));
  }, [user?.id, user?.role]);

  if (authLoading || (user && !profile && !error)) return <LoadingState label="Loading your profile…" />;
  if (!user) return <div className="min-h-screen bg-night px-5 py-28 text-center text-white"><p className="mb-5 text-white/60">Log in to see your account.</p><Link to="/login/customer" className="panel-button">Log in</Link></div>;

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("details"); setError(""); setNotice("");
    const form = new FormData(event.currentTarget); const lat = String(form.get("homeLat") || "").trim(); const lng = String(form.get("homeLng") || "").trim();
    try {
      const { user: updated } = await api<{ user: Profile }>("/users/me/profile", { method: "PATCH", body: JSON.stringify({ name: String(form.get("name")), homeLat: lat ? Number(lat) : null, homeLng: lng ? Number(lng) : null }) });
      setProfile((current) => current ? { ...current, ...updated } : updated); await refresh(); setNotice("Profile details saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save profile details."); } finally { setBusy(""); }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("preferences"); setError(""); setNotice(""); const form = new FormData(event.currentTarget);
    const preferences: Preferences = { radius: Number(form.get("radius")), cuisine: String(form.get("cuisine") || ""), minDiscount: Number(form.get("minDiscount")), dietary: String(form.get("dietary") || ""), endingSoon: form.get("endingSoon") === "on", sort: String(form.get("sort")) as Preferences["sort"] };
    try { await api("/users/me/preferences", { method: "PUT", body: JSON.stringify(preferences) }); setProfile((current) => current ? { ...current, preferencesJson: preferences } : current); localStorage.setItem("haragedek-filters", JSON.stringify(preferences)); setNotice("Deal preferences saved."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save deal preferences."); } finally { setBusy(""); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("password"); setError(""); setNotice(""); const form = new FormData(event.currentTarget); const next = String(form.get("newPassword"));
    if (next !== String(form.get("confirmPassword"))) { setError("New passwords do not match."); setBusy(""); return; }
    try { await api("/users/me/password", { method: "PATCH", body: JSON.stringify({ currentPassword: String(form.get("currentPassword")), newPassword: next }) }); event.currentTarget.reset(); setNotice("Password updated."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update password."); } finally { setBusy(""); }
  }

  function detectHomeLocation(form: HTMLFormElement) {
    if (!navigator.geolocation) { setError("Location is not supported by this browser."); return; }
    setBusy("location"); navigator.geolocation.getCurrentPosition((position) => { (form.elements.namedItem("homeLat") as HTMLInputElement).value = String(position.coords.latitude); (form.elements.namedItem("homeLng") as HTMLInputElement).value = String(position.coords.longitude); setBusy(""); setNotice("Location captured. Select Save profile to keep it."); }, () => { setBusy(""); setError("Location permission was denied."); }, { enableHighAccuracy: true });
  }

  async function notifications() { setBusy("notifications"); try { await enableNotifications(); setNotice("Deal alerts are enabled."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not enable notifications."); } finally { setBusy(""); } }

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("enrollment"); setError(""); const form = new FormData(event.currentTarget);
    try { const result = await api<{ enrollment: Enrollment }>("/merchant/enroll", { method: "POST", body: JSON.stringify({ venueName: String(form.get("venueName")), venueAddress: String(form.get("venueAddress")), venueLat: Number(form.get("venueLat")), venueLng: Number(form.get("venueLng")), contactPhone: String(form.get("contactPhone")), contactEmail: String(form.get("contactEmail")), proofNotes: String(form.get("proofNotes")) }) }); setEnrollment(result.enrollment); setShowEnrollment(false); setNotice("Merchant application sent for review."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit merchant application."); } finally { setBusy(""); }
  }

  async function deleteAccount() { if (!deletePassword) return; setBusy("delete"); try { await api("/users/me", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) }); await refresh(); navigate("/"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete account."); } finally { setBusy(""); } }

  const preferences = profile?.preferencesJson ?? DEFAULT_PREFERENCES;
  return <div className="min-h-screen bg-night px-4 pb-20 pt-24 text-white sm:px-6"><div className="mx-auto max-w-5xl">
    <header className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.2),transparent_38%),rgba(255,255,255,.04)] p-6 sm:p-9"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-gold to-amber-700 text-night shadow-[0_15px_40px_rgba(245,158,11,.2)]"><UserRound size={38} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-gold">{user.role.toLowerCase()} account</p><h1 className="mt-1 font-display text-4xl sm:text-5xl">{profile?.name}</h1><p className="mt-1 text-sm text-white/45">Member since {profile ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : ""}</p></div></div></header>
    {(notice || error) && <button type="button" onClick={() => { setNotice(""); setError(""); }} className={`mt-5 w-full rounded-xl border p-3 text-left text-sm ${error ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"}`}>{error || notice}</button>}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Panel icon={<UserRound size={20} />} eyebrow="Personal information" title="Your details"><form onSubmit={saveDetails} className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Display name" defaultValue={profile?.name} wide /><label className="sm:col-span-2"><span className="form-label">Account email</span><input className="form-field opacity-65" value={profile?.email ?? ""} readOnly /><span className="mt-1 block text-xs text-white/35">Email changes require support so your verified login stays secure.</span></label><Field name="homeLat" label="Home latitude" type="number" step="any" defaultValue={profile?.homeLat ?? ""} required={false} /><Field name="homeLng" label="Home longitude" type="number" step="any" defaultValue={profile?.homeLng ?? ""} required={false} /><button type="button" onClick={(event) => detectHomeLocation(event.currentTarget.form!)} disabled={busy === "location"} className="inline-flex items-center gap-2 text-sm font-bold text-cyan-300 sm:col-span-2"><LocateFixed size={17} />{busy === "location" ? "Finding location…" : "Use my current location"}</button><button disabled={Boolean(busy)} className="panel-button justify-center sm:col-span-2"><Save size={17} />{busy === "details" ? "Saving…" : "Save profile"}</button></form></Panel>
      <Panel icon={<SlidersHorizontal size={20} />} eyebrow="Recommendations" title="Deal preferences"><form onSubmit={savePreferences} className="mt-5 grid gap-4 sm:grid-cols-2"><Select name="radius" label="Search radius" defaultValue={String(preferences.radius)} options={[{ value: "3", label: "3 km" }, { value: "5", label: "5 km" }, { value: "10", label: "10 km" }, { value: "25", label: "25 km" }, { value: "50", label: "50 km" }]} /><Field name="cuisine" label="Preferred cuisine" defaultValue={preferences.cuisine} required={false} placeholder="Any cuisine" /><Select name="minDiscount" label="Minimum discount" defaultValue={String(preferences.minDiscount)} options={[{ value: "0", label: "Any offer" }, { value: "20", label: "20%+" }, { value: "30", label: "30%+" }, { value: "50", label: "50%+" }]} /><Select name="dietary" label="Dietary preference" defaultValue={preferences.dietary} options={[{ value: "", label: "Any" }, { value: "halal", label: "Halal" }, { value: "vegan", label: "Vegan" }, { value: "vegetarian", label: "Vegetarian" }, { value: "gluten-free", label: "Gluten-free" }]} /><Select name="sort" label="Sort deals by" defaultValue={preferences.sort} options={[{ value: "distance", label: "Nearest" }, { value: "discount", label: "Biggest discount" }, { value: "ending", label: "Ending soon" }, { value: "rating", label: "Top rated" }]} wide /><label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm sm:col-span-2"><input name="endingSoon" type="checkbox" defaultChecked={preferences.endingSoon} className="h-5 w-5 accent-cyan-300" />Prioritize offers ending soon</label><button disabled={Boolean(busy)} className="panel-button justify-center sm:col-span-2"><Compass size={17} />{busy === "preferences" ? "Saving…" : "Save preferences"}</button></form></Panel>
      <Panel icon={<KeyRound size={20} />} eyebrow="Security" title="Change password"><form onSubmit={changePassword} className="mt-5 grid gap-4"><Field name="currentPassword" label="Current password" type="password" autoComplete="current-password" /><Field name="newPassword" label="New password" type="password" autoComplete="new-password" /><Field name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" /><button disabled={Boolean(busy)} className="rounded-xl border border-white/15 px-4 py-3 font-bold transition hover:bg-white/10">{busy === "password" ? "Updating…" : "Update password"}</button></form></Panel>
      <Panel icon={<Bell size={20} />} eyebrow="Account actions" title="Alerts and access"><div className="mt-5 grid gap-3"><button onClick={() => void notifications()} disabled={Boolean(busy)} className="profile-action"><Bell size={18} />Enable deal alerts</button>{user.role === "CONSUMER" ? <button onClick={() => setShowEnrollment((value) => !value)} disabled={enrollment?.status === "pending"} className="profile-action"><Store size={18} />{enrollment?.status === "pending" ? "Merchant application pending" : enrollment?.status === "rejected" ? "Update merchant application" : "Apply as a venue owner"}</button> : <Link to="/merchant" className="profile-action"><Store size={18} />Open merchant dashboard</Link>}<button onClick={() => void logout()} className="profile-action"><LogOut size={18} />Log out</button><button onClick={() => setShowDelete(true)} className="profile-action !border-red-400/20 !text-red-300"><Trash2 size={18} />Delete account</button></div>{enrollment && <div className={`mt-4 rounded-xl border p-3 text-sm ${enrollment.status === "rejected" ? "border-red-400/25 bg-red-500/10" : "border-cyan-300/20 bg-cyan-300/[0.07]"}`}><strong className="capitalize">Merchant application: {enrollment.status}</strong><p className="mt-1 text-white/55">{enrollment.venueName} · {enrollment.venueAddress}</p>{enrollment.reviewNotes && <p className="mt-1 text-amber-200">Admin note: {enrollment.reviewNotes}</p>}</div>}</Panel>
    </div>
    {showEnrollment && <form onSubmit={submitEnrollment} className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 md:grid-cols-2"><div className="md:col-span-2"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-gold">Merchant verification</p><h2 className="mt-1 font-display text-3xl">Tell us about your venue</h2></div><Field name="venueName" label="Venue name" defaultValue={enrollment?.venueName} /><Field name="contactPhone" label="Contact phone" defaultValue={enrollment?.contactPhone} /><Field name="contactEmail" label="Contact email" type="email" defaultValue={enrollment?.contactEmail || user.email} wide /><Field name="venueAddress" label="Full venue address" defaultValue={enrollment?.venueAddress} wide /><Field name="venueLat" label="Latitude" type="number" step="any" defaultValue={enrollment?.venueLat} /><Field name="venueLng" label="Longitude" type="number" step="any" defaultValue={enrollment?.venueLng} /><label className="md:col-span-2"><span className="form-label">Proof you manage this venue</span><textarea name="proofNotes" required minLength={20} className="form-field min-h-28" defaultValue={enrollment?.proofNotes} /></label><div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setShowEnrollment(false)} className="rounded-xl border border-white/10 px-4 py-2">Cancel</button><button disabled={Boolean(busy)} className="panel-button">Send for review</button></div></form>}
  </div>
  {showDelete && <div className="fixed inset-0 z-[160] grid place-items-center bg-black/80 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15151e] p-6"><h2 className="text-xl font-bold">Delete your account?</h2><p className="mt-2 text-sm text-white/55">This cannot be undone. Enter your password to confirm.</p><label className="mt-4 block"><span className="form-label">Current password</span><input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="form-field" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowDelete(false)} className="rounded-lg border border-white/15 px-4 py-2">Cancel</button><button onClick={() => void deleteAccount()} disabled={busy === "delete" || !deletePassword} className="rounded-lg bg-red-500 px-4 py-2 font-bold disabled:opacity-50">Delete permanently</button></div></div></div>}
  </div>;
}

function Panel({ icon, eyebrow, title, children }: { icon: ReactNode; eyebrow: string; title: string; children: ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300">{icon}</span><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-white/35">{eyebrow}</p><h2 className="font-display text-2xl">{title}</h2></div></div>{children}</section>; }
function Field({ name, label, wide = false, required = true, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; wide?: boolean }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="form-label">{label}</span><input name={name} required={required} className="form-field" {...props} /></label>; }
function Select({ name, label, options, wide = false, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { name: string; label: string; options: { value: string; label: string }[]; wide?: boolean }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="form-label">{label}</span><select name={name} className="form-field" {...props}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }

import { useEffect, useState, type FormEvent } from "react";
import { Bell, LogOut, MapPin, Store, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { enableNotifications } from "../lib/push";
import { LoadingState } from "../components/States";

type Enrollment = {
  id: string;
  venueName: string;
  venueAddress: string;
  venueLat: number;
  venueLng: number;
  contactPhone: string;
  contactEmail: string;
  proofNotes: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string | null;
};

export function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (user?.role !== "CONSUMER") return;
    api<{ enrollment: Enrollment | null }>("/merchant/enrollment")
      .then(({ enrollment: request }) => { setEnrollment(request); setShowEnrollment(request?.status === "rejected"); })
      .catch(() => setNotice("Could not load merchant application status."));
  }, [user?.id, user?.role]);

  if (loading) return <LoadingState />;
  if (!user) return <div className="p-8 text-center"><p className="mb-4">Log in to see your account.</p><Link to="/login/customer" className="btn-primary">Log in</Link></div>;

  async function notifications() {
    setBusy(true);
    try { await enableNotifications(); setNotice("Notifications are on. We’ll keep them useful."); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not enable notifications"); }
    finally { setBusy(false); }
  }

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ enrollment: Enrollment }>("/merchant/enroll", {
        method: "POST",
        body: JSON.stringify({
          venueName: String(form.get("venueName")), venueAddress: String(form.get("venueAddress")),
          venueLat: Number(form.get("venueLat")), venueLng: Number(form.get("venueLng")),
          contactPhone: String(form.get("contactPhone")), contactEmail: String(form.get("contactEmail")),
          proofNotes: String(form.get("proofNotes")),
        }),
      });
      setEnrollment(result.enrollment); setShowEnrollment(false);
      setNotice("Application sent. You will keep customer access until an admin approves it.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not submit merchant application"); }
    finally { setBusy(false); }
  }

  function detectLocation(form: HTMLFormElement) {
    if (!navigator.geolocation) { setNotice("Location is not supported by this browser."); return; }
    setNotice("Finding your venue location…");
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = form.elements.namedItem("venueLat") as HTMLInputElement;
      const lng = form.elements.namedItem("venueLng") as HTMLInputElement;
      lat.value = String(position.coords.latitude); lng.value = String(position.coords.longitude);
      setNotice("Location captured. Confirm the address and coordinates before submitting.");
    }, () => setNotice("Location permission was denied. Enter the coordinates manually."), { enableHighAccuracy: true });
  }

  async function deleteAccount() {
    if (!deletePassword) return;
    setBusy(true); setNotice("");
    try {
      await api("/users/me", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) });
      await refresh(); navigate("/");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not delete account"); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-2xl px-4 py-8">
    <div className="ticket rounded-xl p-6">
      <div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-accent-500 text-white"><UserRound size={30} /></div><div><p className="eyebrow text-accent-500">{user.role.toLowerCase()} account</p><h1 className="font-display text-3xl font-bold uppercase">{user.name}</h1><p className="text-sm text-ink/55">{user.email}</p></div></div>
      <div className="mt-6 grid gap-3 border-t-2 border-dashed border-ink/20 pt-6">
        <button onClick={() => void notifications()} disabled={busy} className="btn-mustard justify-start"><Bell size={18} />Enable deal alerts</button>
        {user.role === "CONSUMER" ? <button onClick={() => setShowEnrollment((value) => !value)} disabled={enrollment?.status === "pending"} className="btn-ghost justify-start !border-ink"><Store size={18} />{enrollment?.status === "pending" ? "Merchant application pending" : enrollment?.status === "rejected" ? "Update merchant application" : "Apply as a venue owner"}</button> : <Link to="/merchant" className="btn-ghost justify-start !border-ink"><Store size={18} />Open merchant dashboard</Link>}
        <button onClick={() => void logout()} className="btn-ghost justify-start !border-ink text-tomato"><LogOut size={18} />Log out</button>
        <button onClick={() => setShowDelete(true)} className="btn-ghost justify-start !border-red-300 text-tomato"><Trash2 size={18} />Delete account</button>
      </div>
      {enrollment && <div className={`mt-4 rounded-lg border p-3 text-sm ${enrollment.status === "rejected" ? "border-red-300 bg-red-50" : "border-primary-300 bg-primary-50"}`}><strong className="capitalize">Merchant application: {enrollment.status}</strong><p className="mt-1">{enrollment.venueName} · {enrollment.venueAddress}</p>{enrollment.reviewNotes && <p className="mt-1">Admin note: {enrollment.reviewNotes}</p>}</div>}
      {notice && <p className="mt-4 border-l-4 border-primary-500 bg-primary-50 p-3 text-sm">{notice}</p>}
    </div>

    {showEnrollment && <form onSubmit={submitEnrollment} className="ticket mt-5 grid gap-4 rounded-xl p-6 md:grid-cols-2">
      <div className="md:col-span-2"><p className="eyebrow text-accent-500">Merchant verification</p><h2 className="font-display text-2xl font-bold uppercase">Tell us about your venue</h2><p className="mt-1 text-sm text-ink/60">After approval, this login becomes merchant-only. Use another email if you also want a customer account.</p></div>
      <Field name="venueName" label="Venue name" defaultValue={enrollment?.venueName} />
      <Field name="contactPhone" label="Contact phone" defaultValue={enrollment?.contactPhone} />
      <Field name="contactEmail" label="Contact email" type="email" defaultValue={enrollment?.contactEmail || user.email} wide />
      <Field name="venueAddress" label="Full venue address" defaultValue={enrollment?.venueAddress} wide />
      <Field name="venueLat" label="Latitude" type="number" step="any" defaultValue={enrollment?.venueLat} />
      <Field name="venueLng" label="Longitude" type="number" step="any" defaultValue={enrollment?.venueLng} />
      <button type="button" onClick={(event) => detectLocation(event.currentTarget.form!)} className="btn-ghost justify-start !border-ink md:col-span-2"><MapPin size={17} />Use my current location</button>
      <label className="md:col-span-2"><span className="form-label">Proof you manage this venue</span><textarea name="proofNotes" required minLength={20} className="form-field min-h-28" defaultValue={enrollment?.proofNotes} placeholder="Your role, company details, venue website/social page, or how an admin can verify you…" /></label>
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setShowEnrollment(false)} className="btn-ghost !border-ink">Cancel</button><button disabled={busy} className="btn-primary">{busy ? "Sending…" : "Send for admin review"}</button></div>
    </form>}

    {showDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl bg-[#15151e] p-6 text-white"><h2 className="text-xl font-bold">Delete your account?</h2><p className="mt-2 text-sm text-white/60">Your identity will be anonymized. Redemption and offer-feedback history stays for fraud prevention and reporting. This cannot be undone.</p><label className="mt-4 block"><span className="form-label">Confirm your password</span><input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="form-field" autoComplete="current-password" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowDelete(false)} className="rounded-lg border border-white/15 px-4 py-2">Cancel</button><button onClick={() => void deleteAccount()} disabled={busy || !deletePassword} className="rounded-lg bg-red-500 px-4 py-2 font-bold disabled:opacity-50">Delete permanently</button></div></div></div>}
  </div>;
}

function Field({ name, label, type = "text", step, defaultValue, wide = false }: { name: string; label: string; type?: string; step?: string; defaultValue?: string | number; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="form-label">{label}</span><input name={name} type={type} step={step} required className="form-field" defaultValue={defaultValue} /></label>;
}

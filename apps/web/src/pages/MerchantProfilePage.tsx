import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Building2, ImagePlus, KeyRound, LogOut, Save, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { SafeImage } from "../components/SafeImage";

export type MerchantProfileVenue = {
  id: string;
  name: string;
  address: string;
  cuisine: string;
  lat: number;
  lng: number;
  phone?: string | null;
  photoUrl: string | null;
};

type AccountProfile = {
  id: string;
  email: string;
  name: string;
  role: "CONSUMER" | "MERCHANT" | "ADMIN";
  homeLat: number | null;
  homeLng: number | null;
  createdAt: string;
};

export function MerchantProfilePage({ venues, onVenueChanged }: { venues: MerchantProfileVenue[]; onVenueChanged: () => Promise<void> }) {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ profile: AccountProfile }>("/users/me/profile")
      .then(({ profile: result }) => { setProfile(result); setError(""); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the merchant profile."));
  }, [user]);

  function showResult(message: string, isError = false) {
    setNotice(isError ? "" : message);
    setError(isError ? message : "");
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setBusy("account");
    const form = new FormData(event.currentTarget);
    try {
      const { user: updated } = await api<{ user: AccountProfile }>("/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: String(form.get("name")), homeLat: profile.homeLat, homeLng: profile.homeLng }),
      });
      setProfile((current) => current ? { ...current, ...updated } : updated);
      await refresh();
      showResult("Account details saved.");
    } catch (reason) {
      showResult(reason instanceof Error ? reason.message : "Could not save account details.", true);
    } finally {
      setBusy("");
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("password");
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirmPassword"))) {
      showResult("New passwords do not match.", true);
      setBusy("");
      return;
    }
    try {
      await api("/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: String(form.get("currentPassword")), newPassword }),
      });
      formElement.reset();
      showResult("Password updated.");
    } catch (reason) {
      showResult(reason instanceof Error ? reason.message : "Could not update the password.", true);
    } finally {
      setBusy("");
    }
  }

  async function leaveApplication() {
    setBusy("logout");
    await logout();
    navigate("/login/merchant", { replace: true });
  }

  async function deleteAccount() {
    if (!deletePassword || !deleteConfirmed) return;
    setBusy("delete");
    try {
      await api("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, deleteOwnedVenues: true }),
      });
      await refresh();
      navigate("/login/merchant", { replace: true });
    } catch (reason) {
      setShowDelete(false);
      showResult(reason instanceof Error ? reason.message : "Could not delete the merchant account.", true);
    } finally {
      setBusy("");
      setDeletePassword("");
      setDeleteConfirmed(false);
    }
  }

  return <div className="mt-7">
    <div>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Merchant profile</p>
      <h1 className="mt-1 text-3xl font-semibold">Account and venue settings</h1>
      <p className="mt-1 text-sm text-white/55">Manage your sign-in details and the business information customers see.</p>
    </div>

    {(notice || error) && <button type="button" onClick={() => { setNotice(""); setError(""); }} className={`mt-5 w-full rounded-xl border p-3 text-left text-sm ${error ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"}`}>{error || notice}</button>}

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <ProfilePanel icon={<UserRound size={20} />} eyebrow="Account" title="Your details">
        <form onSubmit={saveAccount} className="mt-5 grid gap-4">
          <MerchantField name="name" label="Display name" defaultValue={profile?.name ?? user?.name} />
          <label><span className="form-label">Login email</span><input className="form-field opacity-65" value={profile?.email ?? user?.email ?? ""} readOnly /><span className="mt-1 block text-xs text-white/35">Contact support if the verified login email must change.</span></label>
          <button disabled={Boolean(busy) || !profile} className="panel-button justify-center"><Save size={17} />{busy === "account" ? "Saving..." : "Save account"}</button>
        </form>
      </ProfilePanel>

      <ProfilePanel icon={<KeyRound size={20} />} eyebrow="Security" title="Change password">
        <form onSubmit={changePassword} className="mt-5 grid gap-4">
          <MerchantField name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
          <MerchantField name="newPassword" label="New password" type="password" autoComplete="new-password" />
          <MerchantField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
          <button disabled={Boolean(busy)} className="rounded-xl border border-white/15 px-4 py-3 font-bold transition hover:bg-white/10 disabled:opacity-50">{busy === "password" ? "Updating..." : "Update password"}</button>
        </form>
      </ProfilePanel>
    </div>

    <section className="mt-6">
      <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold">Public business profile</p><h2 className="mt-1 text-2xl font-semibold">Venue details</h2></div>
      <div className="grid gap-6">
        {venues.map((venue) => <VenueProfileForm key={venue.id} venue={venue} busy={busy} setBusy={setBusy} onSaved={async () => { await onVenueChanged(); showResult(`${venue.name} profile updated.`); }} onError={(message) => showResult(message, true)} />)}
        {!venues.length && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100">No venue is attached to this account yet. Your account and security settings are still available.</div>}
      </div>
    </section>

    <section className="mt-6 grid gap-4 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div><p className="flex items-center gap-2 font-bold text-red-200"><ShieldAlert size={19} />Account actions</p><p className="mt-1 text-sm text-white/50">Log out safely, or permanently delete this merchant account and all of its venue data.</p></div>
      <div className="flex flex-wrap gap-2 sm:justify-end"><button type="button" onClick={() => void leaveApplication()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 font-bold text-white/80 hover:bg-white/10 disabled:opacity-50"><LogOut size={17} />{busy === "logout" ? "Logging out..." : "Log out"}</button><button type="button" onClick={() => setShowDelete(true)} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 font-bold text-white hover:bg-red-400 disabled:opacity-50"><Trash2 size={17} />Delete account</button></div>
    </section>

    {showDelete && <div className="fixed inset-0 z-[160] grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-merchant-title"><div className="w-full max-w-lg rounded-2xl border border-red-400/20 bg-[#15151e] p-6"><Trash2 className="text-red-300" size={28} /><h2 id="delete-merchant-title" className="mt-3 text-2xl font-bold">Delete merchant account?</h2><p className="mt-2 text-sm leading-6 text-white/55">This permanently removes the account, owned venues, offers, menus, followers, and redemption history. It cannot be undone.</p><label className="mt-4 block"><span className="form-label">Current password</span><input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="form-field" /></label><label className="mt-4 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100"><input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500" /><span>I understand that the merchant account and all owned venue data will be permanently deleted.</span></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setShowDelete(false); setDeletePassword(""); setDeleteConfirmed(false); }} className="rounded-xl border border-white/15 px-4 py-2">Cancel</button><button type="button" onClick={() => void deleteAccount()} disabled={busy === "delete" || !deletePassword || !deleteConfirmed} className="rounded-xl bg-red-500 px-4 py-2 font-bold disabled:opacity-50">{busy === "delete" ? "Deleting..." : "Delete permanently"}</button></div></div></div>}
  </div>;
}

function VenueProfileForm({ venue, busy, setBusy, onSaved, onError }: { venue: MerchantProfileVenue; busy: string; setBusy: (value: string) => void; onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(venue.photoUrl);
  const busyKey = `venue-${venue.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(busyKey);
    const form = new FormData(event.currentTarget);
    try {
      await api(`/merchant/venues/${venue.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name")),
          cuisine: String(form.get("cuisine")),
          address: String(form.get("address")),
          phone: String(form.get("phone") || "").trim() || null,
          lat: Number(form.get("lat")),
          lng: Number(form.get("lng")),
          photoUrl,
        }),
      });
      await onSaved();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not update the venue profile.");
    } finally {
      setBusy("");
    }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    try { setPhotoUrl(await readImage(file)); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "Could not read that image."); }
  }

  return <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><Building2 size={22} /></span><div><h3 className="text-xl font-semibold">{venue.name}</h3><p className="text-xs text-white/40">Shown to customers in search, maps, and offers</p></div></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <MerchantField name="name" label="Venue name" defaultValue={venue.name} />
      <MerchantField name="cuisine" label="Cuisine or venue type" defaultValue={venue.cuisine} />
      <MerchantField name="address" label="Full address" defaultValue={venue.address} wide />
      <MerchantField name="phone" label="Public phone" type="tel" defaultValue={venue.phone ?? ""} required={false} />
      <div className="hidden md:block" />
      <MerchantField name="lat" label="Latitude" type="number" step="any" defaultValue={venue.lat} />
      <MerchantField name="lng" label="Longitude" type="number" step="any" defaultValue={venue.lng} />
      <label className="md:col-span-2"><span className="form-label">Venue image</span><div className="mt-1 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/10 p-3 sm:flex-row sm:items-center">{photoUrl ? <SafeImage src={photoUrl} alt={`${venue.name} preview`} className="h-24 w-28 rounded-lg object-cover" /> : <span className="grid h-24 w-28 place-items-center rounded-lg bg-white/5 text-white/30"><ImagePlus size={25} /></span>}<div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void chooseImage(event.target.files?.[0])} />Choose image</label>{photoUrl && <button type="button" onClick={() => setPhotoUrl(null)} className="rounded-lg border border-red-400/20 px-3 py-2 text-sm font-bold text-red-300">Remove</button>}<p className="w-full text-xs text-white/35">JPG, PNG, or WebP up to 2 MB.</p></div></div></label>
      <button disabled={Boolean(busy)} className="panel-button justify-center md:col-span-2"><Save size={17} />{busy === busyKey ? "Saving venue..." : "Save venue profile"}</button>
    </div>
  </form>;
}

function ProfilePanel({ icon, eyebrow, title, children }: { icon: ReactNode; eyebrow: string; title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300">{icon}</span><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-white/35">{eyebrow}</p><h2 className="text-2xl font-semibold">{title}</h2></div></div>{children}</section>;
}

function MerchantField({ name, label, wide = false, required = true, ...props }: InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="form-label">{label}</span><input name={name} required={required} className="form-field" {...props} /></label>;
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error("Image must be 2 MB or smaller."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LocateFixed, MailCheck, Moon } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { SafeImage } from "../components/SafeImage";

type AccountType = "CONSUMER" | "MERCHANT" | "ADMIN";

export function AuthPage() {
  const { pathname } = useLocation();
  const isRegister = pathname.startsWith("/register/");
  const accountType = useMemo<AccountType>(() => pathname.endsWith("/merchant") ? "MERCHANT" : pathname.endsWith("/admin") ? "ADMIN" : "CONSUMER", [pathname]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [devVerificationUrl, setDevVerificationUrl] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [venueImage, setVenueImage] = useState<File | null>(null);
  const [venueImagePreview, setVenueImagePreview] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueLat, setVenueLat] = useState("");
  const [venueLng, setVenueLng] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [params] = useSearchParams();
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const label = accountType === "MERCHANT" ? "merchant" : accountType === "ADMIN" ? "admin" : "customer";
  const destination = accountType === "MERCHANT" ? "/merchant" : accountType === "ADMIN" ? "/admin" : "/";

  useEffect(() => {
    if (params.get("verified") === "1") setNotice("Email verified successfully. Log in to continue.");
  }, [params]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    setUnverifiedEmail("");
    const form = new FormData(formElement);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (isRegister) {
      const passwordError = validatePassword(password);
      if (passwordError) { setError(passwordError); setBusy(false); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); setBusy(false); return; }
    }

    try {
      if (isRegister) {
        const signupData = new FormData();
        signupData.set("accountType", accountType);
        signupData.set("name", String(form.get("name") || ""));
        signupData.set("email", email);
        signupData.set("password", password);
        signupData.set("confirmPassword", confirmPassword);
        if (accountType === "MERCHANT") {
          signupData.set("venueName", String(form.get("venueName") || ""));
          signupData.set("venueAddress", venueAddress);
          signupData.set("venueLat", venueLat);
          signupData.set("venueLng", venueLng);
        }
        if (accountType === "MERCHANT" && venueImage) signupData.set("venueImage", venueImage);
        const result = await api<{ message: string; devVerificationUrl?: string }>("/auth/signup", {
          method: "POST",
          body: signupData,
        });
        setNotice(result.message);
        setDevVerificationUrl(result.devVerificationUrl || "");
        setRegisteredEmail(email);
        formElement.reset();
        if (venueImagePreview) URL.revokeObjectURL(venueImagePreview);
        setVenueImage(null);
        setVenueImagePreview("");
        setVenueAddress("");
        setVenueLat("");
        setVenueLng("");
        setLocationMessage("");
      } else {
        await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole: accountType }) });
        await refresh();
        navigate(destination);
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(String(reason.details?.email || email));
      }
      setError(reason instanceof Error ? reason.message : "Could not continue");
    } finally {
      setBusy(false);
    }
  }

  function chooseVenueImage(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Venue image must be a JPG, PNG, or WebP file."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Venue image must be 2 MB or smaller."); return; }
    if (venueImagePreview) URL.revokeObjectURL(venueImagePreview);
    setVenueImage(file);
    setVenueImagePreview(URL.createObjectURL(file));
  }

  function findVenueLocation() {
    setError("");
    setLocationMessage("");
    if (!navigator.geolocation) { setError("Location is not supported by this browser. Enter the coordinates manually."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setVenueLat(position.coords.latitude.toFixed(6));
        setVenueLng(position.coords.longitude.toFixed(6));
        setLocationMessage(`Location captured (approximately ${Math.round(position.coords.accuracy)} m accuracy). Confirm the venue address below.`);
        setLocating(false);
      },
      (locationError) => {
        setError(locationError.code === locationError.PERMISSION_DENIED
          ? "Location permission was blocked. Allow it in browser settings or enter the venue coordinates manually."
          : "Could not find the venue location. Enter its coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }

  async function resend(email: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string; devVerificationUrl?: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setNotice(result.message);
      setDevVerificationUrl(result.devVerificationUrl || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not resend verification email");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    const userDestination = user.role === "MERCHANT" ? "/merchant" : user.role === "ADMIN" ? "/admin" : "/";
    return <AuthShell><div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center"><p className="mb-2 text-white/70">You are logged in as</p><p className="mb-4 font-semibold text-white">{user.email}</p><div className="flex flex-col gap-3"><Link to={userDestination} className="panel-button justify-center">Continue</Link><button type="button" onClick={logout} className="rounded-xl border border-white/10 px-4 py-3 font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">Log out / switch account</button></div></div></AuthShell>;
  }

  if (isRegister && registeredEmail) {
    return <AuthShell><main className="grid min-h-screen place-items-center px-4 py-10"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-300 text-[#07151a]"><MailCheck size={32} /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-gold">Registration received</p><h1 className="mt-2 font-display text-4xl text-white">Check your email</h1><p className="mt-4 text-sm leading-6 text-white/60">We sent a verification link to</p><p className="mt-1 break-all font-bold text-white">{registeredEmail}</p><p className="mt-4 text-xs leading-5 text-white/45">Open the link within 24 hours. Check the spam or junk folder if it is not in your inbox.</p>{notice && <p className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">{notice}</p>}{error && <p className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<button type="button" disabled={busy} onClick={() => void resend(registeredEmail)} className="panel-button mt-6 w-full justify-center">{busy ? "Sending..." : "Resend verification email"}</button><Link to={`/login/${label}`} className="mt-4 inline-flex text-sm font-semibold text-white/55 underline">Back to login</Link></section></main></AuthShell>;
  }

  return <AuthShell>
    <div className="grid min-h-screen lg:grid-cols-[minmax(320px,.8fr)_1fr]">
      <section className="hidden border-r border-white/10 bg-white/[0.035] p-10 lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-gold">{accountType === "MERCHANT" ? "Venue partners" : accountType === "ADMIN" ? "Venue operations" : "Great deals every day"}</p><h1 className="mt-3 max-w-lg font-display text-5xl font-semibold leading-tight text-white">{accountType === "MERCHANT" ? "Put your best offers in front of Baku." : accountType === "ADMIN" ? "Keep WhereToGo trusted." : "Save deals and claim your QR code."}</h1><p className="mt-5 max-w-md text-white/55">{isRegister ? "Create your account and verify your email before signing in." : `Sign in through the dedicated ${label} portal.`}</p></div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">{isRegister ? `Register as ${label}` : `${label} login`}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{isRegister ? accountType === "MERCHANT" ? "Register your venue" : "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-white/55">{isRegister ? "You must verify your email before you can log in." : accountType === "MERCHANT" ? "Manage your venue and offers." : accountType === "ADMIN" ? "Review venues and platform activity." : "Log in to save deals and receive QR codes."}</p>
          {notice && <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100"><p>{notice}</p>{devVerificationUrl && <Link to={new URL(devVerificationUrl).pathname + new URL(devVerificationUrl).search} className="mt-2 inline-flex font-semibold underline">Development verification link</Link>}</div>}
          <form onSubmit={submit} className="mt-6 space-y-4">
            {isRegister && <label className="block"><span className="form-label">Name</span><input className="form-field" name="name" autoComplete="name" required minLength={2} maxLength={60} placeholder={accountType === "MERCHANT" ? "Contact name" : "Your name"} /></label>}
            {isRegister && accountType === "MERCHANT" && <label className="block"><span className="form-label">Venue name</span><input className="form-field" name="venueName" required maxLength={120} placeholder="Restaurant, bar, or venue name" /><span className="mt-1 block text-xs text-white/45">This gives the admin context; it does not create or claim a venue.</span></label>}
            {isRegister && accountType === "MERCHANT" && <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><legend className="px-2 text-[10px] font-bold uppercase tracking-[.16em] text-gold">Venue location</legend><p className="text-xs leading-5 text-white/50">Use your current position while you are at the venue, or enter the exact address and coordinates manually.</p><button type="button" onClick={findVenueLocation} disabled={locating} className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-50"><LocateFixed size={17} />{locating ? "Finding venue location..." : "Use my current location"}</button>{locationMessage && <p className="rounded-lg bg-emerald-400/10 p-2 text-xs text-emerald-200">{locationMessage}</p>}<label className="block"><span className="form-label">Full venue address</span><input className="form-field" value={venueAddress} onChange={(event) => setVenueAddress(event.target.value)} required maxLength={240} autoComplete="street-address" placeholder="Street, building, district, Baku" /></label><div className="grid grid-cols-2 gap-3"><label><span className="form-label">Latitude</span><input className="form-field" value={venueLat} onChange={(event) => setVenueLat(event.target.value)} required type="number" min={-90} max={90} step="any" inputMode="decimal" placeholder="40.4093" /></label><label><span className="form-label">Longitude</span><input className="form-field" value={venueLng} onChange={(event) => setVenueLng(event.target.value)} required type="number" min={-180} max={180} step="any" inputMode="decimal" placeholder="49.8671" /></label></div><p className="text-[11px] leading-4 text-white/40">For manual entry, copy the latitude and longitude from the venue pin in Google Maps.</p></fieldset>}
            {isRegister && accountType === "MERCHANT" && <label className="block"><span className="form-label">Venue logo or photo</span><span className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.035] p-3">{venueImagePreview ? <SafeImage src={venueImagePreview} alt="Venue preview" className="h-16 w-16 rounded-xl object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-2xl text-white/35">+</span>}<span className="min-w-0 flex-1"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseVenueImage(event.target.files?.[0])} className="block w-full text-xs text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-gold file:px-3 file:py-2 file:font-bold file:text-night" /><span className="mt-1 block text-xs text-white/40">Optional · JPG, PNG or WebP · maximum 2 MB</span></span></span></label>}
            <label className="block"><span className="form-label">Email</span><input className="form-field" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
            <PasswordField name="password" label="Password" visible={showPassword} setVisible={setShowPassword} autoComplete={isRegister ? "new-password" : "current-password"} />
            {isRegister && <><PasswordField name="confirmPassword" label="Retype password" visible={showConfirmPassword} setVisible={setShowConfirmPassword} autoComplete="new-password" /><p className="text-xs text-white/45">Minimum 8 characters with one uppercase and one lowercase letter.</p></>}
            {error && <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200"><p>{error}</p>{unverifiedEmail && <button type="button" disabled={busy} onClick={() => void resend(unverifiedEmail)} className="mt-2 underline">Resend verification email</button>}</div>}
            <button className="panel-button mt-2 w-full justify-center" disabled={busy}>{busy ? "Working…" : isRegister ? "Create account" : "Log in"}<ArrowRight size={18} /></button>
          </form>
          {accountType !== "ADMIN" && <div className="mt-5 space-y-3 text-center text-sm"><Link className="block font-semibold text-cyan-300 underline" to={isRegister ? `/login/${label}` : `/register/${label}`}>{isRegister ? "Already registered? Log in" : accountType === "MERCHANT" ? "New partner? Register your venue" : "New here? Register as a customer"}</Link><Link className="block text-white/50 hover:text-white" to={accountType === "MERCHANT" ? "/login/customer" : "/login/merchant"}>{accountType === "MERCHANT" ? "Customer login" : "Merchant login"}</Link></div>}
        </div>
      </section>
    </div>
  </AuthShell>;
}

function Brand() { return <Link to="/" className="inline-flex items-center gap-3 text-white"><span className="grid h-11 w-11 place-items-center rounded-xl bg-gold text-night"><Moon size={23} /></span><span className="text-xl font-bold">Baku<span className="text-gold">Nights</span></span></Link>; }

function PasswordField({ name, label, visible, setVisible, autoComplete }: { name: string; label: string; visible: boolean; setVisible: (value: boolean) => void; autoComplete: string }) {
  return <label className="block"><span className="form-label">{label}</span><span className="relative block"><input className="form-field pr-12" name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={8} maxLength={128} placeholder="At least 8 characters" /><button type="button" onClick={() => setVisible(!visible)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>;
}

function AuthShell({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-[#09090e] text-white">{children}</div>; }

function validatePassword(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  return "";
}

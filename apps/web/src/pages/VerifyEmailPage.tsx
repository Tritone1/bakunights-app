import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, MailWarning, Moon } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("This verification link has no token."); return; }
    void api<{ message: string; role: "CONSUMER" | "MERCHANT" | "ADMIN" }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then((result) => {
        setStatus("success");
        setMessage(result.message);
        const portal = result.role === "MERCHANT" ? "merchant" : result.role === "ADMIN" ? "admin" : "customer";
        window.setTimeout(() => navigate(`/login/${portal}?verified=1`), 1400);
      })
      .catch((reason) => { setStatus("error"); setMessage(reason instanceof Error ? reason.message : "Could not verify this email."); });
  }, [navigate, token]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") || "");
    try {
      const result = await api<{ message: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setResendMessage(result.message);
    } catch (reason) { setResendMessage(reason instanceof Error ? reason.message : "Could not resend email."); }
  }

  return <div className="min-h-screen bg-[#09090e] px-4 py-10 text-white"><div className="mx-auto max-w-lg"><Link to="/" className="mb-12 inline-flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-gold text-night"><Moon size={23} /></span><span className="text-xl font-bold">Baku<span className="text-gold">Nights</span></span></Link><section className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 sm:p-9">{status === "success" ? <CheckCircle2 className="text-cyan-300" size={38} /> : <MailWarning className={status === "error" ? "text-red-300" : "text-gold"} size={38} />}<h1 className="mt-5 font-display text-4xl">{status === "loading" ? "Checking your link" : status === "success" ? "Email verified" : "Verification problem"}</h1><p className="mt-3 text-white/60">{message}</p>{status === "error" && <form onSubmit={resend} className="mt-7 space-y-3"><label className="block"><span className="form-label">Email</span><input className="form-field" type="email" name="email" required placeholder="you@example.com" /></label><button className="panel-button w-full justify-center">Resend verification email</button>{resendMessage && <p className="text-sm text-cyan-200">{resendMessage}</p>}</form>}{status === "success" && <p className="mt-5 text-sm text-cyan-200">Taking you to login…</p>}</section></div></div>;
}

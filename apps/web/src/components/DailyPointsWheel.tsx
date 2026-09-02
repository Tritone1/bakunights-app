import { useEffect, useRef, useState } from "react";
import { Check, Coins, Copy, Gift, LockKeyhole, Sparkles, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

// Keep this order in sync with the API. All visual slices stay equal-sized;
// the API independently applies the published server-side prize odds. The
// 50- and 60-point slices are 12 positions apart, directly opposite each other.
const POINT_VALUES = [10, 25, 15, 30, 10, 15, 25, 50, 30, 15, 10, 25, 15, 10, 10, 30, 25, 15, 10, 60, 25, 15, 30, 10] as const;
const CASINO_RED = "#A51C30";
const CASINO_BLACK = "#101214";
const FELT_GREEN = "#0B6B4F";
const ANTIQUE_GOLD = "#D4AF37";

type PointReward = {
  id: string;
  rewardCode: string;
  pointsSpent: number;
  discountPct: number;
  maxBillAzn: number;
  issuedAt: string;
  redeemedAt: string | null;
};

type PointsStatus = {
  pointsBalance: number;
  lifetimePoints: number;
  pointsToReward: number;
  rewardThreshold: number;
  canSpin: boolean;
  pendingSpins: number;
  lastSpin: { points: number; createdAt: string } | null;
  activeRewards: PointReward[];
};

type SpinResult = {
  wheelIndex: number;
  pointsEarned: number;
  rewardUnlocked: PointReward | null;
  status: PointsStatus;
};

const slice = 360 / POINT_VALUES.length;
const SLICE_RANGES = POINT_VALUES.map((points, index) => ({
  points,
  startAngle: index * slice,
  endAngle: (index + 1) * slice,
  centerAngle: index * slice + slice / 2,
}));
const sliceColor = (points: number, index: number) => points === 60 ? ANTIQUE_GOLD : points === 50 ? FELT_GREEN : index % 2 === 0 ? CASINO_RED : CASINO_BLACK;
const wheelGradient = `conic-gradient(${SLICE_RANGES.map(({ points, startAngle, endAngle }, index) => `${sliceColor(points, index)} ${startAngle}deg ${endAngle}deg`).join(",")})`;
const sliceDividers = `repeating-conic-gradient(rgba(212,175,55,.5) 0deg .55deg, transparent .55deg ${slice}deg)`;
const wheelBackground = `${sliceDividers}, ${wheelGradient}`;

export function DailyPointsWheel() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PointsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [rewardUnlocked, setRewardUnlocked] = useState<PointReward | null>(null);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!user || user.role !== "CONSUMER") { setStatus(null); setLoading(false); return; }
    let active = true;
    setLoading(true);
    api<{ status: PointsStatus }>("/users/me/points")
      .then(({ status: result }) => { if (active) { setStatus(result); setError(""); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your points."); })
      .finally(() => { if (active) setLoading(false); });
    const refreshTimer = window.setInterval(() => {
      api<{ status: PointsStatus }>("/users/me/points").then(({ status: result }) => { if (active) setStatus(result); }).catch(() => undefined);
    }, 15_000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, [user]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  async function spin() {
    if (!user || spinning || loading || !status?.canSpin) return;
    setSpinning(true);
    setPointsEarned(null);
    setRewardUnlocked(null);
    setError("");
    try {
      const result = await api<SpinResult>("/users/me/points/spin", { method: "POST" });
      const index = Number.isInteger(result.wheelIndex) && result.wheelIndex >= 0 && result.wheelIndex < POINT_VALUES.length
        ? result.wheelIndex
        : POINT_VALUES.indexOf(result.pointsEarned as typeof POINT_VALUES[number]);
      const target = 360 - (SLICE_RANGES[index < 0 ? 0 : index]?.centerAngle ?? 0);
      setRotation((current) => current + 1440 + ((target - (current % 360) + 360) % 360));
      setStatus(result.status);
      timer.current = window.setTimeout(() => {
        setPointsEarned(result.pointsEarned);
        setRewardUnlocked(result.rewardUnlocked);
        setSpinning(false);
      }, 2600);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visit spin could not be completed.");
      setSpinning(false);
      api<{ status: PointsStatus }>("/users/me/points").then(({ status: result }) => setStatus(result)).catch(() => undefined);
    }
  }

  async function copyReward(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(""), 1800);
    } catch {
      setError("Could not copy the code. Select it manually instead.");
    }
  }

  const progress = status ? Math.min(100, (status.pointsBalance / status.rewardThreshold) * 100) : 0;
  return <section className="border-y border-white/[0.07] bg-[#0d0d15] px-5 py-16 sm:px-8">
    <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[minmax(320px,480px)_1fr]">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-300"><Sparkles size={14} />Verified visit rewards</p>
        <h2 className="font-display text-4xl font-semibold text-white sm:text-5xl">Spin. Earn. Save.</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">Visit a participating venue and show your in-app QR code. After the merchant verifies your visit, one spin unlocks. Spin to collect points and build your balance toward a reward.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[.14em]"><span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-cyan-200">1 · Visit venue</span><span className="rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1.5 text-orange-200">2 · Show your QR</span><span className="rounded-full border border-gold/25 bg-gold/10 px-3 py-1.5 text-amber-200">3 · Merchant verifies</span><span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">4 · Spin for points</span></div>

        {!user ? <div className="mt-7 rounded-2xl border border-gold/25 bg-gold/10 p-5"><p className="flex items-center gap-2 font-bold text-amber-100"><LockKeyhole size={18} />Log in to start collecting points</p><p className="mt-1 text-sm text-white/50">Your verified visits, spins, and balance are saved to your customer account.</p><Link to="/login/customer?next=/" className="mt-4 inline-flex rounded-full bg-gold px-5 py-2.5 text-sm font-black text-night">Customer login</Link></div> : <>
          <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/40">Current balance</p><p className="mt-1 flex items-center gap-2 text-3xl font-black text-gold"><Coins size={25} />{status?.pointsBalance ?? 0} points</p></div><p className="text-right text-xs text-white/40">{status ? `${status.pointsToReward} to next reward` : "Loading..."}<br />{status ? `${status.lifetimePoints} lifetime points` : ""}</p></div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-gold transition-[width] duration-700" style={{ width: `${progress}%` }} /></div>
            <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-white/30"><span>0</span><span>500-point reward</span></div>
          </div>

          <button type="button" onClick={() => void spin()} disabled={spinning || loading || !status?.canSpin} className="mt-5 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-black text-night transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"><Coins size={19} />{spinning ? "Spinning..." : loading ? "Loading points..." : status?.canSpin ? `Spin now${status.pendingSpins > 1 ? ` (${status.pendingSpins} available)` : ""}` : "Verify an in-store visit to unlock"}</button>
        </>}

        {error && <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}
        {pointsEarned != null && <div className="mt-5 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5"><p className="flex items-center gap-2 text-xl font-black text-cyan-100"><Trophy size={22} />You earned {pointsEarned} points!</p><p className="mt-1 text-sm text-white/55">Your new balance is {status?.pointsBalance ?? 0} points.</p></div>}
        {rewardUnlocked && <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 p-5 shadow-[0_0_40px_rgba(245,158,11,.12)]"><p className="flex items-center gap-2 text-xl font-black text-amber-100"><Gift size={22} />500-point reward unlocked</p><p className="mt-2 text-sm leading-6 text-white/60">Show this code at a participating venue for 50% off a bill up to 200 AZN. Maximum discount: 100 AZN.</p><RewardCode reward={rewardUnlocked} copied={copiedCode === rewardUnlocked.rewardCode} onCopy={copyReward} /></div>}

        {status?.activeRewards.length ? <div className="mt-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-gold">Ready to use</p><div className="space-y-2">{status.activeRewards.map((reward) => <div key={reward.id} className="rounded-xl border border-gold/20 bg-white/[0.04] p-4"><div className="flex items-center gap-2 text-sm font-bold text-amber-100"><Gift size={17} />{reward.discountPct}% off bills up to {reward.maxBillAzn} AZN</div><RewardCode reward={reward} copied={copiedCode === reward.rewardCode} onCopy={copyReward} /></div>)}</div></div> : null}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[470px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,.2),transparent_66%)] p-[5%]">
        <div className="absolute left-1/2 top-[1%] z-30 -translate-x-1/2 drop-shadow-[0_5px_8px_rgba(0,0,0,.75)]"><div className="h-0 w-0 border-x-[17px] border-t-[31px] border-x-transparent border-t-[#D4AF37]" /><div className="absolute left-1/2 top-[-7px] h-3 w-3 -translate-x-1/2 rounded-full bg-[#FFF4D6] shadow-[0_0_14px_rgba(255,223,128,.95)]" /></div>
        <div className="absolute inset-[5%] rounded-full border-[7px] border-[#D4AF37] bg-[#101214] shadow-[0_28px_80px_rgba(0,0,0,.65),0_0_0_3px_rgba(255,244,214,.1),0_0_48px_rgba(212,175,55,.2)]">
          {SLICE_RANGES.map(({ startAngle }, index) => {
            const angle = startAngle;
            const radians = angle * Math.PI / 180;
            return <span key={`light-${index}`} className="absolute z-20 h-2 w-2 rounded-full bg-[#FFF4D6] shadow-[0_0_9px_rgba(255,223,128,.95)]" style={{ left: `${50 + 47 * Math.sin(radians)}%`, top: `${50 - 47 * Math.cos(radians)}%`, transform: "translate(-50%, -50%)" }} />;
          })}
        </div>
        <div className="absolute inset-[7.2%] overflow-hidden rounded-full border-2 border-[#D4AF37]/50 shadow-inner transition-transform duration-[2500ms] ease-[cubic-bezier(.12,.72,.12,1)]" style={{ background: wheelBackground, transform: `rotate(${rotation}deg)` }}>
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_25%,rgba(255,244,214,.2),transparent_30%),radial-gradient(circle,transparent_52%,rgba(0,0,0,.26)_80%)]" />
          <div className="absolute inset-[29%] rounded-full border-[7px] border-[#D4AF37] bg-[#101214] shadow-[inset_0_0_28px_rgba(0,0,0,.9),0_0_0_3px_rgba(255,244,214,.08)]" />
          {SLICE_RANGES.map(({ points, centerAngle: angle }, index) => {
            const radians = angle * Math.PI / 180;
            const isJackpot = points >= 50;
            return <span key={`${points}-${index}`} className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-1 py-0.5 text-center font-black tabular-nums drop-shadow-md ${isJackpot ? "text-xs sm:text-sm" : "text-[9px] sm:text-[11px]"} ${points === 60 ? "text-[#101214]" : "text-[#FFF4D6]"}`} style={{ left: `${50 + 39.5 * Math.sin(radians)}%`, top: `${50 - 39.5 * Math.cos(radians)}%` }}>+{points}</span>;
          })}
        </div>
        {user ? <button type="button" onClick={() => void spin()} disabled={spinning || loading || !status?.canSpin} className="absolute left-1/2 top-1/2 z-20 grid h-[25%] w-[25%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[6px] border-[#D4AF37] bg-gradient-to-br from-[#FFF4D6] to-[#D4AF37] text-center font-black uppercase text-[#101214] shadow-[0_12px_35px_rgba(0,0,0,.6),inset_0_2px_2px_rgba(255,255,255,.75)] transition hover:scale-105 disabled:opacity-85" aria-label="Spin the verified-visit points wheel">{spinning ? <span className="text-lg">•••</span> : status?.canSpin ? <span><Sparkles className="mx-auto mb-1 text-[#A51C30]" size={20} /><span className="text-sm sm:text-base">Spin</span>{status.pendingSpins > 1 && <small className="block text-[8px] text-[#463713]">{status.pendingSpins} ready</small>}</span> : <span><LockKeyhole className="mx-auto mb-1 text-[#463713]" size={18} /><small className="block text-[8px] leading-tight text-[#463713]">Visit to<br />unlock</small></span>}</button> : <Link to="/login/customer?next=/" className="absolute left-1/2 top-1/2 z-20 grid h-[25%] w-[25%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[6px] border-[#D4AF37] bg-gradient-to-br from-[#FFF4D6] to-[#D4AF37] text-center font-black uppercase text-[#101214] shadow-[0_12px_35px_rgba(0,0,0,.6),inset_0_2px_2px_rgba(255,255,255,.75)]"><span><LockKeyhole className="mx-auto mb-1 text-[#463713]" size={17} /><span className="text-[9px] sm:text-[10px]">Log in<br />to play</span></span></Link>}
      </div>
    </div>
  </section>;
}

function RewardCode({ reward, copied, onCopy }: { reward: PointReward; copied: boolean; onCopy: (code: string) => Promise<void> }) {
  return <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><code className="select-all font-mono text-sm font-black tracking-wider text-white">{reward.rewardCode}</code><button type="button" onClick={() => void onCopy(reward.rewardCode)} className="inline-flex items-center gap-1 text-xs font-bold text-cyan-300">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>;
}

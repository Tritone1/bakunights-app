import { useMemo, useRef, useState } from "react";
import { ArrowRight, Dices, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { Deal } from "../types";
import { SafeImage } from "./SafeImage";

const COLORS = ["#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#10b981", "#ef4444", "#3b82f6", "#f97316"];

export function DealRoulette({ deals }: { deals: Deal[] }) {
  const choices = useMemo(() => deals.slice(0, 8), [deals]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Deal | null>(null);
  const timer = useRef<number | null>(null);
  const slice = choices.length ? 360 / choices.length : 360;
  const gradient = choices.length
    ? `conic-gradient(${choices.map((_, index) => `${COLORS[index % COLORS.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(",")})`
    : "conic-gradient(#252532 0deg 360deg)";

  function spin() {
    if (spinning || choices.length === 0) return;
    if (timer.current) window.clearTimeout(timer.current);
    const index = Math.floor(Math.random() * choices.length);
    const target = 360 - (index * slice + slice / 2);
    setWinner(null);
    setSpinning(true);
    setRotation((current) => current + 1440 + ((target - (current % 360) + 360) % 360));
    timer.current = window.setTimeout(() => {
      setWinner(choices[index] ?? null);
      setSpinning(false);
    }, 2600);
  }

  return <section className="border-y border-white/[0.07] bg-[#0d0d15] px-5 py-16 sm:px-8">
    <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[minmax(320px,480px)_1fr]">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-300"><Sparkles size={14} />Feeling lucky?</p>
        <h2 className="font-display text-4xl font-semibold text-white sm:text-5xl">Deal roulette</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">Can&apos;t decide where to go? Spin the wheel and let tonight&apos;s live offers choose for you.</p>
        <button type="button" onClick={spin} disabled={spinning || choices.length === 0} className="mt-7 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-black text-night transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"><Dices size={19} />{spinning ? "Spinning…" : choices.length ? "Spin for a deal" : "Waiting for live deals"}</button>
        {winner && <div className="mt-7 overflow-hidden rounded-2xl border border-gold/30 bg-white/[0.055] p-3 shadow-[0_0_40px_rgba(245,158,11,.12)]">
          <div className="flex gap-4">
            <SafeImage src={winner.photoUrl || winner.restaurant.photoUrl || undefined} alt={winner.title} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 py-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold">The wheel chose</p><h3 className="mt-1 truncate font-display text-2xl text-white">{winner.title}</h3><p className="truncate text-sm text-white/50">{winner.restaurant.name}</p><Link to={`/deals/${winner.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-cyan-300">See this offer <ArrowRight size={15} /></Link></div>
          </div>
        </div>}
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[440px]">
        <div className="absolute left-1/2 top-[-12px] z-20 h-0 w-0 -translate-x-1/2 border-x-[18px] border-t-[30px] border-x-transparent border-t-white drop-shadow-lg" />
        <div className="absolute inset-0 rounded-full border-[10px] border-[#20202b] shadow-[0_25px_70px_rgba(0,0,0,.45)] transition-transform duration-[2500ms] ease-[cubic-bezier(.12,.72,.12,1)]" style={{ background: gradient, transform: `rotate(${rotation}deg)` }}>
          <div className="absolute inset-[16%] rounded-full border-8 border-[#20202b] bg-[#101018] shadow-inner" />
          {choices.map((deal, index) => <span key={deal.id} className="absolute left-1/2 top-1/2 z-10 w-[31%] origin-left truncate text-[10px] font-extrabold uppercase tracking-wide text-white drop-shadow-md sm:text-xs" style={{ transform: `rotate(${index * slice + slice / 2}deg) translateX(40%)`, textAlign: "right" }}>{deal.restaurant.name}</span>)}
        </div>
        <button type="button" onClick={spin} disabled={spinning || choices.length === 0} className="absolute left-1/2 top-1/2 z-20 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-8 border-[#20202b] bg-white font-black uppercase text-night shadow-xl transition hover:scale-105 disabled:opacity-70" aria-label="Spin deal roulette">{spinning ? "…" : "Spin"}</button>
      </div>
    </div>
  </section>;
}

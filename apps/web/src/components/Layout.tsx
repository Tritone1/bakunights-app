import { Bookmark, LayoutDashboard, MapPin, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../context/AuthContext";

const nav = [
  { to: "/", label: "Nearby", icon: MapPin },
  { to: "/saved", label: "Saved", icon: Bookmark },
];

export function Layout() {
  const { user } = useAuth();
  const items = user?.role === "MERCHANT" ? [...nav, { to: "/merchant", label: "Merchant", icon: LayoutDashboard }] : nav;
  return <div className="min-h-screen bg-paper">
    <header className="sticky top-0 z-40 border-b-2 border-ink/10 bg-primary-500 shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <NavLink to="/" className="group flex items-center gap-2" aria-label="WhereToGo home">
          <span className="flex h-10 w-10 -rotate-3 items-center justify-center border-2 border-white bg-accent-500 font-display text-xl font-bold text-white shadow-ticket-sm transition group-hover:rotate-0">WG</span>
          <span className="font-display text-2xl font-bold uppercase tracking-tight text-white">WhereToGo</span>
        </NavLink>
        <nav className="hidden items-center gap-1 md:flex">
          {items.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => clsx("text-white hover:bg-primary-600 px-3 py-2 rounded-lg transition", isActive && "bg-primary-600")}>{label}</NavLink>)}
          <button className="ml-2 flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 font-display text-sm font-semibold uppercase text-white shadow-ticket-sm transition hover:-translate-y-0.5">
            <NavLink to={user ? "/profile" : "/login"} className="flex items-center gap-2"><UserRound size={18} />{user ? user.name.split(" ")[0] : "Log in"}</NavLink>
          </button>
        </nav>
        <NavLink to={user ? "/profile" : "/login"} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-accent-500 text-white md:hidden" aria-label={user ? "Profile" : "Log in"}><UserRound size={20} /></NavLink>
      </div>
    </header>
    <main className="safe-bottom mx-auto max-w-7xl"><Outlet /></main>
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink/10 bg-cream px-2 pb-[env(safe-area-inset-bottom)] shadow-lg md:hidden">
      <div className="mx-auto flex max-w-md justify-around">
        {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => clsx("flex min-w-20 flex-col items-center gap-0.5 py-2 font-mono text-[10px] font-semibold uppercase", isActive ? "text-primary-500" : "text-ink/55")}><Icon size={21} />{label}</NavLink>)}
        <NavLink to={user ? "/profile" : "/login"} className={({ isActive }) => clsx("flex min-w-20 flex-col items-center gap-0.5 py-2 font-mono text-[10px] font-semibold uppercase", isActive ? "text-primary-500" : "text-ink/55")}><UserRound size={21} />Account</NavLink>
      </div>
    </nav>
  </div>;
}

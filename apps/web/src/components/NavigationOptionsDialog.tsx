import { Bus, Car, CarTaxiFront, Footprints, MapPin, Navigation, X } from "lucide-react";
import { useEffect } from "react";

type NavigationDestination = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type NavigationOptionsDialogProps = {
  destination: NavigationDestination;
  onClose: () => void;
};

export function NavigationOptionsDialog({ destination, onClose }: NavigationOptionsDialogProps) {
  const coordinates = `${destination.lat},${destination.lng}`;
  const googleMapsUrl = (mode?: "driving" | "walking" | "transit") =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}${mode ? `&travelmode=${mode}` : ""}`;
  const wazeUrl = `https://waze.com/ul?ll=${encodeURIComponent(coordinates)}&navigate=yes&zoom=17&utm_source=wheretogo`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="navigation-options-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12121a] shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-3xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[.07] bg-[#12121a]/95 p-5 backdrop-blur-xl sm:px-7 sm:py-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Navigation</p>
          <h2 id="navigation-options-title" className="mt-1 font-display text-3xl font-semibold text-white">Choose how to get there</h2>
        </div>
        <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[.06] text-white transition hover:border-cyan-300/50 hover:text-cyan-300" aria-label="Close navigation options"><X size={21} /></button>
      </div>

      <div className="p-5 sm:p-7 sm:pt-5">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.035] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted">Destination</p>
          <p className="mt-2 flex items-center gap-2 font-semibold text-white"><MapPin size={17} className="shrink-0 text-amber-400" />{destination.name}</p>
          <p className="mt-1 pl-6 text-sm text-muted">{destination.address}</p>
        </div>

        <div className="mt-4 rounded-2xl border border-[#4285f4]/25 bg-[#4285f4]/[.07] p-4">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#4285f4] text-white"><Navigation size={21} /></span><div><p className="font-semibold text-white">Google Maps</p><p className="text-xs text-white/50">Choose your travel mode</p></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <NavigationLink href={googleMapsUrl("driving")} icon={<Car size={17} />} label="Driving" />
            <NavigationLink href={googleMapsUrl("walking")} icon={<Footprints size={17} />} label="Walking" />
            <NavigationLink href={googleMapsUrl("transit")} icon={<Bus size={17} />} label="Public transport" />
            <NavigationLink href={googleMapsUrl()} icon={<CarTaxiFront size={17} />} label="Ride service" />
          </div>
          <p className="mt-3 text-[10px] leading-4 text-white/40">In Google Maps, choose Rides and select Bolt. Google will pass the pickup and destination to Bolt.</p>
        </div>

        <div className="mt-3 rounded-2xl border border-[#33ccff]/25 bg-[#33ccff]/[.07] p-4">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#33ccff] text-[#07151a]"><Navigation size={21} /></span><div><p className="font-semibold text-white">Waze</p><p className="text-xs text-white/50">Start navigation to this destination</p></div></div>
          <a href={wazeUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#33ccff] px-4 py-3 text-sm font-extrabold text-[#07151a] transition hover:bg-[#66dcff]">Open in Waze<Navigation size={17} /></a>
        </div>
        <p className="mt-4 text-center text-[10px] leading-4 text-white/35">WhereToGo sends this venue&apos;s exact coordinates to the selected map or ride service.</p>
      </div>
    </section>
  </div>;
}

function NavigationLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#4285f4] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#5a95f5]">{icon}{label}</a>;
}

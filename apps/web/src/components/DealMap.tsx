import { useEffect, useRef, useState } from "react";
import type { Deal } from "../types";
import { loadGoogleMaps } from "../lib/googleMaps";

type MapDeal = { id: string; lat: number; lng: number; title: string; shortLabel: string };

export function DealMap({ deals, center }: { deals: Deal[]; center: { lat: number; lng: number } }) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || "DEMO_MAP_ID";
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const markerSignature = JSON.stringify(deals.map((deal) => ({
    id: deal.id,
    lat: deal.restaurant.lat,
    lng: deal.restaurant.lng,
    title: `${offerLabel(deal)} at ${deal.restaurant.name}`,
    shortLabel: offerShort(deal),
  } satisfies MapDeal)));

  useEffect(() => {
    if (!apiKey || !containerRef.current) { setStatus("failed"); return; }
    let cancelled = false;
    let authFailed = false;
    let userMarker: google.maps.marker.AdvancedMarkerElement | null = null;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const previousAuthFailure = window.gm_authFailure;
    const handleAuthFailure = () => {
      authFailed = true;
      console.error("WhereToGo Google Maps authentication failed.");
      if (!cancelled) setStatus("failed");
    };
    window.gm_authFailure = handleAuthFailure;
    setStatus("loading");
    const mapCenter = { lat: center.lat, lng: center.lng };

    void loadGoogleMaps(apiKey).then(async () => {
      if (cancelled || authFailed || !containerRef.current) return;
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelled || authFailed || !containerRef.current) return;
      const mapDeals = JSON.parse(markerSignature) as MapDeal[];
      const map = new Map(containerRef.current, {
        center: mapCenter,
        zoom: mapDeals.length === 1 ? 15 : 12,
        mapId,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });

      if (mapDeals.length > 1) {
        const userDot = document.createElement("div");
        userDot.className = "grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-primary-500 shadow-lg";
        userDot.innerHTML = '<span class="h-3 w-3 rounded-full bg-white"></span>';
        userMarker = new AdvancedMarkerElement({ map, position: mapCenter, title: "Your location", content: userDot, zIndex: 50 });
      }

      const bounds = new google.maps.LatLngBounds();
      bounds.extend(mapCenter);
      mapDeals.forEach((deal) => {
        const link = document.createElement("a");
        link.href = `/deals/${deal.id}`;
        link.className = "flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-primary-500 px-1 text-center font-display text-xs font-bold uppercase leading-tight text-white shadow-ticket-sm transition hover:bg-accent-500";
        link.textContent = deal.shortLabel;
        link.setAttribute("aria-label", deal.title);
        markers.push(new AdvancedMarkerElement({ map, position: { lat: deal.lat, lng: deal.lng }, title: deal.title, content: link }));
        bounds.extend({ lat: deal.lat, lng: deal.lng });
      });
      if (mapDeals.length > 1) map.fitBounds(bounds, 64);
      if (!authFailed) setStatus("ready");
    }).catch((error: unknown) => {
      console.error("WhereToGo deal map failed:", error);
      if (!cancelled) setStatus("failed");
    });

    return () => {
      cancelled = true;
      markers.forEach((marker) => { marker.map = null; });
      if (userMarker) userMarker.map = null;
      if (window.gm_authFailure === handleAuthFailure) window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey, center.lat, center.lng, mapId, markerSignature]);

  if (status === "failed") return deals.length === 1
    ? <OpenStreetDealMap deal={deals[0]!} />
    : <FallbackMap deals={deals} center={center} reason={apiKey ? "Google Maps failed to load. Map preview is active." : "Google Maps is not configured. Map preview is active."} />;

  return <div className="relative h-[62vh] min-h-[430px] overflow-hidden rounded-xl border-2 border-ink bg-primary-50 shadow-ticket">
    <div ref={containerRef} className="h-full w-full" aria-label="Google map of nearby offers" />
    {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-primary-50"><span className="font-mono text-xs font-bold uppercase text-ink/60">Loading Google Maps…</span></div>}
  </div>;
}

function OpenStreetDealMap({ deal }: { deal: Deal }) {
  const { lat, lng } = deal.restaurant;
  const delta = 0.008;
  const bbox = [lng - delta, lat - delta * 0.65, lng + delta, lat + delta * 0.65].join("%2C");
  const source = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  return <div className="relative h-[62vh] min-h-[430px] overflow-hidden rounded-xl border-2 border-ink bg-primary-50 shadow-ticket">
    <iframe title={`Map showing ${deal.restaurant.name}`} src={source} className="h-full w-full border-0" loading="eager" referrerPolicy="no-referrer-when-downgrade" />
    <span className="absolute right-3 top-3 rounded-full border border-ink/15 bg-cream/90 px-3 py-1 font-mono text-[9px] font-bold uppercase shadow-sm backdrop-blur">OpenStreetMap fallback</span>
  </div>;
}

function FallbackMap({ deals, center, reason }: { deals: Deal[]; center: { lat: number; lng: number }; reason: string }) {
  if (!deals.length) return null;
  const lats = deals.map((deal) => deal.restaurant.lat);
  const lngs = deals.map((deal) => deal.restaurant.lng);
  const minLat = Math.min(...lats, center.lat);
  const maxLat = Math.max(...lats, center.lat);
  const minLng = Math.min(...lngs, center.lng);
  const maxLng = Math.max(...lngs, center.lng);
  const userLeft = minLng === maxLng ? 50 : 8 + ((center.lng - minLng) / (maxLng - minLng)) * 84;
  const userTop = minLat === maxLat ? 50 : 12 + (1 - (center.lat - minLat) / (maxLat - minLat)) * 76;

  return <div className="map-grid relative h-[62vh] min-h-[430px] overflow-hidden rounded-xl border-2 border-ink shadow-ticket" aria-label="Map preview">
    <div className="absolute left-3 top-3 z-10 max-w-72 border-2 border-ink bg-cream p-2 font-mono text-[10px] font-semibold uppercase">{reason}</div>
    <div style={{ left: `${userLeft}%`, top: `${userTop}%` }} className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary-500 shadow-md" aria-label="Your location"><div className="h-3 w-3 rounded-full bg-white" /></div>
    {deals.map((deal) => {
      const left = minLng === maxLng ? 50 : 8 + ((deal.restaurant.lng - minLng) / (maxLng - minLng)) * 84;
      const top = minLat === maxLat ? 50 : 12 + (1 - (deal.restaurant.lat - minLat) / (maxLat - minLat)) * 76;
      return <a key={deal.id} href={`/deals/${deal.id}`} style={{ left: `${left}%`, top: `${top}%` }} className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-primary-500 px-1 text-center font-display text-xs font-bold uppercase leading-tight text-white shadow-ticket-sm transition hover:z-20 hover:scale-110 hover:bg-accent-500" aria-label={`${offerLabel(deal)} at ${deal.restaurant.name}`}>{offerShort(deal)}</a>;
    })}
  </div>;
}

function offerLabel(deal: Deal) {
  if ((deal.offerType ?? "discount") === "discount" && deal.discountPct != null) return `${deal.discountPct}% off`;
  return (deal.offerType ?? "offer").replaceAll("_", " ");
}

function offerShort(deal: Deal) {
  if ((deal.offerType ?? "discount") === "discount" && deal.discountPct != null) return `${deal.discountPct}%`;
  return (deal.offerType ?? "offer").replaceAll("_", " ");
}

import { AdvancedMarker, APIProvider, Map as GoogleMap } from "@vis.gl/react-google-maps";
import { Link } from "react-router-dom";
import type { Deal } from "../types";
import { useState } from "react";

export function DealMap({ deals, center }: { deals: Deal[]; center: { lat: number; lng: number } }) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [googleFailed, setGoogleFailed] = useState(false);
  if (!key || googleFailed) return <FallbackMap deals={deals} center={center} reason={key ? "Google Maps failed to load. OpenStreetMap-style preview is active." : "Google Maps is not configured. Map preview is active."} />;
  return <div className="relative h-[62vh] min-h-[430px] overflow-hidden rounded-xl border-2 border-ink shadow-ticket">
    <APIProvider apiKey={key} onError={(error) => { console.error("BakuNights deal map Google Maps failed:", error); setGoogleFailed(true); }}>
      <GoogleMap defaultCenter={center} defaultZoom={13} mapId="DEMO_MAP_ID" gestureHandling="greedy" disableDefaultUI={false}>
        <AdvancedMarker position={center} title="Your location">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary-500 shadow-lg">
            <div className="h-3 w-3 rounded-full bg-white"></div>
          </div>
        </AdvancedMarker>
        {deals.map((deal) => <AdvancedMarker key={deal.id} position={{ lat: deal.restaurant.lat, lng: deal.restaurant.lng }} title={`${offerLabel(deal)} at ${deal.restaurant.name}`}>
          <Link to={`/deals/${deal.id}`} className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-primary-500 px-1 text-center font-display text-xs font-bold uppercase leading-tight text-white shadow-ticket-sm hover:bg-accent-500 hover:text-white">{offerShort(deal)}</Link>
        </AdvancedMarker>)}
      </GoogleMap>
    </APIProvider>
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
    <div style={{ left: `${userLeft}%`, top: `${userTop}%` }} className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary-500 shadow-md z-10" aria-label="Your location">
      <div className="h-3 w-3 rounded-full bg-white"></div>
    </div>
    {deals.map((deal) => {
      const left = minLng === maxLng ? 50 : 8 + ((deal.restaurant.lng - minLng) / (maxLng - minLng)) * 84;
      const top = minLat === maxLat ? 50 : 12 + (1 - (deal.restaurant.lat - minLat) / (maxLat - minLat)) * 76;
      return <Link key={deal.id} to={`/deals/${deal.id}`} style={{ left: `${left}%`, top: `${top}%` }} className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-primary-500 px-1 text-center font-display text-xs font-bold uppercase leading-tight text-white shadow-ticket-sm transition hover:z-20 hover:scale-110 hover:bg-accent-500" aria-label={`${offerLabel(deal)} at ${deal.restaurant.name}`}>{offerShort(deal)}</Link>;
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

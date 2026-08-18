import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { asyncRoute, HttpError } from "../lib/http.js";

export const placesRouter = Router();

function assertConfigured() {
  if (!env.GOOGLE_MAPS_SERVER_API_KEY) throw new HttpError(503, "Location search is not configured. Enter coordinates instead.");
}

placesRouter.get("/autocomplete", asyncRoute(async (req, res) => {
  assertConfigured();
  const query = z.object({ input: z.string().trim().min(3).max(120) }).parse(req.query);
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_API_KEY!,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
    },
    body: JSON.stringify({ input: query.input }),
  });
  if (!response.ok) throw new HttpError(502, "Location search is temporarily unavailable.");
  const data = await response.json() as any;
  res.json({ suggestions: (data.suggestions ?? []).flatMap((item: any) => item.placePrediction ? [{
    id: item.placePrediction.placeId, label: item.placePrediction.text.text,
  }] : []) });
}));

placesRouter.get("/:placeId", asyncRoute(async (req, res) => {
  assertConfigured();
  const placeId = encodeURIComponent(z.string().min(1).parse(req.params.placeId));
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_API_KEY!,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
  });
  if (!response.ok) throw new HttpError(502, "Could not load that location.");
  const data = await response.json() as any;
  res.json({ place: {
    id: data.id,
    name: data.displayName?.text,
    address: data.formattedAddress,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  } });
}));

import "server-only";

import type { Circle } from "@/lib/geo";

// Campos pedidos à Places API (New). Site e telefone puxam o SKU Enterprise.
const PLACE_FIELDS = [
  "id",
  "displayName",
  "primaryType",
  "formattedAddress",
  "shortFormattedAddress",
  "addressComponents",
  "location",
  "businessStatus",
  "rating",
  "userRatingCount",
  "websiteUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "googleMapsUri",
];

export type GooglePlace = {
  id: string;
  displayName?: { text: string };
  primaryType?: string;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
};

export class PlacesApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    let detail = "";
    try {
      detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "";
    } catch {}
    super(detail ? `Google Places (${status}): ${detail}` : message);
  }
  get isInvalidType() {
    return this.status === 400 && /type/i.test(this.body);
  }
}

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY não configurada");
  return k;
}

export async function searchNearby(circle: Circle, includedPrimaryTypes: string[]): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": PLACE_FIELDS.map((f) => `places.${f}`).join(","),
    },
    body: JSON.stringify({
      includedPrimaryTypes,
      maxResultCount: 20,
      languageCode: "pt-BR",
      regionCode: "BR",
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: { center: { latitude: circle.lat, longitude: circle.lng }, radius: Math.min(circle.radius, 50_000) },
      },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new PlacesApiError(`Places searchNearby ${res.status}`, res.status, text);
  const json = JSON.parse(text) as { places?: GooglePlace[] };
  return json.places ?? [];
}

export async function placeDetails(placeId: string): Promise<GooglePlace> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": PLACE_FIELDS.join(",") },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new PlacesApiError(`Places details ${res.status}`, res.status, text);
  return JSON.parse(text) as GooglePlace;
}

export function pickComponent(p: GooglePlace, ...types: string[]): string | null {
  for (const t of types) {
    const c = p.addressComponents?.find((a) => a.types.includes(t));
    if (c) return c.longText;
  }
  return null;
}

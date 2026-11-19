import { BANDS } from "@/lib/config/score";
import type { RadarPlace } from "@/lib/types";

export const PLACE_RING_COLOR = {
  quente: "#0b5a3e",
  morno: "#d9a441",
  frio: "#94a3b8",
  analisando: "#94a3b8",
} as const;

export type PlaceRingBand = keyof typeof PLACE_RING_COLOR;

export function placeRingBand(score: number | null): PlaceRingBand {
  if (score == null) return "analisando";
  if (score >= BANDS.quente) return "quente";
  if (score >= BANDS.morno) return "morno";
  return "frio";
}

export type PlacesGeoJson = GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; ringColor: string }>;

/** Converte resultados do Radar em FeatureCollection GeoJSON para renderização com clustering WebGL. */
export function buildPlacesGeoJson(places: readonly RadarPlace[]): PlacesGeoJson {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, ringColor: PLACE_RING_COLOR[placeRingBand(p.score)] },
    })),
  };
}

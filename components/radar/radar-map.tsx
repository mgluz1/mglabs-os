"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Radar } from "lucide-react";
import { useEffect, useMemo } from "react";
import Map, { AttributionControl, Layer, Marker, NavigationControl, Source, useMap } from "react-map-gl/maplibre";

import { BAND_COLOR, bandOf } from "@/components/lead/badges";
import { offset, type LatLng } from "@/lib/geo";
import { useTheme } from "@/lib/use-theme";
import type { RadarPlace } from "@/lib/types";

type Props = {
  center: LatLng;
  /** Muda só quando o mapa deve se mover (troca de cidade, busca aberta). */
  panTarget: LatLng;
  radiusM: number;
  places: RadarPlace[];
  selectedId: string | null;
  onPickCenter: (c: LatLng) => void;
  onSelect: (id: string) => void;
};

// OpenFreeMap: tiles do OpenStreetMap, sem chave e sem limite de uso. Troque com NEXT_PUBLIC_MAP_STYLE.
const STYLE_DARK = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/dark";
const STYLE_LIGHT = process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || "https://tiles.openfreemap.org/styles/positron";
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · Lugares: <a href="https://overturemaps.org" target="_blank">Overture Maps</a>';

function circlePolygon(c: LatLng, radiusM: number, steps = 96): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const p = offset(c, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    coords.push([p.lng, p.lat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

export function RadarMap({ center, panTarget, radiusM, places, selectedId, onPickCenter, onSelect }: Props) {
  const theme = useTheme();
  const circle = useMemo(() => circlePolygon(center, radiusM), [center, radiusM]);
  return (
    <Map
      initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 12.5 }}
      mapStyle={theme === "light" ? STYLE_LIGHT : STYLE_DARK}
      attributionControl={false}
      onClick={(e) => onPickCenter({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      style={{ width: "100%", height: "100%" }}
      cursor="crosshair"
    >
      <FlyTo center={panTarget} radiusM={radiusM} />
      <NavigationControl position="bottom-right" showCompass={false} />
      <AttributionControl position="bottom-right" compact customAttribution={ATTRIBUTION} />

      <Source id="raio" type="geojson" data={circle}>
        <Layer id="raio-fill" type="fill" paint={{ "fill-color": "#2bc777", "fill-opacity": 0.07 }} />
        <Layer id="raio-line" type="line" paint={{ "line-color": "#2bc777", "line-width": 1.5, "line-opacity": 0.9 }} />
      </Source>

      <Marker latitude={center.lat} longitude={center.lng} anchor="center" style={{ zIndex: 5 }}>
        <div className="radar-center pointer-events-none">
          <span className="radar-ping" />
          <span className="radar-ping radar-ping-delay" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-background text-brand shadow-[0_0_0_2px_#2bc777,0_8px_24px_rgba(43,199,119,.35)]">
            <Radar className="h-[18px] w-[18px]" />
          </span>
        </div>
      </Marker>

      {places.map((p) => {
        const color = BAND_COLOR[bandOf(p.score)];
        const sel = p.id === selectedId;
        return (
          <Marker
            key={p.id}
            latitude={p.lat}
            longitude={p.lng}
            anchor="center"
            style={{ zIndex: sel ? 4 : 2 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(p.id);
            }}
          >
            <button
              title={`${p.name}${p.score != null ? ` · nota ${p.score}` : ""}`}
              className={`flex items-center justify-center rounded-full font-bold tabular-nums text-brand-on transition-transform hover:scale-110 ${sel ? "h-9 w-9 scale-110 text-xs" : "h-7 w-7 text-[10px]"}`}
              style={{ background: color, boxShadow: sel ? `0 0 0 3px #fff, 0 6px 18px ${color}88` : `0 0 0 2px #0b0d12, 0 4px 12px rgba(0,0,0,.5)` }}
            >
              {p.score ?? "…"}
            </button>
          </Marker>
        );
      })}
    </Map>
  );
}

/** Move o mapa quando o centro muda (troca de cidade, busca aberta) e ajusta o zoom ao raio. */
function FlyTo({ center, radiusM }: { center: LatLng; radiusM: number }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map) return;
    const zoom = Math.max(10, Math.min(15, 15.6 - Math.log2(radiusM / 400)));
    map.flyTo({ center: [center.lng, center.lat], zoom, duration: 900 });
    // o zoom segue o raio só quando o centro muda, para não brigar com o zoom manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center]);
  return null;
}

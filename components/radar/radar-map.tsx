"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Radar } from "lucide-react";
import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import Map, { AttributionControl, Layer, Marker, NavigationControl, Source, useMap } from "react-map-gl/maplibre";

import { bandOf } from "@/components/lead/badges";
import { CATEGORY_ICON } from "@/components/radar/ui";
import { offset, type LatLng } from "@/lib/geo";
import type { RadarPlace } from "@/lib/types";
import { useTheme } from "@/lib/use-theme";

type Props = {
  center: LatLng;
  /** Muda só quando o mapa deve se mover (troca de cidade, busca aberta). */
  panTarget: LatLng;
  radiusM: number;
  places: RadarPlace[];
  selectedId: string | null;
  category?: string;
  /** Desloca o centro visual para a direita quando o painel cobre a esquerda do mapa (px). */
  leftInset?: number;
  /** Celular: atribuição recolhida e sem botões de zoom (gesto de pinça). */
  compact?: boolean;
  onPickCenter: (c: LatLng) => void;
  onSelect: (id: string) => void;
};

/**
 * Mapa padrão do OpenStreetMap (o mesmo de openstreetmap.org), em tiles raster.
 * Uso leve e com atribuição, conforme a política de tiles da OSMF. Para trocar de servidor de tiles
 * (ex.: um provedor pago se o volume crescer), defina NEXT_PUBLIC_MAP_TILES; para um estilo vetorial
 * MapLibre completo, NEXT_PUBLIC_MAP_STYLE.
 */
const TILES = process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const VECTOR_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE;
const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Colaboradores do OpenStreetMap</a> · Lugares: <a href="https://overturemaps.org" target="_blank" rel="noreferrer">Overture Maps</a>';

// Worker servido de /public/maplibre (scripts/copy-maplibre-worker.mjs roda no predev/prebuild).
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function osmStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    sources: { osm: { type: "raster", tiles: [TILES], tileSize: 256, maxzoom: 19 } },
    layers: [
      { id: "fundo", type: "background", paint: { "background-color": dark ? "#0e1620" : "#f2efe9" } },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        // no tema escuro o mapa claro é atenuado, sem inverter as cores (ruas continuam legíveis)
        paint: dark ? { "raster-brightness-max": 0.5, "raster-saturation": -0.55, "raster-contrast": 0.1 } : { "raster-saturation": -0.08 },
      },
    ],
  };
}

const RING = { quente: "#0b5a3e", morno: "#d9a441", frio: "#94a3b8", analisando: "#94a3b8" } as const;

function circlePolygon(c: LatLng, radiusM: number, steps = 128): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const p = offset(c, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    coords.push([p.lng, p.lat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

export function RadarMap({ center, panTarget, radiusM, places, selectedId, category, leftInset = 0, compact = false, onPickCenter, onSelect }: Props) {
  const theme = useTheme();
  const dark = theme === "dark";
  const style = useMemo(() => VECTOR_STYLE ?? osmStyle(dark), [dark]);
  const circle = useMemo(() => circlePolygon(center, radiusM), [center, radiusM]);
  const CenterIcon = (category && CATEGORY_ICON[category]) || Radar;
  const line = dark ? "#38d385" : "#0b5a3e";

  return (
    <Map
      initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 12.5 }}
      mapStyle={style}
      attributionControl={false}
      onClick={(e) => onPickCenter({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      style={{ width: "100%", height: "100%" }}
      cursor="crosshair"
    >
      <FlyTo center={panTarget} radiusM={radiusM} leftInset={leftInset} />
      {!compact && <NavigationControl position="bottom-right" showCompass={false} />}
      <AttributionControl position={compact ? "top-right" : "bottom-right"} compact={compact} customAttribution={ATTRIBUTION} />

      <Source id="raio" type="geojson" data={circle}>
        <Layer id="raio-fill" type="fill" paint={{ "fill-color": line, "fill-opacity": dark ? 0.1 : 0.07 }} />
        <Layer id="raio-line" type="line" paint={{ "line-color": line, "line-width": 2.5, "line-opacity": 0.95 }} />
      </Source>

      <Marker latitude={center.lat} longitude={center.lng} anchor="center" style={{ zIndex: 5 }}>
        <span className="pointer-events-none flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0b5a3e] shadow-[0_6px_20px_rgba(15,31,23,.28)] ring-4 ring-white/60">
          <CenterIcon className="h-5 w-5" aria-hidden />
        </span>
      </Marker>

      {places.map((p) => {
        const band = bandOf(p.score);
        const sel = p.id === selectedId;
        return (
          <Marker
            key={p.id}
            latitude={p.lat}
            longitude={p.lng}
            anchor="center"
            style={{ zIndex: sel ? 6 : band === "quente" ? 3 : 2 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(p.id);
            }}
          >
            <span className="relative flex items-center">
              <button
                type="button"
                title={`${p.name}${p.score != null ? ` · nota ${p.score}` : " · analisando"}`}
                aria-label={`${p.name}${p.score != null ? `, nota ${p.score}` : ""}`}
                className={`flex items-center justify-center rounded-full font-semibold tabular-nums shadow-[0_2px_8px_rgba(15,31,23,.25)] transition-transform hover:scale-110 ${sel ? "h-10 w-10 scale-110 text-[13px] text-white" : "h-[34px] w-[34px] bg-white text-[12px] text-[#0f1f17]"}`}
                style={{
                  background: sel ? RING[band] : "#fff",
                  border: `3px ${band === "analisando" ? "dashed" : "solid"} ${sel ? "#fff" : RING[band]}`,
                }}
              >
                {p.score ?? "…"}
              </button>
              {sel && (
                <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-full bg-[#14231b]/90 px-3 py-1 text-xs font-medium text-white shadow-lg">{p.name}</span>
              )}
            </span>
          </Marker>
        );
      })}
    </Map>
  );
}

/** Move o mapa quando o centro muda (troca de cidade, busca aberta) e enquadra o raio inteiro. */
function FlyTo({ center, radiusM, leftInset }: { center: LatLng; radiusM: number; leftInset: number }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map) return;
    const ne = offset(center, radiusM * 1.08, radiusM * 1.08);
    const sw = offset(center, -radiusM * 1.08, -radiusM * 1.08);
    map.fitBounds(
      [
        [sw.lng, sw.lat],
        [ne.lng, ne.lat],
      ],
      { padding: { top: 70, bottom: 40, left: leftInset + 40, right: 40 }, duration: 900, maxZoom: 16 },
    );
    // o enquadramento segue o raio só quando o centro muda, para não brigar com o zoom manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center]);
  return null;
}

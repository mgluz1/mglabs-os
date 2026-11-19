"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Radar } from "lucide-react";
import { setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { useMemo, useRef } from "react";
import { useEffect } from "react";
import Map, { AttributionControl, Layer, Marker, NavigationControl, Source, useMap, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";

import { bandOf } from "@/components/lead/badges";
import { CATEGORY_ICON } from "@/components/radar/ui";
import { offset, type LatLng } from "@/lib/geo";
import { buildPlacesGeoJson, PLACE_RING_COLOR } from "@/lib/radar-geojson";
import type { RadarPlace } from "@/lib/types";
import { useTheme } from "@/lib/use-theme";

type Props = {
  center: LatLng;
  /** Muda só quando o mapa deve se mover (troca de cidade, busca aberta). */
  panTarget: LatLng;
  /** Foco opcional quando um lead é escolhido na lista. */
  focusTarget?: LatLng | null;
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

function circlePolygon(c: LatLng, radiusM: number, steps = 128): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const p = offset(c, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    coords.push([p.lng, p.lat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

export function RadarMap({ center, panTarget, focusTarget, radiusM, places, selectedId, category, leftInset = 0, compact = false, onPickCenter, onSelect }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const theme = useTheme();
  const dark = theme === "dark";
  const style = useMemo(() => VECTOR_STYLE ?? osmStyle(dark), [dark]);
  const circle = useMemo(() => circlePolygon(center, radiusM), [center, radiusM]);
  const CenterIcon = (category && CATEGORY_ICON[category]) || Radar;
  const line = dark ? "#38d385" : "#0b5a3e";

  const placesGeoJson = useMemo(() => buildPlacesGeoJson(places), [places]);

  const selectedPlace = useMemo(() => (selectedId ? places.find((p) => p.id === selectedId) ?? null : null), [places, selectedId]);

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const feat = e.features?.[0];
    if (!feat) {
      onPickCenter({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      return;
    }
    if (feat.layer.id === "places-cluster") {
      const clusterId = feat.properties?.cluster_id;
      const map = mapRef.current?.getMap();
      const source = map?.getSource("places") as GeoJSONSource | undefined;
      if (map && source && typeof clusterId === "number" && feat.geometry.type === "Point") {
        const [lng, lat] = feat.geometry.coordinates;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: [lng, lat], zoom, duration: 400 });
        });
      }
      return;
    }
    const id = feat.properties?.id;
    if (typeof id === "string") onSelect(id);
  };

  return (
    <Map
      ref={mapRef}
      initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 12.5 }}
      mapStyle={style}
      attributionControl={false}
      interactiveLayerIds={places.length > 0 ? ["places-cluster", "places-point"] : undefined}
      onClick={handleMapClick}
      style={{ width: "100%", height: "100%" }}
      cursor="crosshair"
    >
      <FlyTo center={panTarget} radiusM={radiusM} leftInset={leftInset} />
      <FocusPoint target={focusTarget ?? null} leftInset={leftInset} />
      {!compact && <NavigationControl position="bottom-right" showCompass={false} />}
      <AttributionControl position={compact ? "top-right" : "bottom-right"} compact={compact} customAttribution={ATTRIBUTION} />

      <Source id="raio" type="geojson" data={circle}>
        <Layer id="raio-fill" type="fill" paint={{ "fill-color": line, "fill-opacity": dark ? 0.1 : 0.07 }} />
        <Layer id="raio-line" type="line" paint={{ "line-color": line, "line-width": 2.5, "line-opacity": 0.95 }} />
      </Source>

      <Source id="places" type="geojson" data={placesGeoJson} cluster clusterMaxZoom={14} clusterRadius={44}>
        <Layer
          id="places-cluster"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": line,
            "circle-radius": ["step", ["get", "point_count"], 15, 25, 20, 100, 24],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.92,
          }}
        />
        <Layer
          id="places-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "#ffffff",
            "circle-radius": 9,
            "circle-stroke-width": 3.5,
            "circle-stroke-color": ["get", "ringColor"],
          }}
        />
      </Source>

      <Marker latitude={center.lat} longitude={center.lng} anchor="center" style={{ zIndex: 5 }}>
        <span className="pointer-events-none flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0b5a3e] shadow-[0_6px_20px_rgba(15,31,23,.28)] ring-4 ring-white/60">
          <CenterIcon className="h-5 w-5" aria-hidden />
        </span>
      </Marker>

      {selectedPlace && (
        <Marker
          key={selectedPlace.id}
          latitude={selectedPlace.lat}
          longitude={selectedPlace.lng}
          anchor="center"
          style={{ zIndex: 6 }}
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelect(selectedPlace.id);
          }}
        >
          <span className="relative flex items-center">
            <button
              type="button"
              title={`${selectedPlace.name}${selectedPlace.score != null ? ` · nota ${selectedPlace.score}` : " · analisando"}`}
              aria-label={`${selectedPlace.name}${selectedPlace.score != null ? `, nota ${selectedPlace.score}` : ""}`}
              className="flex h-10 w-10 scale-110 items-center justify-center rounded-full text-[13px] font-semibold text-white tabular-nums shadow-[0_2px_8px_rgba(15,31,23,.25)]"
              style={{
                background: PLACE_RING_COLOR[bandOf(selectedPlace.score)],
                border: `3px ${bandOf(selectedPlace.score) === "analisando" ? "dashed" : "solid"} #fff`,
              }}
            >
              {selectedPlace.score ?? "…"}
            </button>
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-full bg-[#14231b]/90 px-3 py-1 text-xs font-medium text-white shadow-lg">
              {selectedPlace.name}
            </span>
          </span>
        </Marker>
      )}
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

/** Centraliza suavemente quando o usuário seleciona uma empresa pela lista. */
function FocusPoint({ target, leftInset }: { target: LatLng | null; leftInset: number }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.easeTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 14.5),
      padding: leftInset > 0 ? { top: 40, bottom: 40, left: leftInset + 20, right: leftInset + 20 } : { top: 24, bottom: 24, left: 24, right: 24 },
      duration: 500,
    });
  }, [map, target, leftInset]);
  return null;
}

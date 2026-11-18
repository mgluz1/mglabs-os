"use client";

import { AdvancedMarker, APIProvider, Circle, Map, useMap } from "@vis.gl/react-google-maps";
import { Radar } from "lucide-react";
import { useEffect } from "react";

import { BAND_COLOR, bandOf } from "@/components/lead/badges";
import type { LatLng } from "@/lib/geo";
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

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

export function RadarMap({ center, panTarget, radiusM, places, selectedId, onPickCenter, onSelect }: Props) {
  if (!KEY) return <MapPlaceholder />;
  return (
    <APIProvider apiKey={KEY} language="pt-BR" region="BR">
      <Map
        mapId={MAP_ID}
        defaultCenter={center}
        defaultZoom={13}
        colorScheme="DARK"
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onClick={(e) => e.detail.latLng && onPickCenter(e.detail.latLng)}
        className="h-full w-full"
      >
        <PanTo center={panTarget} />
        <Circle center={center} radius={radiusM} strokeColor="#38bdf8" strokeOpacity={0.9} strokeWeight={1.5} fillColor="#38bdf8" fillOpacity={0.07} clickable={false} />

        <AdvancedMarker position={center} zIndex={2000} clickable={false}>
          <div className="radar-center">
            <span className="radar-ping" />
            <span className="radar-ping radar-ping-delay" />
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#0b0d12] text-sky-400 shadow-[0_0_0_2px_#38bdf8,0_8px_24px_rgba(56,189,248,.35)]">
              <Radar className="h-[18px] w-[18px]" />
            </span>
          </div>
        </AdvancedMarker>

        {places.map((p) => {
          const band = bandOf(p.score);
          const sel = p.id === selectedId;
          const color = BAND_COLOR[band];
          return (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.name}${p.score != null ? ` · nota ${p.score}` : ""}`}
              onClick={() => onSelect(p.id)}
              zIndex={sel ? 1500 : 100 + (p.score ?? 0)}
            >
              <div
                className={`flex items-center justify-center rounded-full font-bold tabular-nums text-[#0b0d12] transition-transform ${sel ? "h-9 w-9 scale-110 text-xs" : "h-7 w-7 text-[10px]"}`}
                style={{ background: color, boxShadow: sel ? `0 0 0 3px #fff, 0 6px 18px ${color}88` : `0 0 0 2px #0b0d12, 0 4px 12px rgba(0,0,0,.5)` }}
              >
                {p.score ?? "…"}
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}

/** Move o mapa quando o centro da busca muda (troca de cidade). */
function PanTo({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map?.panTo(center);
  }, [map, center]);
  return null;
}

function MapPlaceholder() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0b0f17]">
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#1b2433_1px,transparent_1px),linear-gradient(90deg,#1b2433_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute h-[520px] w-[520px] rounded-full border border-sky-400/30 bg-sky-400/[0.04]" />
      <div className="absolute h-[320px] w-[320px] rounded-full border border-sky-400/15" />
      <div className="radar-sweep absolute h-[520px] w-[520px] rounded-full" />
      <p className="absolute bottom-6 max-w-sm text-center text-xs text-white/40">
        Mapa desligado: defina <code className="text-white/60">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>. A busca e a lista funcionam sem ele.
      </p>
    </div>
  );
}

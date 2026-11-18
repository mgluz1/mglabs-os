"use client";

import { AdvancedMarker, APIProvider, Circle, Map, Pin, useMap } from "@vis.gl/react-google-maps";
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
  if (!KEY) {
    return (
      <div className="flex h-full items-center justify-center bg-[#11151d] p-8 text-center text-sm text-white/50">
        Defina NEXT_PUBLIC_GOOGLE_MAPS_KEY para ver o mapa. A busca e a lista funcionam sem ele.
      </div>
    );
  }
  return (
    <APIProvider apiKey={KEY} language="pt-BR" region="BR">
      <Map
        mapId={MAP_ID}
        defaultCenter={center}
        defaultZoom={13}
        colorScheme="DARK"
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        onClick={(e) => e.detail.latLng && onPickCenter(e.detail.latLng)}
        className="h-full w-full"
      >
        <PanTo center={panTarget} />
        <Circle
          center={center}
          radius={radiusM}
          strokeColor="#38bdf8"
          strokeWeight={1.5}
          fillColor="#38bdf8"
          fillOpacity={0.06}
          clickable={false}
        />
        {places.map((p) => {
          const band = bandOf(p.score);
          const sel = p.id === selectedId;
          return (
            <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={`${p.name}${p.score != null ? ` · ${p.score}` : ""}`} onClick={() => onSelect(p.id)} zIndex={sel ? 1000 : p.score ?? 0}>
              <Pin
                background={BAND_COLOR[band]}
                borderColor={sel ? "#ffffff" : "#0b0d12"}
                glyphColor="#0b0d12"
                scale={sel ? 1.3 : 0.9}
              />
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

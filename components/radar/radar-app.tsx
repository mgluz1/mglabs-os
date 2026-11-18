"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { addToCrmAction, searchAction } from "@/app/actions";
import { badgesFor, BAND_COLOR, bandOf, TONE_CLASS } from "@/components/lead/badges";
import { LeadPanel } from "@/components/lead/lead-panel";
import { RadarMap } from "@/components/radar/radar-map";
import { CATEGORIES, CITIES, getCategory } from "@/lib/config/categories";
import type { LatLng } from "@/lib/geo";
import type { RadarPlace } from "@/lib/types";

type Recent = { id: string; category: string; radius_m: number; label: string | null; results: number; created_at: string };
type Quota = { cells: number; used: number; cap: number; remaining: number };
type Filter = "todos" | "quente" | "morno" | "sem_site" | "abordaveis";

export function RadarApp({ recent, initialSearchId }: { recent: Recent[]; initialSearchId: string | null }) {
  const [category, setCategory] = useState<string>("barbearia");
  const [cityId, setCityId] = useState<string>("goiania");
  const [center, setCenter] = useState<LatLng>({ lat: CITIES[0].lat, lng: CITIES[0].lng });
  const [panTarget, setPanTarget] = useState<LatLng>(center);
  const [radiusKm, setRadiusKm] = useState(3);
  const [searchId, setSearchId] = useState<string | null>(initialSearchId);
  const [places, setPlaces] = useState<RadarPlace[]>([]);
  const [pendingAudits, setPendingAudits] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [searching, startSearch] = useTransition();
  const processing = useRef(false);

  // estimativa de cota para o raio atual
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/quota?radius=${radiusKm * 1000}`);
      if (r.ok) setQuota(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [radiusKm, searchId]);

  const loadResults = useCallback(async (id: string) => {
    const r = await fetch(`/api/radar/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { places: RadarPlace[]; pending: number; search: { lat: number; lng: number; radius_m: number; category: string } | null };
    setPlaces(j.places);
    setPendingAudits(j.pending);
    return j;
  }, []);

  // abre uma busca antiga
  useEffect(() => {
    if (!initialSearchId) return;
    let alive = true;
    fetch(`/api/radar/${initialSearchId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { places: RadarPlace[]; pending: number; search: { lat: number; lng: number; radius_m: number; category: string } | null } | null) => {
        if (!alive || !j) return;
        setPlaces(j.places);
        setPendingAudits(j.pending);
        if (j.search) {
          const c = { lat: Number(j.search.lat), lng: Number(j.search.lng) };
          setCenter(c);
          setPanTarget(c);
          setRadiusKm(Math.round(j.search.radius_m / 100) / 10);
          setCategory(j.search.category);
        }
      });
    return () => {
      alive = false;
    };
  }, [initialSearchId]);

  // polling: enquanto houver análise pendente, roda um lote e recarrega
  useEffect(() => {
    if (!searchId || pendingAudits === 0) return;
    const t = setInterval(async () => {
      if (!processing.current) {
        processing.current = true;
        fetch("/api/audits/process", { method: "POST" }).finally(() => (processing.current = false));
      }
      await loadResults(searchId);
    }, 3000);
    return () => clearInterval(t);
  }, [searchId, pendingAudits, loadResults]);

  const runSearch = () =>
    startSearch(async () => {
      setMessage(null);
      setSelectedId(null);
      const city = CITIES.find((c) => c.id === cityId);
      const out = await searchAction({
        category,
        lat: center.lat,
        lng: center.lng,
        radiusM: radiusKm * 1000,
        label: `${getCategory(category)?.label} · ${city?.label ?? "ponto no mapa"} · ${radiusKm} km`,
      });
      if (!out.ok) {
        setMessage(out.error);
        return;
      }
      const d = out.discarded;
      setMessage(
        `${out.kept} negócios no radar (${out.calls} chamadas ao Google${out.partial ? ", busca parcial: limite do mês atingido" : ""}). ` +
          `Descartados: ${d.franquia} franquias, ${d.fechado} fechados, ${d.duplicado} duplicados, ${d.foraDoRaio} fora do raio.`,
      );
      setSearchId(out.searchId);
      window.history.replaceState(null, "", `/radar?busca=${out.searchId}`);
      const j = await loadResults(out.searchId);
      if (j && j.pending > 0) setPendingAudits(j.pending);
    });

  const visible = useMemo(() => {
    return places.filter((p) => {
      if (filter === "quente") return (p.score ?? 0) >= 75;
      if (filter === "morno") return (p.score ?? 0) >= 50 && (p.score ?? 0) < 75;
      if (filter === "sem_site") return p.siteType === "sem_site" || p.siteType === "so_rede_social";
      if (filter === "abordaveis") return p.approachable !== false && (p.score ?? 0) >= 50;
      return true;
    });
  }, [places, filter]);

  const hot = places.filter((p) => (p.score ?? 0) >= 75 && p.approachable !== false && !p.leadId);

  return (
    <div className="flex h-full">
      {/* painel de busca + lista */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-white/10 bg-[#0f1219]">
        <div className="space-y-3 border-b border-white/10 p-4">
          <h1 className="text-xl font-semibold">Encontre clientes</h1>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-3 py-1 text-sm ring-1 ${category === c.id ? "bg-sky-500 text-[#0b0d12] ring-sky-500" : "ring-white/15 hover:bg-white/5"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              value={cityId}
              onChange={(e) => {
                setCityId(e.target.value);
                const c = CITIES.find((x) => x.id === e.target.value);
                if (c) {
                  setCenter({ lat: c.lat, lng: c.lng });
                  setPanTarget({ lat: c.lat, lng: c.lng });
                }
              }}
              className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value="mapa">Ponto escolhido no mapa</option>
            </select>
          </div>
          <p className="text-xs text-white/40">Clique no mapa para mudar o centro da busca.</p>
          <label className="block text-sm">
            <span className="flex justify-between">
              <span>Raio</span>
              <span className="tabular-nums">{radiusKm} km</span>
            </span>
            <input type="range" min={1} max={15} step={0.5} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-sky-500" />
          </label>
          {quota && (
            <p className="text-xs text-white/50">
              Esta busca usa ~{quota.cells}+ chamadas · uso do mês {quota.used}/{quota.cap}
            </p>
          )}
          <button
            onClick={runSearch}
            disabled={searching}
            className="w-full rounded-md bg-sky-500 py-2 font-medium text-[#0b0d12] hover:bg-sky-400 disabled:opacity-50"
          >
            {searching ? "Buscando…" : `Buscar ${getCategory(category)?.label.toLowerCase()}`}
          </button>
          {message && <p className="text-xs text-white/70">{message}</p>}
        </div>

        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2 text-xs">
          {(
            [
              ["todos", `Todos ${places.length}`],
              ["quente", "Quentes"],
              ["morno", "Mornos"],
              ["sem_site", "Sem site"],
              ["abordaveis", "Abordáveis"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={`rounded px-2 py-1 ${filter === v ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        {pendingAudits > 0 && <div className="bg-sky-500/10 px-4 py-1.5 text-xs text-sky-300">Analisando sites… {pendingAudits} restantes</div>}
        {hot.length > 0 && (
          <button
            onClick={async () => {
              const r = await addToCrmAction(hot.map((p) => p.id));
              setMessage(r.ok ? `${r.data} leads quentes adicionados ao CRM.` : r.error);
              if (searchId) await loadResults(searchId);
            }}
            className="mx-4 mt-2 rounded-md border border-green-500/40 py-1.5 text-xs text-green-300 hover:bg-green-500/10"
          >
            Adicionar os {hot.length} quentes ao CRM
          </button>
        )}

        <ul className="flex-1 overflow-y-auto p-2">
          {visible.map((p) => {
            const band = bandOf(p.score);
            return (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full gap-3 rounded-lg p-2.5 text-left hover:bg-white/5 ${selectedId === p.id ? "bg-white/10" : ""}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold tabular-nums text-[#0b0d12]" style={{ background: BAND_COLOR[band] }}>
                    {p.score ?? "…"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-white/50">
                      {p.neighborhood ?? p.address}
                      {p.rating != null ? ` · ★ ${p.rating.toFixed(1)} (${p.ratingCount ?? 0})` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {badgesFor(p).map((b) => (
                        <span key={b.label} className={`rounded px-1 py-px text-[10px] ring-1 ${TONE_CLASS[b.tone]}`}>
                          {b.label}
                        </span>
                      ))}
                      {p.leadStage && <span className="rounded bg-white/10 px-1 py-px text-[10px] text-white/70">no CRM</span>}
                      {p.approachable === false && <span className="rounded bg-white/5 px-1 py-px text-[10px] text-white/40">sem contato</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {places.length === 0 && (
            <li className="p-4 text-sm text-white/40">
              Nenhuma busca aberta.
              {recent.length > 0 && (
                <span className="mt-3 block space-y-1">
                  <span className="block text-xs uppercase tracking-wide text-white/30">Buscas recentes</span>
                  {recent.map((r) => (
                    <a key={r.id} href={`/radar?busca=${r.id}`} className="block text-sky-400 hover:underline">
                      {r.label ?? r.category} — {r.results} resultados
                    </a>
                  ))}
                </span>
              )}
            </li>
          )}
        </ul>
        <p className="border-t border-white/10 px-4 py-2 text-[10px] text-white/30">Dados de lugares: Google</p>
      </div>

      {/* mapa */}
      <div className="relative min-w-0 flex-1">
        <RadarMap
          center={center}
          panTarget={panTarget}
          radiusM={radiusKm * 1000}
          places={visible}
          selectedId={selectedId}
          onPickCenter={(c) => {
            setCenter(c);
            setCityId("mapa");
          }}
          onSelect={setSelectedId}
        />
      </div>

      {/* painel do lead */}
      {selectedId && (
        <div className="w-[420px] shrink-0">
          <LeadPanel key={selectedId} placeId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => searchId && loadResults(searchId)} />
        </div>
      )}
    </div>
  );
}

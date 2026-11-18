"use client";

import { ArrowLeft, Crosshair, Flame, History, Loader2, MapPin, Radar, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { addToCrmAction, searchAction } from "@/app/actions";
import { badgesFor, TONE_CLASS } from "@/components/lead/badges";
import { LeadPanel } from "@/components/lead/lead-panel";
import { RadarMap } from "@/components/radar/radar-map";
import { brl, CATEGORY_ICON, ContactIcons, OFFER_CARDS, ScoreBadge, Stars, type OfferCardId } from "@/components/radar/ui";
import { CATEGORIES, CITIES, getCategory } from "@/lib/config/categories";
import type { LatLng } from "@/lib/geo";
import type { RadarPlace } from "@/lib/types";

type Recent = { id: string; category: string; radius_m: number; label: string | null; results: number; created_at: string | Date };
type Quota = { cells: number; used: number; cap: number; remaining: number };
type Filter = "todos" | "quentes" | "sem_site" | "abordaveis";
type SearchMeta = { lat: number; lng: number; radius_m: number; category: string; label?: string | null };
type Results = { places: RadarPlace[]; pending: number; search: SearchMeta | null };

/** Modo demonstração (página /dev/radar-preview): dados de exemplo, sem servidor. */
export type RadarDemo = { places: RadarPlace[]; label: string; category: string; radiusKm: number; selectedId?: string; mode?: "busca" | "resultados" };

const TICKET_KEY = "radar.ticket";
const OFFER_KEY = "radar.offer";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function RadarApp({ recent, initialSearchId, demo }: { recent: Recent[]; initialSearchId: string | null; demo?: RadarDemo }) {
  const [category, setCategory] = useState<string>(demo?.category ?? "barbearia");
  const [offer, setOffer] = useState<OfferCardId>("site");
  const [ticket, setTicket] = useState<number>(1200);
  const [cityId, setCityId] = useState<string>("goiania");
  const [center, setCenter] = useState<LatLng>({ lat: CITIES[0].lat, lng: CITIES[0].lng });
  const [panTarget, setPanTarget] = useState<LatLng>(center);
  const [radiusKm, setRadiusKm] = useState(demo?.radiusKm ?? 3);
  const [searchId, setSearchId] = useState<string | null>(demo ? "demo" : initialSearchId);
  const [searchLabel, setSearchLabel] = useState<string | null>(demo?.label ?? null);
  const [places, setPlaces] = useState<RadarPlace[]>(demo?.places ?? []);
  const [pendingAudits, setPendingAudits] = useState(demo ? demo.places.filter((p) => p.score == null).length : 0);
  const [mode, setMode] = useState<"busca" | "resultados">(demo?.mode ?? (initialSearchId ? "resultados" : "busca"));
  const [selectedId, setSelectedId] = useState<string | null>(demo?.selectedId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [searching, startSearch] = useTransition();
  const processing = useRef(false);

  // preferências salvas neste navegador (depois da montagem, para não divergir do HTML do servidor)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const o = readLocal(OFFER_KEY);
      if (o && OFFER_CARDS.some((c) => c.id === o)) setOffer(o as OfferCardId);
      const t = Number(readLocal(TICKET_KEY));
      if (Number.isFinite(t) && t > 0) setTicket(t);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const cat = getCategory(category);
  const city = CITIES.find((c) => c.id === cityId);
  const placeLabel = city?.label ?? "ponto no mapa";

  // estimativa de cota para o raio atual
  useEffect(() => {
    if (demo) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/quota?radius=${radiusKm * 1000}`);
      if (r.ok) setQuota(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [radiusKm, searchId, demo]);

  const loadResults = useCallback(async (id: string): Promise<Results | undefined> => {
    const r = await fetch(`/api/radar/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as Results;
    setPlaces(j.places);
    setPendingAudits(j.pending);
    return j;
  }, []);

  // abre uma busca salva (?busca=)
  useEffect(() => {
    if (!initialSearchId || demo) return;
    let alive = true;
    fetch(`/api/radar/${initialSearchId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Results>) : null))
      .then((j) => {
        if (!alive || !j) return;
        setPlaces(j.places);
        setPendingAudits(j.pending);
        if (j.search) {
          const c = { lat: Number(j.search.lat), lng: Number(j.search.lng) };
          setCenter(c);
          setPanTarget(c);
          setRadiusKm(Math.round(j.search.radius_m / 100) / 10);
          setCategory(j.search.category);
          setSearchLabel(j.search.label ?? null);
          setCityId("mapa");
        }
      });
    return () => {
      alive = false;
    };
  }, [initialSearchId, demo]);

  // enquanto houver análise pendente: roda um lote e recarrega
  useEffect(() => {
    if (demo || !searchId || pendingAudits === 0) return;
    const t = setInterval(async () => {
      if (!processing.current) {
        processing.current = true;
        fetch("/api/audits/process", { method: "POST" }).finally(() => (processing.current = false));
      }
      await loadResults(searchId);
    }, 3000);
    return () => clearInterval(t);
  }, [searchId, pendingAudits, loadResults, demo]);

  const runSearch = () =>
    startSearch(async () => {
      setMessage(null);
      setSelectedId(null);
      const label = `${cat?.label ?? category} · ${placeLabel} · ${radiusKm} km`;
      const out = await searchAction({ category, lat: center.lat, lng: center.lng, radiusM: radiusKm * 1000, label });
      if (!out.ok) {
        setMessage(out.error);
        return;
      }
      const d = out.discarded;
      const removed = d.franquia + d.fechado + d.duplicado;
      setMessage(
        `${out.calls} chamadas ao Google${out.partial ? " — busca parcial: limite do mês atingido" : ""}` +
          (removed ? ` · ${removed} removidos (${d.franquia} franquias, ${d.fechado} fechados, ${d.duplicado} duplicados)` : ""),
      );
      setSearchId(out.searchId);
      setSearchLabel(label);
      setMode("resultados");
      setFilter("todos");
      window.history.replaceState(null, "", `/radar?busca=${out.searchId}`);
      await loadResults(out.searchId);
    });

  const stats = useMemo(() => {
    const semSite = places.filter((p) => p.siteType === "sem_site" || p.siteType === "so_rede_social").length;
    const quentes = places.filter((p) => (p.score ?? 0) >= 75).length;
    const oportunidades = places.filter((p) => p.approachable !== false && (p.score ?? 0) >= 50).length;
    return { semSite, quentes, oportunidades };
  }, [places]);

  const visible = useMemo(
    () =>
      [...places].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).filter((p) => {
        if (filter === "quentes") return (p.score ?? 0) >= 75;
        if (filter === "sem_site") return p.siteType === "sem_site" || p.siteType === "so_rede_social";
        if (filter === "abordaveis") return p.approachable !== false && (p.score ?? 0) >= 50;
        return true;
      }),
    [places, filter],
  );

  const hotNotInCrm = places.filter((p) => (p.score ?? 0) >= 75 && p.approachable !== false && !p.leadId);
  const analyzed = places.length - pendingAudits;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* mapa em tela cheia */}
      <div className="absolute inset-0">
        <RadarMap
          center={center}
          panTarget={panTarget}
          radiusM={radiusKm * 1000}
          places={mode === "resultados" ? visible : []}
          selectedId={selectedId}
          onPickCenter={(c) => {
            if (mode !== "busca") return;
            setCenter(c);
            setCityId("mapa");
          }}
          onSelect={setSelectedId}
        />
      </div>

      {/* rótulo da busca no topo */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-[#0b0d12]/85 px-4 py-2 text-sm font-medium shadow-lg ring-1 ring-white/10 backdrop-blur">
          <Radar className="h-4 w-4 text-sky-400" />
          {mode === "resultados" && searchLabel ? searchLabel : `${cat?.label ?? ""} · ${placeLabel} · ${radiusKm} km`}
        </div>
      </div>

      {/* painel flutuante */}
      <aside className="absolute bottom-4 left-4 top-4 z-20 flex w-[400px] flex-col overflow-hidden rounded-2xl bg-[#0f1219]/92 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        {mode === "busca" ? (
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <header>
              <h1 className="text-2xl font-semibold tracking-tight">Radar de clientes</h1>
              <p className="mt-1 text-sm text-white/50">Ache negócios no mapa, veja quem precisa de você e chame no WhatsApp.</p>
            </header>

            <section>
              <Label>O que você oferece</Label>
              <div className="grid grid-cols-2 gap-2">
                {OFFER_CARDS.map((o) => {
                  const on = offer === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => {
                        setOffer(o.id);
                        writeLocal(OFFER_KEY, o.id);
                      }}
                      className={`rounded-xl p-3 text-left transition ${on ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20" : "bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.07]"}`}
                    >
                      <o.icon className={`mb-2 h-5 w-5 ${on ? "text-white" : "text-sky-400"}`} />
                      <div className="text-sm font-semibold leading-tight">{o.label}</div>
                      <div className={`mt-0.5 text-[11px] leading-snug ${on ? "text-white/80" : "text-white/45"}`}>{o.hint}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <Label>Tipo de negócio</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICON[c.id];
                  const on = category === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${on ? "bg-sky-500 font-medium text-[#0b0d12]" : "bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.08]"}`}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <Label>Onde</Label>
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 ring-1 ring-white/10 focus-within:ring-sky-500/60">
                <MapPin className="h-4 w-4 shrink-0 text-sky-400" />
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
                  className="w-full bg-transparent py-2.5 text-sm outline-none"
                >
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0f1219]">
                      {c.label}, GO
                    </option>
                  ))}
                  <option value="mapa" className="bg-[#0f1219]">
                    Ponto escolhido no mapa
                  </option>
                </select>
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-white/40">
                <Crosshair className="h-3 w-3" /> ou clique no mapa para mover o centro
              </p>
            </section>

            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <Label className="mb-0">Raio</Label>
                <span className="text-lg font-semibold tabular-nums">{radiusKm.toString().replace(".", ",")} km</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                step={0.5}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full accent-sky-500"
                aria-label="Raio da busca em km"
              />
              <div className="flex justify-between text-[11px] text-white/35">
                <span>1 km</span>
                <span>15 km</span>
              </div>
            </section>

            {recent.length > 0 && (
              <section>
                <Label>
                  <History className="mr-1 inline h-3 w-3" />
                  Buscas recentes
                </Label>
                <div className="space-y-1">
                  {recent.slice(0, 4).map((r) => (
                    <a key={r.id} href={`/radar?busca=${r.id}`} className="flex justify-between rounded-lg px-2 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                      <span className="truncate">{r.label ?? r.category}</span>
                      <span className="shrink-0 text-white/40">{r.results}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <ResultsView
            places={visible}
            total={places.length}
            stats={stats}
            ticket={ticket}
            onTicket={(v) => {
              setTicket(v);
              writeLocal(TICKET_KEY, String(v));
            }}
            pending={pendingAudits}
            analyzed={analyzed}
            filter={filter}
            onFilter={setFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
            categoryPlural={cat?.plural ?? "negócios"}
            message={message}
            hotCount={hotNotInCrm.length}
            onAddHot={async () => {
              if (demo) return;
              const r = await addToCrmAction(hotNotInCrm.map((p) => p.id));
              setMessage(r.ok ? `${r.data} leads quentes adicionados ao CRM.` : r.error);
              if (searchId) await loadResults(searchId);
            }}
            onBack={() => {
              setMode("busca");
              setSelectedId(null);
            }}
          />
        )}

        {mode === "busca" && (
          <footer className="space-y-2 border-t border-white/10 bg-[#0f1219] p-4">
            {message && <p className="text-xs text-red-300">{message}</p>}
            <button
              onClick={runSearch}
              disabled={searching || !!demo}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 py-3 font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? "Varrendo o mapa…" : `Buscar ${cat?.plural ?? ""} ${city ? `em ${city.label}` : "em volta do ponto"}`}
            </button>
            <p className="text-center text-[11px] text-white/40">
              {quota ? `~${quota.cells} chamadas ao Google · ${quota.used} de ${quota.cap} usadas no mês` : "Calculando o custo da busca…"}
            </p>
          </footer>
        )}
      </aside>

      {/* painel do lead */}
      {selectedId && (
        <div className="absolute bottom-4 right-4 top-4 z-30 w-[420px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
          <LeadPanel key={selectedId} placeId={selectedId} defaultOffer={offer} demo={demo?.places.find((p) => p.id === selectedId)} onClose={() => setSelectedId(null)} onChanged={() => searchId && !demo && loadResults(searchId)} />
        </div>
      )}
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-2 text-xs font-medium uppercase tracking-wide text-white/45 ${className}`}>{children}</div>;
}

function ResultsView(props: {
  places: RadarPlace[];
  total: number;
  stats: { semSite: number; quentes: number; oportunidades: number };
  ticket: number;
  onTicket: (v: number) => void;
  pending: number;
  analyzed: number;
  filter: Filter;
  onFilter: (f: Filter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  categoryPlural: string;
  message: string | null;
  hotCount: number;
  onAddHot: () => void;
  onBack: () => void;
}) {
  const { places, total, stats, ticket, pending, analyzed } = props;
  const [editingTicket, setEditingTicket] = useState(false);
  const pct = total ? Math.round((analyzed / total) * 100) : 0;
  const filters: [Filter, string, number | null][] = [
    ["todos", "Todos", total],
    ["quentes", "Quentes", stats.quentes],
    ["sem_site", "Sem site", stats.semSite],
    ["abordaveis", "Abordáveis", stats.oportunidades],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="space-y-3 border-b border-white/10 p-5">
        <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Nova busca
        </button>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {total} {total === 1 ? "negócio" : props.categoryPlural} no radar
          </h2>
          <p className="text-sm text-white/50">
            {stats.semSite} sem site próprio · {stats.quentes} quentes
          </p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/[0.03] p-3.5 ring-1 ring-emerald-500/25">
          <div className="text-2xl font-bold tracking-tight text-emerald-300">{brl.format(stats.oportunidades * ticket)} em potencial</div>
          <div className="mt-0.5 text-xs text-emerald-100/60">
            {stats.oportunidades} oportunidades com contato ×{" "}
            {editingTicket ? (
              <input
                autoFocus
                type="number"
                min={0}
                step={50}
                defaultValue={ticket}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0) props.onTicket(v);
                  setEditingTicket(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-20 rounded bg-black/30 px-1 text-emerald-100 outline-none ring-1 ring-emerald-500/40"
              />
            ) : (
              <button onClick={() => setEditingTicket(true)} className="underline decoration-dotted underline-offset-2 hover:text-emerald-100" title="Clique para mudar o seu ticket médio">
                {brl.format(ticket)}
              </button>
            )}{" "}
            de ticket médio
          </div>
        </div>

        {pending > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-sky-300">
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Analisando sites e notas
              </span>
              <span className="tabular-nums">
                {analyzed}/{total}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-1.5">
          {filters.map(([v, l, n]) => (
            <button
              key={v}
              onClick={() => props.onFilter(v)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${props.filter === v ? "bg-white text-[#0b0d12]" : "bg-white/[0.05] text-white/60 hover:text-white"}`}
            >
              {l}
              {n != null && <span className="ml-1 tabular-nums opacity-60">{n}</span>}
            </button>
          ))}
        </div>
        {props.message && <p className="text-[11px] text-white/45">{props.message}</p>}
      </header>

      {props.hotCount > 0 && (
        <button onClick={props.onAddHot} className="mx-4 mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-2 text-xs font-medium text-orange-300 ring-1 ring-orange-500/30 hover:bg-orange-500/15">
          <Flame className="h-3.5 w-3.5" /> Mandar os {props.hotCount} quentes para o CRM
        </button>
      )}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {places.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => props.onSelect(p.id)}
              className={`flex w-full gap-3 rounded-xl p-3 text-left transition ${props.selectedId === p.id ? "bg-sky-500/10 ring-1 ring-sky-500/40" : "hover:bg-white/[0.04]"}`}
            >
              <ScoreBadge score={p.score} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <ContactIcons place={p} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/45">{p.neighborhood ?? p.address}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Stars rating={p.rating} count={p.ratingCount} />
                  {badgesFor(p).map((b) => (
                    <span key={b.label} className={`rounded-md px-1.5 py-px text-[10px] font-medium ring-1 ${TONE_CLASS[b.tone]}`}>
                      {b.label}
                    </span>
                  ))}
                  {p.leadStage && <span className="rounded-md bg-white/10 px-1.5 py-px text-[10px] text-white/70">no CRM</span>}
                  {p.approachable === false && <span className="rounded-md bg-white/5 px-1.5 py-px text-[10px] text-white/40">sem contato</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
        {places.length === 0 && <li className="p-6 text-center text-sm text-white/40">Nenhum negócio neste filtro.</li>}
      </ul>
      <p className="border-t border-white/10 px-5 py-2 text-[10px] text-white/30">Dados de lugares: Google</p>
    </div>
  );
}

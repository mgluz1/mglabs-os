"use client";

import { Check, ChevronLeft, Crosshair, Flame, History, Loader2, MapPin, Pencil, Radar, Search, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { openInStudioAction, searchAction } from "@/app/actions";
import { badgesFor } from "@/components/lead/badges";
import { LeadPanel } from "@/components/lead/lead-panel";
import { RadarMap } from "@/components/radar/radar-map";
import { brl, CATEGORY_ICON, OFFER_CARDS, ScoreRing, Stars, type OfferCardId } from "@/components/radar/ui";
import { addPlaceToCrmAction } from "@/lib/actions/crm";
import { CATEGORIES, CITIES, getCategory } from "@/lib/config/categories";
import { relativeDays } from "@/lib/dates";
import { distanceM, type LatLng } from "@/lib/geo";
import { normalize } from "@/lib/text";
import type { RadarPlace } from "@/lib/types";
import { useNow } from "@/lib/use-now";

type Recent = { id: string; category: string; radius_m: number; label: string | null; results: number; created_at: string | Date };
type Info = { total: number; release: string | null };
type Filter = "todos" | "quentes" | "sem_site" | "abordaveis";
type SearchMeta = { lat: number; lng: number; radius_m: number; category: string; label?: string | null; created_at?: string };
type Results = { places: RadarPlace[]; pending: number; search: SearchMeta | null };

/** Modo demonstração (página /dev-preview/radar): dados de exemplo, sem servidor. */
export type RadarDemo = { places: RadarPlace[]; label: string; category: string; radiusKm: number; selectedId?: string; mode?: "busca" | "resultados" };

const TICKET_KEY = "radar.ticket";
const OFFER_KEY = "radar.offer";
const PANEL_W = 440;
const RADIUS_PRESETS = [1, 3, 5, 10];

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
  } catch {
    /* sem armazenamento: preferência vale só nesta sessão */
  }
}

function subscribeMq(cb: () => void) {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useDesktop = () => useSyncExternalStore(subscribeMq, () => window.matchMedia("(min-width: 768px)").matches, () => true);

const km = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace(".", ",")} km`;
const fmtKm = (v: number) => `${v.toString().replace(".", ",")} km`;

export function RadarApp({ recent, initialSearchId, demo }: { recent: Recent[]; initialSearchId: string | null; demo?: RadarDemo }) {
  const router = useRouter();
  const desktop = useDesktop();
  const [category, setCategory] = useState<string>(demo?.category ?? "barbearia");
  const [offer, setOffer] = useState<OfferCardId>("site");
  const [ticket, setTicket] = useState<number>(1200);
  const [cityId, setCityId] = useState<string>("goiania");
  const [center, setCenter] = useState<LatLng>({ lat: CITIES[0].lat, lng: CITIES[0].lng });
  const [panTarget, setPanTarget] = useState<LatLng>(center);
  const [radiusKm, setRadiusKm] = useState(demo?.radiusKm ?? 3);
  const [searchId, setSearchId] = useState<string | null>(demo ? "demo" : initialSearchId);
  const [searchedAt, setSearchedAt] = useState<Date | null>(null);
  const [places, setPlaces] = useState<RadarPlace[]>(demo?.places ?? []);
  const [pendingAudits, setPendingAudits] = useState(demo ? demo.places.filter((p) => p.score == null).length : 0);
  const [mode, setMode] = useState<"busca" | "resultados">(demo?.mode ?? (initialSearchId ? "resultados" : "busca"));
  const [selectedId, setSelectedId] = useState<string | null>(demo?.selectedId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [searching, startSearch] = useTransition();
  const [approaching, startApproach] = useTransition();
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

  // tamanho e release da base aberta
  useEffect(() => {
    if (demo) return;
    let alive = true;
    fetch("/api/radar/info")
      .then((r) => (r.ok ? (r.json() as Promise<Info>) : null))
      .then((j) => alive && j && setInfo(j));
    return () => {
      alive = false;
    };
  }, [demo]);

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
          setCityId(CITIES.find((x) => Math.abs(x.lat - c.lat) < 0.001 && Math.abs(x.lng - c.lng) < 0.001)?.id ?? "mapa");
          if (j.search.created_at) setSearchedAt(new Date(j.search.created_at));
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
      const label = `${cat?.label ?? category} · ${placeLabel} · ${fmtKm(radiusKm)}`;
      const out = await searchAction({ category, lat: center.lat, lng: center.lng, radiusM: radiusKm * 1000, label });
      if (!out.ok) {
        setMessage(out.error);
        return;
      }
      const d = out.discarded;
      const removed = d.franquia + d.fechado + d.duplicado;
      setMessage(
        (out.partial ? "Muitos resultados: mostrando os 600 mais perto do centro. " : "") +
          (removed ? `${removed} descartados (${d.franquia} redes/franquias, ${d.duplicado} duplicados).` : ""),
      );
      setSearchId(out.searchId);
      setSearchedAt(new Date());
      setMode("resultados");
      setFilter("todos");
      window.history.replaceState(null, "", `/radar?busca=${out.searchId}`);
      await loadResults(out.searchId);
    });

  const stats = useMemo(() => {
    const semSite = places.filter((p) => p.siteType === "sem_site" || p.siteType === "so_rede_social").length;
    const quentes = places.filter((p) => (p.score ?? 0) >= 75).length;
    const oportunidades = places.filter((p) => p.approachable !== false && !p.optedOut && (p.score ?? 0) >= 50).length;
    return { semSite, quentes, oportunidades };
  }, [places]);

  const visible = useMemo(
    () =>
      [...places]
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .filter((p) => {
          if (filter === "quentes") return (p.score ?? 0) >= 75;
          if (filter === "sem_site") return p.siteType === "sem_site" || p.siteType === "so_rede_social";
          if (filter === "abordaveis") return p.approachable !== false && (p.score ?? 0) >= 50;
          return true;
        }),
    [places, filter],
  );

  const hotNotInCrm = places.filter((p) => (p.score ?? 0) >= 75 && p.approachable !== false && !p.leadId && !p.optedOut);
  // "Abordar agora": o melhor negócio com contato que ainda não foi abordado
  const next = visible.find((p) => p.approachable !== false && !p.optedOut && (!p.leadStage || p.leadStage === "novo" || p.leadStage === "qualificado") && p.score != null);

  const approach = () =>
    startApproach(async () => {
      if (!next || demo) return;
      const r = await openInStudioAction(next.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      router.push(`/mensagens?empresa=${r.data.companyId}&oportunidade=${r.data.dealId}`);
    });

  const chip = `${cat?.plural ?? "negócios"} · ${placeLabel === "ponto no mapa" ? "ponto no mapa" : `${placeLabel}, GO`} · ${fmtKm(radiusKm)}`;
  const ChipIcon = CATEGORY_ICON[category] ?? Radar;

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* mapa do OpenStreetMap ocupando a tela */}
      <div className={desktop ? "absolute inset-0" : "absolute inset-x-0 top-0 h-[44%]"}>
        <RadarMap
          center={center}
          panTarget={panTarget}
          radiusM={radiusKm * 1000}
          places={mode === "resultados" ? visible : []}
          selectedId={selectedId}
          category={category}
          leftInset={desktop ? PANEL_W + 16 : 0}
          compact={!desktop}
          onPickCenter={(c) => {
            if (mode !== "busca") return;
            setCenter(c);
            setCityId("mapa");
          }}
          onSelect={setSelectedId}
        />
      </div>

      {/* resumo da busca sobre o mapa */}
      <div className={`pointer-events-none absolute top-4 z-10 -translate-x-1/2 transition-opacity ${selectedId && desktop ? "opacity-0" : ""}`} style={{ left: desktop ? `calc(${PANEL_W + 16}px + (100% - ${PANEL_W + 16}px) / 2)` : "50%" }}>
        <div className="flex max-w-[80vw] items-center gap-2 truncate rounded-full bg-[#14231b]/85 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur">
          <ChipIcon className="h-4 w-4 shrink-0 text-[#7fd6a6]" aria-hidden />
          <span className="truncate">{chip}</span>
        </div>
      </div>

      {/* painel: cartão flutuante no desktop, folha inferior no celular */}
      <aside
        aria-label={mode === "busca" ? "Buscar clientes" : "Resultados"}
        className={
          desktop
            ? "absolute bottom-4 left-4 top-4 z-20 flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-float)]"
            : "absolute inset-x-0 bottom-0 top-[40%] z-20 flex flex-col overflow-hidden rounded-t-[24px] border-t border-line bg-surface shadow-[var(--shadow-float)]"
        }
        style={desktop ? { width: PANEL_W } : undefined}
      >
        {mode === "busca" ? (
          <SearchView
            offer={offer}
            onOffer={(o) => {
              setOffer(o);
              writeLocal(OFFER_KEY, o);
            }}
            category={category}
            onCategory={setCategory}
            cityId={cityId}
            onCity={(id) => {
              setCityId(id);
              const c = CITIES.find((x) => x.id === id);
              if (c) {
                setCenter({ lat: c.lat, lng: c.lng });
                setPanTarget({ lat: c.lat, lng: c.lng });
              }
            }}
            radiusKm={radiusKm}
            onRadius={setRadiusKm}
            recent={recent}
            searching={searching}
            disabled={!!demo}
            onSearch={runSearch}
            message={message}
            footnote={
              demo
                ? "Modo demonstração"
                : info
                  ? info.total > 0
                    ? `Grátis · ${info.total.toLocaleString("pt-BR")} negócios na base aberta${info.release ? ` (Overture ${info.release})` : ""}`
                    : "A base aberta ainda está vazia: atualize em Status"
                  : "Carregando a base…"
            }
          />
        ) : (
          <ResultsView
            places={visible}
            center={center}
            total={places.length}
            stats={stats}
            ticket={ticket}
            onTicket={(v) => {
              setTicket(v);
              writeLocal(TICKET_KEY, String(v));
            }}
            pending={pendingAudits}
            filter={filter}
            onFilter={setFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
            category={category}
            placeLabel={placeLabel}
            radiusKm={radiusKm}
            searchedAt={searchedAt}
            message={message}
            hotCount={hotNotInCrm.length}
            onAddHot={async () => {
              if (demo) return;
              const r = await addPlaceToCrmAction(hotNotInCrm.map((p) => p.id));
              setMessage(r.ok ? `${r.data.created} leads quentes adicionados ao CRM${r.data.existing ? ` (${r.data.existing} já estavam)` : ""}.` : r.error);
              if (searchId) await loadResults(searchId);
            }}
            canApproach={!!next && !demo}
            approaching={approaching}
            onApproach={approach}
            onBack={() => {
              setMode("busca");
              setSelectedId(null);
            }}
          />
        )}
      </aside>

      {/* ficha do negócio */}
      {selectedId && (
        <div className={desktop ? "absolute bottom-4 right-4 top-4 z-30 overflow-hidden rounded-[24px] border border-line shadow-[var(--shadow-float)]" : "fixed inset-0 z-40"} style={desktop ? { width: PANEL_W } : undefined}>
          <LeadPanel
            key={selectedId}
            placeId={selectedId}
            center={center}
            demo={demo?.places.find((p) => p.id === selectedId)}
            onClose={() => setSelectedId(null)}
            onChanged={() => searchId && !demo && loadResults(searchId)}
          />
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm text-muted">
      {children}
    </label>
  );
}

// ---------------- Busca ----------------

function SearchView(props: {
  offer: OfferCardId;
  onOffer: (o: OfferCardId) => void;
  category: string;
  onCategory: (c: string) => void;
  cityId: string;
  onCity: (id: string) => void;
  radiusKm: number;
  onRadius: (v: number) => void;
  recent: Recent[];
  searching: boolean;
  disabled: boolean;
  onSearch: () => void;
  message: string | null;
  footnote: string;
}) {
  const cat = getCategory(props.category);
  const city = CITIES.find((c) => c.id === props.cityId);
  return (
    <>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-4 pt-7">
        <h1 className="text-[30px] leading-none">Encontre clientes</h1>

        <section>
          <FieldLabel>Você vende</FieldLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {OFFER_CARDS.map((o) => {
              const on = props.offer === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => props.onOffer(o.id)}
                  className={`rounded-2xl p-3.5 text-left transition ${on ? "bg-brand text-brand-on shadow-[0_10px_24px_-10px_var(--brand)]" : "border border-line bg-elevated hover:border-line-strong"}`}
                >
                  <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${on ? "bg-white/15" : "bg-brand-soft text-brand"}`}>
                    <o.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="block text-[15px] font-semibold leading-tight">{o.label}</span>
                  <span className={`mt-1 block text-xs leading-snug ${on ? "text-brand-on/80" : "text-muted"}`}>{o.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <FieldLabel htmlFor="radar-para-quem">Para quem</FieldLabel>
          <Combo
            id="radar-para-quem"
            icon={cat ? CATEGORY_ICON[cat.id] ?? Search : Search}
            placeholder="Barbearia, academia, clínica…"
            value={cat?.label ?? ""}
            options={CATEGORIES.map((c) => ({ id: c.id, label: c.label, hint: c.plural }))}
            onPick={props.onCategory}
            clearable={false}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c.id];
              const on = props.category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => props.onCategory(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:border-line-strong"}`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                  {c.label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <FieldLabel htmlFor="radar-onde">Onde</FieldLabel>
          <Combo
            id="radar-onde"
            icon={MapPin}
            placeholder="Sua cidade"
            value={city ? `${city.label}, GO` : "Ponto escolhido no mapa"}
            options={CITIES.map((c) => ({ id: c.id, label: c.label, hint: "GO" }))}
            onPick={props.onCity}
            clearable={false}
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Crosshair className="h-3.5 w-3.5" aria-hidden /> ou clique no mapa para escolher o centro
          </p>
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-muted">Raio</span>
            <span className="font-heading text-[22px] leading-none tabular-nums">{fmtKm(props.radiusKm)}</span>
          </div>
          <input type="range" min={1} max={15} step={0.5} value={props.radiusKm} onChange={(e) => props.onRadius(Number(e.target.value))} className="w-full accent-[var(--brand)]" aria-label="Raio da busca em km" />
          <div className="mt-2 flex gap-1.5">
            {RADIUS_PRESETS.map((r) => (
              <button key={r} type="button" onClick={() => props.onRadius(r)} className={`flex-1 rounded-lg border py-1 text-xs tabular-nums transition ${props.radiusKm === r ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-muted hover:text-fg"}`}>
                {r} km
              </button>
            ))}
          </div>
        </section>

        {props.recent.length > 0 && (
          <section>
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <History className="h-3 w-3" aria-hidden /> Buscas recentes
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {props.recent.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <a href={`/radar?busca=${r.id}`} className="flex justify-between gap-3 px-3 py-2 text-sm hover:bg-background">
                    <span className="truncate">{r.label ?? r.category}</span>
                    <span className="shrink-0 tabular-nums text-muted">{r.results}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="space-y-2 border-t border-line bg-surface px-6 py-4">
        {props.message && <p className="text-xs text-danger">{props.message}</p>}
        <button
          type="button"
          onClick={props.onSearch}
          disabled={props.searching || props.disabled}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-[15px] font-semibold text-brand-on shadow-[0_12px_28px_-12px_var(--brand)] transition hover:bg-brand-hover disabled:opacity-60"
        >
          {props.searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radar className="h-5 w-5" />}
          {props.searching ? "Varrendo o mapa…" : `Buscar ${cat?.plural ?? "clientes"} ${city ? `em ${city.label}` : "em volta do ponto"}`}
        </button>
        <p className="text-center text-xs text-muted">{props.footnote}</p>
      </footer>
    </>
  );
}

/** Campo com sugestões (categoria, cidade). Escolher é obrigatório; digitar só filtra. */
function Combo({ id, icon: Icon, placeholder, value, options, onPick, clearable }: { id: string; icon: React.ComponentType<{ className?: string }>; placeholder: string; value: string; options: { id: string; label: string; hint?: string }[]; onPick: (id: string) => void; clearable: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = options.filter((o) => !q || normalize(o.label).includes(normalize(q)));
  const pick = (o: { id: string }) => {
    onPick(o.id);
    setQ("");
    setOpen(false);
  };
  return (
    <div className="relative">
      <div className={`flex items-center gap-2.5 rounded-xl border bg-surface px-3.5 transition ${open ? "border-brand shadow-[0_0_0_3px_var(--brand-soft)]" : "border-line hover:border-line-strong"}`}>
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? q : value}
          placeholder={open ? value || placeholder : placeholder}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              pick(list[active]);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80 focus-visible:outline-none"
        />
        {clearable && value && <X className="h-4 w-4 text-muted" />}
      </div>
      {open && (
        <ul id={`${id}-lista`} role="listbox" className="fade-in absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-float)]">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nada encontrado. Por enquanto o Radar cobre as categorias listadas.</li>}
          {list.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-brand-soft text-fg" : ""}`}
              >
                <span>{o.label}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {o.hint}
                  {value.startsWith(o.label) && <Check className="h-3.5 w-3.5 text-brand" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Resultados ----------------

function ResultsView(props: {
  places: RadarPlace[];
  center: LatLng;
  total: number;
  stats: { semSite: number; quentes: number; oportunidades: number };
  ticket: number;
  onTicket: (v: number) => void;
  pending: number;
  filter: Filter;
  onFilter: (f: Filter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  category: string;
  placeLabel: string;
  radiusKm: number;
  searchedAt: Date | null;
  message: string | null;
  hotCount: number;
  onAddHot: () => void;
  canApproach: boolean;
  approaching: boolean;
  onApproach: () => void;
  onBack: () => void;
}) {
  const { places, total, stats, ticket, pending } = props;
  const now = useNow();
  const [editingTicket, setEditingTicket] = useState(false);
  const cat = getCategory(props.category);
  const CatIcon = CATEGORY_ICON[props.category] ?? Radar;
  const analyzed = total - pending;
  const pct = total ? Math.round((analyzed / total) * 100) : 0;
  const filters: [Filter, string, number][] = [
    ["todos", "Todos", total],
    ["quentes", "Quentes", stats.quentes],
    ["sem_site", "Sem site", stats.semSite],
    ["abordaveis", "Com contato", stats.oportunidades],
  ];
  const when = props.searchedAt ? (now - props.searchedAt.getTime() < 90_000 ? "agora" : relativeDays(props.searchedAt) === "hoje" ? `há ${Math.max(1, Math.round((now - props.searchedAt.getTime()) / 60_000))} min` : relativeDays(props.searchedAt)) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-5 px-6 pb-4 pt-6">
        <button type="button" onClick={props.onBack} className="inline-flex items-center gap-1 text-[15px] font-medium text-brand hover:underline">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Nova busca
        </button>

        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CatIcon className="h-4 w-4 text-brand" aria-hidden />
            {props.placeLabel} · {fmtKm(props.radiusKm)}
            {when && <span>· {when}</span>}
          </p>
          <h1 className="mt-1.5 text-[34px] leading-[1.05]">
            {total} {total === 1 ? cat?.label.toLowerCase() ?? "negócio" : cat?.plural ?? "negócios"}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {stats.semSite} sem site próprio · {stats.quentes} {stats.quentes === 1 ? "quente" : "quentes"}
          </p>
        </div>

        <div className="rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-soft to-surface p-4">
          <div className="text-sm font-medium text-brand">Dinheiro em jogo</div>
          <div className="mt-1 font-heading text-[34px] leading-none tabular-nums">{brl.format(stats.oportunidades * ticket)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            {stats.oportunidades} × {""}
            {editingTicket ? (
              <input
                autoFocus
                type="number"
                min={0}
                step={50}
                defaultValue={ticket}
                aria-label="Seu preço por negócio"
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0) props.onTicket(v);
                  setEditingTicket(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="input w-24 py-0.5"
              />
            ) : (
              <>
                {brl.format(ticket)}, o seu preço
                <button type="button" onClick={() => setEditingTicket(true)} className="rounded p-1 hover:bg-fg/8 hover:text-fg" aria-label="Mudar o seu preço">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={props.onApproach}
          disabled={!props.canApproach || props.approaching}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-[15px] font-semibold text-brand-on shadow-[0_12px_28px_-12px_var(--brand)] transition hover:bg-brand-hover disabled:opacity-50"
          title="Abre o próximo negócio com contato no Estúdio de Mensagens"
        >
          {props.approaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" aria-hidden />}
          Abordar agora
        </button>

        {pending > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-brand">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Analisando sites e notas
              </span>
              <span className="tabular-nums">
                {analyzed}/{total}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-fg/8">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map(([v, l, n]) => (
            <button key={v} type="button" aria-pressed={props.filter === v} onClick={() => props.onFilter(v)} className={`rounded-full border px-3 py-1 text-xs transition ${props.filter === v ? "border-fg bg-fg text-background" : "border-line text-muted hover:text-fg"}`}>
              {l} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
          {props.hotCount > 0 && (
            <button type="button" onClick={props.onAddHot} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              <Flame className="h-3.5 w-3.5" aria-hidden /> {props.hotCount} quentes → CRM
            </button>
          )}
        </div>
        {props.message && <p className="text-xs text-muted">{props.message}</p>}
      </div>

      <ul className="space-y-1 px-3 pb-3">
        {places.map((p) => {
          const dist = distanceM(props.center, { lat: p.lat, lng: p.lng });
          const sel = props.selectedId === p.id;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => props.onSelect(p.id)} className={`flex w-full gap-3 rounded-2xl p-3 text-left transition ${sel ? "bg-brand-soft" : "hover:bg-background"}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{p.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {p.rating != null ? <Stars rating={p.rating} count={p.ratingCount} /> : p.confidence != null ? `Confiança ${Math.round(p.confidence * 100)}%${p.sourceCount ? ` · ${p.sourceCount} ${p.sourceCount === 1 ? "fonte" : "fontes"}` : ""}` : "Dados abertos"}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {cat?.label} · {p.neighborhood ?? p.city ?? "—"} · {km(dist)}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {badgesFor(p).slice(0, 3).map((b) => (
                      <span key={b.label} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                        {b.label}
                      </span>
                    ))}
                    {p.leadStage && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">No CRM</span>}
                    {p.approachable === false && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted/80">Sem contato</span>}
                  </span>
                </span>
                <span className={`relative mt-1 flex h-[78px] w-[86px] shrink-0 items-center justify-center rounded-xl ${sel ? "bg-surface" : "bg-brand-soft"}`}>
                  <CatIcon className="h-7 w-7 text-brand/45" aria-hidden />
                  <span className="absolute -bottom-2 -left-3">
                    <ScoreRing score={p.score} size={40} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {places.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhum negócio neste filtro.</li>}
      </ul>
      <p className="border-t border-line px-6 py-3 text-[11px] text-muted">Lugares: Overture Maps (dados abertos) · Mapa: © colaboradores do OpenStreetMap</p>
    </div>
  );
}

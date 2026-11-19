"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Crosshair,
  Flame,
  History,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Pencil,
  Radar,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { loadMoreRadarAction, openInStudioAction, prospectStateAction, retryAuditsAction, searchAction } from "@/app/actions";
import { badgesFor } from "@/components/lead/badges";
import { LeadPanel } from "@/components/lead/lead-panel";
import { RadarMap } from "@/components/radar/radar-map";
import { brl, CATEGORY_ICON, OFFER_CARDS, ScoreRing, Stars, type OfferCardId } from "@/components/radar/ui";
import { addPlaceToCrmAction } from "@/lib/actions/crm";
import { CATEGORIES, categoryLabel, CITIES, FEATURED_CATEGORIES, getCategory, searchCategories } from "@/lib/config/categories";
import { relativeDays } from "@/lib/dates";
import { distanceM, type LatLng } from "@/lib/geo";
import { APPROACH_STATUS_LABEL, buildProspectQueue, deriveApproachStatus, isHiddenFromQueue, type QueueItem } from "@/lib/prospecting";
import { contactCapabilities, isNextApproachable, isPriorityLead, nextPollDelayMs } from "@/lib/radar-signals";
import type { RadarPlace } from "@/lib/types";
import { useNow } from "@/lib/use-now";

type Recent = { id: string; category: string; radius_m: number; label: string | null; results: number; created_at: string | Date };
type Info = { total: number; release: string | null };
type Availability = { available: number; maxLimit: number; cappedAt: number };
type Filter = "todos" | "com_contato" | "prioritarios" | "sem_site" | "no_crm" | "ignorados";
type SortBy = "oportunidade" | "contato" | "distancia";
type MobileView = "dividido" | "lista" | "mapa";
type SearchMeta = { lat: number; lng: number; radius_m: number; category: string; label?: string | null; created_at?: string };
type Results = { places: RadarPlace[]; pending: number; failed?: number; hasMore?: boolean; search: SearchMeta | null };

/** Modo demonstração (página /dev-preview/radar): dados de exemplo, sem servidor. */
export type RadarDemo = { places: RadarPlace[]; label: string; category: string; radiusKm: number; selectedId?: string; mode?: "busca" | "resultados" };

const TICKET_KEY = "radar.ticket";
const OFFER_KEY = "radar.offer";
const LIMIT_KEY = "radar.limit";
const PANEL_W = 448;
const MIN_LIMIT = 5;
const MAX_LIMIT_CEILING = 600;
const DEFAULT_LIMIT = 30;
const RADIUS_PRESETS = [1, 3, 5, 10];
const LIMIT_PRESETS = [5, 15, 30, 50, 100, 250];

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

function contactRank(p: RadarPlace): number {
  const cap = contactCapabilities(p);
  if (cap.hasConfirmedWhatsapp) return 3;
  if (cap.hasMobile) return 2;
  if (cap.hasUsableContact) return 1;
  return 0;
}

export function RadarApp({ recent, initialSearchId, demo }: { recent: Recent[]; initialSearchId: string | null; demo?: RadarDemo }) {
  const router = useRouter();
  const desktop = useDesktop();
  const [category, setCategory] = useState<string>(demo?.category ?? "barbearia");
  const [customQuery, setCustomQuery] = useState<string>("");
  const [offer, setOffer] = useState<OfferCardId>("site");
  const [ticket, setTicket] = useState<number>(OFFER_CARDS[0].ticket);
  const [cityId, setCityId] = useState<string>("goiania");
  const [center, setCenter] = useState<LatLng>({ lat: CITIES[0].lat, lng: CITIES[0].lng });
  const [panTarget, setPanTarget] = useState<LatLng>(center);
  const [focusTarget, setFocusTarget] = useState<LatLng | null>(null);
  const [radiusKm, setRadiusKm] = useState(demo?.radiusKm ?? 3);
  const [desiredLimit, setDesiredLimit] = useState<number>(DEFAULT_LIMIT);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [countingAvail, setCountingAvail] = useState(false);

  const [searchId, setSearchId] = useState<string | null>(demo ? "demo" : initialSearchId);
  const [searchedAt, setSearchedAt] = useState<Date | null>(null);
  const [places, setPlaces] = useState<RadarPlace[]>(demo?.places ?? []);
  const [pendingAudits, setPendingAudits] = useState(demo ? demo.places.filter((p) => p.score == null).length : 0);
  const [failedAudits, setFailedAudits] = useState(demo ? demo.places.filter((p) => p.auditStatus === "error").length : 0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, startLoadMore] = useTransition();
  const [retryingAudits, startRetryAudits] = useTransition();
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollGeneration, setPollGeneration] = useState(0);
  const [mode, setMode] = useState<"busca" | "resultados">(demo?.mode ?? (initialSearchId ? "resultados" : "busca"));
  const [mobileView, setMobileView] = useState<MobileView>("dividido");
  const [selectedId, setSelectedId] = useState<string | null>(demo?.selectedId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [sortBy, setSortBy] = useState<SortBy>("oportunidade");
  const [searching, startSearch] = useTransition();
  const [approaching, startApproach] = useTransition();
  const processing = useRef(false);
  const activeSearchRef = useRef<string | null>(searchId);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    activeSearchRef.current = searchId;
  }, [searchId]);

  // preferências salvas neste navegador (depois da montagem, para não divergir do HTML do servidor)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const o = readLocal(OFFER_KEY);
      if (o && OFFER_CARDS.some((c) => c.id === o)) setOffer(o as OfferCardId);
      const t = Number(readLocal(TICKET_KEY));
      if (Number.isFinite(t) && t > 0) setTicket(t);
      const lim = Number(readLocal(LIMIT_KEY));
      if (Number.isFinite(lim) && lim >= MIN_LIMIT) setDesiredLimit(Math.min(MAX_LIMIT_CEILING, Math.round(lim)));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const cat = getCategory(category);
  const isCustom = category === "personalizado";
  const segmentPlural = isCustom ? (customQuery.trim() || "negócios") : (cat?.plural ?? categoryLabel(category));
  const segmentLabel = isCustom ? (customQuery.trim() || "Segmento livre") : (cat?.label ?? categoryLabel(category));
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

  // disponibilidade real de resultados na região/segmento escolhido (debounced)
  useEffect(() => {
    if (demo || mode !== "busca") return;
    if (isCustom && customQuery.trim().length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setCountingAvail(true);
      try {
        const qs = new URLSearchParams({
          category,
          lat: String(center.lat),
          lng: String(center.lng),
          radiusM: String(Math.round(radiusKm * 1000)),
        });
        if (isCustom && customQuery.trim()) qs.set("q", customQuery.trim());
        const r = await fetch(`/api/radar/count?${qs.toString()}`, { cache: "no-store", signal: ac.signal });
        if (r.ok && !ac.signal.aborted) {
          const data = (await r.json()) as Availability;
          setAvailability(data);
        }
      } catch {
        /* cancelado ou erro transitório */
      } finally {
        if (!ac.signal.aborted) setCountingAvail(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [demo, mode, category, customQuery, isCustom, center.lat, center.lng, radiusKm]);

  const ceilingMax = availability
    ? availability.maxLimit
    : Math.max(MIN_LIMIT, Math.min(MAX_LIMIT_CEILING, info?.total || MAX_LIMIT_CEILING));
  const effectiveLimit = Math.max(MIN_LIMIT, Math.min(desiredLimit, ceilingMax));

  const loadResults = useCallback(async (id: string, signal?: AbortSignal): Promise<Results | undefined> => {
    const r = await fetch(`/api/radar/${id}`, { cache: "no-store", signal });
    if (!r.ok) throw new Error(`Falha ao carregar resultados (HTTP ${r.status}).`);
    const j = (await r.json()) as Results;
    if (signal?.aborted || activeSearchRef.current !== id) return;
    setPlaces(j.places);
    setPendingAudits(j.pending);
    setFailedAudits(j.failed ?? j.places.filter((p) => p.auditStatus === "error").length);
    setHasMore(Boolean(j.hasMore));
    return j;
  }, []);

  // abre uma busca salva (?busca=)
  useEffect(() => {
    if (!initialSearchId || demo) return;
    const ac = new AbortController();
    let alive = true;
    fetch(`/api/radar/${initialSearchId}`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Results>) : null))
      .then((j) => {
        if (!alive || ac.signal.aborted || !j) return;
        setPlaces(j.places);
        setPendingAudits(j.pending);
        setFailedAudits(j.failed ?? j.places.filter((p) => p.auditStatus === "error").length);
        setHasMore(Boolean(j.hasMore));
        if (j.search) {
          const c = { lat: Number(j.search.lat), lng: Number(j.search.lng) };
          setCenter(c);
          setPanTarget(c);
          setRadiusKm(Math.round(j.search.radius_m / 100) / 10);
          if (j.search.category.startsWith("q:")) {
            setCategory("personalizado");
            setCustomQuery(j.search.category.slice(2));
          } else {
            setCategory(j.search.category);
            setCustomQuery("");
          }
          setCityId(CITIES.find((x) => Math.abs(x.lat - c.lat) < 0.001 && Math.abs(x.lng - c.lng) < 0.001)?.id ?? "mapa");
          if (j.search.created_at) setSearchedAt(new Date(j.search.created_at));
        }
      })
      .catch((e) => {
        if (!alive || ac.signal.aborted) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setMessage("Não foi possível carregar os resultados desta busca.");
      });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [initialSearchId, demo]);

  // enquanto houver análise pendente: roda um lote por vez com backoff, tratamento de erro e cancelamento
  useEffect(() => {
    if (demo || !searchId || pendingAudits === 0) return;
    const ac = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    const tick = async () => {
      if (!active || ac.signal.aborted) return;
      try {
        if (!processing.current) {
          processing.current = true;
          try {
            const procRes = await fetch("/api/audits/process", { method: "POST", signal: ac.signal });
            if (!procRes.ok) throw new Error(`HTTP ${procRes.status}`);
          } finally {
            processing.current = false;
          }
        }
        await loadResults(searchId, ac.signal);
        if (!active || ac.signal.aborted) return;
        consecutiveErrors = 0;
        setPollError(null);
      } catch (e) {
        if (!active || ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        consecutiveErrors++;
        const nextDelay = nextPollDelayMs(consecutiveErrors);
        if (nextDelay == null) {
          setPollError("Análise automática pausada após erros seguidos.");
          return;
        }
        setPollError("Falha ao atualizar análises. Tentando novamente…");
      }

      if (!active || ac.signal.aborted) return;
      const delay = nextPollDelayMs(consecutiveErrors);
      if (delay != null) {
        timer = setTimeout(tick, delay);
      }
    };

    timer = setTimeout(tick, 3000);
    return () => {
      active = false;
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [searchId, pendingAudits, loadResults, demo, pollGeneration]);

  const runSearch = () =>
    startSearch(async () => {
      setMessage(null);
      setPollError(null);
      setSelectedId(null);
      setFocusTarget(null);
      const label = `${segmentLabel} · ${placeLabel} · ${fmtKm(radiusKm)}`;
      const out = await searchAction({
        category,
        query: isCustom ? customQuery.trim() : undefined,
        lat: center.lat,
        lng: center.lng,
        radiusM: radiusKm * 1000,
        limit: effectiveLimit,
        label,
      });
      if (!out.ok) {
        setMessage(out.error);
        return;
      }
      const d = out.discarded;
      const removed = d.franquia + d.fechado + d.duplicado;
      setMessage(
        (out.partial ? `Exibindo até ${effectiveLimit} resultados mais próximos (há mais disponíveis na área — use “Carregar mais”). ` : "") +
          (removed ? `${removed} descartados (${d.franquia} redes/franquias, ${d.duplicado} duplicados).` : ""),
      );
      activeSearchRef.current = out.searchId;
      setSearchId(out.searchId);
      setSearchedAt(new Date());
      setMode("resultados");
      setMobileView("dividido");
      setFilter("todos");
      window.history.replaceState(null, "", `/radar?busca=${out.searchId}`);
      await loadResults(out.searchId).catch(() => setMessage("Busca salva, mas falhou ao carregar os resultados."));
    });

  const stats = useMemo(() => {
    const active = places.filter((p) => !isHiddenFromQueue(p));
    const semSite = active.filter((p) => p.siteType === "sem_site" || p.siteType === "so_rede_social").length;
    const prioritarios = active.filter((p) => isPriorityLead(p)).length;
    const comContato = active.filter((p) => contactCapabilities(p).hasUsableContact).length;
    const noCrm = active.filter((p) => Boolean(p.leadId)).length;
    const ignorados = places.length - active.length;
    return { semSite, prioritarios, comContato, noCrm, ignorados, activeTotal: active.length };
  }, [places]);

  const queue = useMemo(() => buildProspectQueue(places, { offer, limit: 4 }), [places, offer]);

  const visible = useMemo(() => {
    const list = places.filter((p) => {
      const hidden = isHiddenFromQueue(p);
      if (filter === "ignorados") return hidden;
      if (hidden) return false;
      if (filter === "prioritarios") return isPriorityLead(p);
      if (filter === "com_contato") return contactCapabilities(p).hasUsableContact;
      if (filter === "sem_site") return p.siteType === "sem_site" || p.siteType === "so_rede_social";
      if (filter === "no_crm") return Boolean(p.leadId);
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortBy === "contato") {
        return contactRank(b) - contactRank(a) || (b.score ?? -1) - (a.score ?? -1);
      }
      if (sortBy === "distancia") {
        return distanceM(center, { lat: a.lat, lng: a.lng }) - distanceM(center, { lat: b.lat, lng: b.lng });
      }
      // "oportunidade": combina contato útil + Lead Score para que leads acionáveis fiquem no topo
      const aBoost = (contactRank(a) > 0 ? 15 : 0) + (a.score ?? -1);
      const bBoost = (contactRank(b) > 0 ? 15 : 0) + (b.score ?? -1);
      return bBoost - aBoost;
    });
  }, [places, filter, sortBy, center]);

  const hotNotInCrm = places.filter((p) => !isHiddenFromQueue(p) && isPriorityLead(p) && !p.leadId);
  const next = visible.find((p) => isNextApproachable(p));

  const selectFromList = (id: string) => {
    setSelectedId(id);
    const p = places.find((x) => x.id === id);
    if (p) setFocusTarget({ lat: p.lat, lng: p.lng });
  };

  const selectFromMap = (id: string) => {
    setSelectedId(id);
    const el = itemRefs.current.get(id);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const approachPlace = (placeId: string) =>
    startApproach(async () => {
      if (demo) return;
      const r = await openInStudioAction(placeId, offer);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      const qs = new URLSearchParams({ empresa: r.data.companyId, oportunidade: r.data.dealId });
      if (r.data.serviceType) qs.set("servico", r.data.serviceType);
      router.push(`/mensagens?${qs.toString()}`);
    });

  const approach = () => {
    if (next) approachPlace(next.id);
  };

  const handleProspect = async (placeId: string, action: "ignorar" | "adiar" | "contatado" | "restaurar") => {
    if (demo) return;
    const r = await prospectStateAction(
      placeId,
      action === "adiar" ? { action: "adiar", days: 7 } : action === "contatado" ? { action: "contatado", offer } : { action },
    );
    if (!r.ok) {
      setMessage(r.error);
      return;
    }
    if (searchId) await loadResults(searchId).catch(() => {});
  };

  const chip = `${segmentPlural} · ${placeLabel === "ponto no mapa" ? "ponto no mapa" : `${placeLabel}, GO`} · ${fmtKm(radiusKm)}`;
  const ChipIcon = CATEGORY_ICON[category] ?? Radar;

  const mapBoxClass = desktop
    ? "absolute inset-0"
    : mobileView === "mapa"
      ? "absolute inset-0"
      : mobileView === "lista"
        ? "hidden"
        : "absolute inset-x-0 top-0 h-[40%]";

  const panelClass = desktop
    ? "absolute bottom-4 left-4 top-4 z-20 flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-float)]"
    : mobileView === "mapa"
      ? "hidden"
      : mobileView === "lista"
        ? "absolute inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-hidden bg-surface"
        : "absolute inset-x-0 bottom-0 top-[37%] z-20 flex flex-col overflow-hidden rounded-t-[24px] border-t border-line bg-surface shadow-[var(--shadow-float)]";

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* mapa do OpenStreetMap */}
      <div className={mapBoxClass}>
        <RadarMap
          center={center}
          panTarget={panTarget}
          focusTarget={focusTarget}
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
          onSelect={selectFromMap}
        />
      </div>

      {/* resumo da busca sobre o mapa */}
      <div
        className={`pointer-events-none absolute top-3 z-10 -translate-x-1/2 transition-opacity ${selectedId && desktop ? "opacity-0" : ""}`}
        style={{ left: desktop ? `calc(${PANEL_W + 16}px + (100% - ${PANEL_W + 16}px) / 2)` : "50%" }}
      >
        <div className="flex max-w-[82vw] items-center gap-2 truncate rounded-full bg-[#0f1f17]/88 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur sm:text-sm">
          <ChipIcon className="h-4 w-4 shrink-0 text-[#38d385]" aria-hidden />
          <span className="truncate">{chip}</span>
        </div>
      </div>

      {/* controle rápido no celular: alternar Dividido / Lista / Mapa */}
      {!desktop && (
        <div className="fixed bottom-3 right-3 z-30 flex rounded-full border border-line bg-surface/95 p-1 shadow-[var(--shadow-float)] backdrop-blur" role="group" aria-label="Modo de visualização">
          {(
            [
              ["dividido", "Dividido", Sparkles],
              ["lista", "Lista", List],
              ["mapa", "Mapa", MapIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileView(id)}
              aria-pressed={mobileView === id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${mobileView === id ? "bg-brand text-brand-on" : "text-muted hover:text-fg"}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* painel flutuante (desktop) ou folha/lista (celular) */}
      <aside aria-label={mode === "busca" ? "Buscar clientes" : "Resultados"} className={panelClass} style={desktop ? { width: PANEL_W } : undefined}>
        {mode === "busca" ? (
          <SearchView
            offer={offer}
            onOffer={(o) => {
              setOffer(o);
              writeLocal(OFFER_KEY, o);
              const matchedCard = OFFER_CARDS.find((c) => c.id === o);
              if (matchedCard) {
                setTicket(matchedCard.ticket);
                writeLocal(TICKET_KEY, String(matchedCard.ticket));
              }
            }}
            category={category}
            customQuery={customQuery}
            onCategory={(id, custom) => {
              setCategory(id);
              setCustomQuery(custom ?? "");
            }}
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
            limit={effectiveLimit}
            maxLimit={ceilingMax}
            available={availability?.available ?? null}
            countingAvail={countingAvail}
            onLimit={(v) => {
              const clamped = Math.max(MIN_LIMIT, Math.min(ceilingMax, Math.round(v)));
              setDesiredLimit(clamped);
              writeLocal(LIMIT_KEY, String(clamped));
            }}
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
                    ? `Base aberta · ${info.total.toLocaleString("pt-BR")} negócios${info.release ? ` (Overture ${info.release})` : ""}`
                    : "A base aberta ainda está vazia: atualize em Configurações → Sistema"
                  : "Carregando a base…"
            }
          />
        ) : (
          <ResultsView
            places={visible}
            queue={queue}
            center={center}
            total={places.length}
            stats={stats}
            ticket={ticket}
            onTicket={(v) => {
              setTicket(v);
              writeLocal(TICKET_KEY, String(v));
            }}
            pending={pendingAudits}
            failed={failedAudits}
            pollError={pollError}
            retryingAudits={retryingAudits}
            onRetryAudits={() => {
              if (!searchId || demo) return;
              startRetryAudits(async () => {
                const failedIds = places.filter((p) => p.auditStatus === "error").map((p) => p.id);
                if (failedIds.length > 0) {
                  const r = await retryAuditsAction(failedIds);
                  if (!r.ok) {
                    setMessage(r.error);
                    return;
                  }
                }
                setPollError(null);
                setPollGeneration((g) => g + 1);
                await loadResults(searchId).catch(() => {});
              });
            }}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => {
              if (!searchId || demo) return;
              startLoadMore(async () => {
                const r = await loadMoreRadarAction(searchId);
                if (!r.ok) {
                  setMessage(r.error);
                  return;
                }
                setMessage(r.data.added > 0 ? `${r.data.added} novos lugares carregados.` : "Não há mais lugares novos nesta área.");
                await loadResults(searchId).catch(() => {});
              });
            }}
            filter={filter}
            onFilter={setFilter}
            sortBy={sortBy}
            onSort={setSortBy}
            selectedId={selectedId}
            onSelect={selectFromList}
            registerItemRef={(id, el) => {
              if (el) itemRefs.current.set(id, el);
              else itemRefs.current.delete(id);
            }}
            category={isCustom && customQuery.trim() ? `q:${customQuery.trim()}` : category}
            placeLabel={placeLabel}
            radiusKm={radiusKm}
            searchedAt={searchedAt}
            message={message}
            hotCount={hotNotInCrm.length}
            onAddHot={async () => {
              if (demo) return;
              const r = await addPlaceToCrmAction(hotNotInCrm.map((p) => p.id));
              setMessage(r.ok ? `${r.data.created} leads prioritários adicionados ao CRM${r.data.existing ? ` (${r.data.existing} já estavam)` : ""}.` : r.error);
              if (searchId) await loadResults(searchId).catch(() => {});
            }}
            canApproach={!!next && !demo}
            approaching={approaching}
            onApproach={approach}
            onApproachPlace={approachPlace}
            onProspect={handleProspect}
            demo={!!demo}
            onBack={() => {
              setMode("busca");
              setSelectedId(null);
              setFocusTarget(null);
            }}
          />
        )}
      </aside>

      {/* ficha do negócio */}
      {selectedId && (
        <div
          className={
            desktop
              ? "absolute bottom-4 right-4 top-4 z-30 overflow-hidden rounded-[24px] border border-line shadow-[var(--shadow-float)]"
              : "fixed inset-0 z-40"
          }
          style={desktop ? { width: PANEL_W } : undefined}
        >
          <LeadPanel
            key={selectedId}
            placeId={selectedId}
            center={center}
            offer={offer}
            demo={demo?.places.find((p) => p.id === selectedId)}
            onClose={() => setSelectedId(null)}
            onChanged={() => searchId && !demo && void loadResults(searchId).catch(() => {})}
          />
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">
      {children}
    </label>
  );
}

// ---------------- Busca ----------------

function SearchView(props: {
  offer: OfferCardId;
  onOffer: (o: OfferCardId) => void;
  category: string;
  customQuery: string;
  onCategory: (c: string, custom?: string) => void;
  cityId: string;
  onCity: (id: string) => void;
  radiusKm: number;
  onRadius: (v: number) => void;
  limit: number;
  maxLimit: number;
  available: number | null;
  countingAvail: boolean;
  onLimit: (v: number) => void;
  recent: Recent[];
  searching: boolean;
  disabled: boolean;
  onSearch: () => void;
  message: string | null;
  footnote: string;
}) {
  const [showAllCats, setShowAllCats] = useState(false);
  const cat = getCategory(props.category);
  const isCustom = props.category === "personalizado";
  const city = CITIES.find((c) => c.id === props.cityId);
  const chipCategories = showAllCats ? CATEGORIES : FEATURED_CATEGORIES;
  const activeValue = isCustom ? props.customQuery : (cat?.label ?? "");
  const limitPresets = useMemo(() => {
    const base = LIMIT_PRESETS.filter((n) => n < props.maxLimit);
    return [...base, props.maxLimit];
  }, [props.maxLimit]);

  const noResultsFound = props.available === 0;
  const canSearch = !props.searching && !props.disabled && (!isCustom || props.customQuery.trim().length >= 2) && !noResultsFound;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-6 sm:px-6">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[28px] leading-none">Encontre clientes</h1>
          <span className="eyebrow text-brand">MGLABS Radar</span>
        </div>

        {/* Você vende — exatamente 2 opções */}
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
                  className={`group rounded-2xl p-3.5 text-left transition ${
                    on
                      ? "bg-brand text-brand-on shadow-[0_12px_26px_-12px_var(--brand)] ring-1 ring-brand"
                      : "border border-line bg-elevated hover:border-line-strong hover:bg-surface"
                  }`}
                >
                  <span
                    className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      on ? "bg-white/18 text-brand-on" : "bg-brand-soft text-brand group-hover:bg-brand/15"
                    }`}
                  >
                    <o.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="block text-[15px] font-semibold leading-tight">{o.label}</span>
                  <span className={`mt-1 block text-xs leading-snug ${on ? "text-brand-on/85" : "text-muted"}`}>{o.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Para quem — busca inteligente + chips rápidos + segmento livre */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="radar-para-quem" className="block text-xs font-medium uppercase tracking-wider text-muted">
              Para quem
            </label>
            <button
              type="button"
              onClick={() => setShowAllCats((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              {showAllCats ? "Menos segmentos" : `Todos (${CATEGORIES.length})`}
              {showAllCats ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
          <CategoryCombo
            id="radar-para-quem"
            icon={cat ? CATEGORY_ICON[cat.id] ?? Search : Search}
            value={activeValue}
            onPickCategory={(id) => props.onCategory(id)}
            onPickCustom={(term) => props.onCategory("personalizado", term)}
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {chipCategories.map((c) => {
              const Icon = CATEGORY_ICON[c.id];
              const on = props.category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => props.onCategory(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-[13px] ${
                    on ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-fg/85 hover:border-line-strong"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                  {c.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Onde + Raio */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="sm:col-span-2">
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
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <Crosshair className="h-3.5 w-3.5" aria-hidden /> ou clique no mapa para mover o centro
            </p>
          </section>
        </div>

        <section>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Raio</span>
            <span className="font-heading text-[20px] leading-none tabular-nums">{fmtKm(props.radiusKm)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={props.radiusKm}
            onChange={(e) => props.onRadius(Number(e.target.value))}
            className="w-full accent-[var(--brand)]"
            aria-label="Raio da busca em km"
          />
          <div className="mt-1.5 flex gap-1.5">
            {RADIUS_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => props.onRadius(r)}
                className={`flex-1 rounded-lg border py-1 text-xs tabular-nums transition ${
                  props.radiusKm === r ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-muted hover:text-fg"
                }`}
              >
                {r} km
              </button>
            ))}
          </div>
        </section>

        {/* Quantas empresas buscar (5 até o máximo disponível) */}
        <section className="rounded-2xl border border-line bg-background p-3.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Empresas por busca</span>
            <span className="font-heading text-[20px] leading-none tabular-nums text-fg">
              {props.limit} <span className="font-sans text-xs font-normal text-muted">/ máx. {props.maxLimit}</span>
            </span>
          </div>
          <input
            type="range"
            min={MIN_LIMIT}
            max={props.maxLimit}
            step={props.maxLimit <= 35 ? 1 : 5}
            value={props.limit}
            disabled={noResultsFound || props.maxLimit <= MIN_LIMIT}
            onChange={(e) => props.onLimit(Number(e.target.value))}
            className="w-full accent-[var(--brand)] disabled:opacity-40"
            aria-label="Quantidade de empresas a buscar"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {limitPresets.map((n) => {
              const on = props.limit === n;
              const isMax = n === props.maxLimit && !LIMIT_PRESETS.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={noResultsFound}
                  onClick={() => props.onLimit(n)}
                  className={`rounded-lg border px-2.5 py-1 text-xs tabular-nums transition disabled:opacity-40 ${
                    on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {isMax ? `Máx (${n})` : n}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            {props.countingAvail ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Contando negócios na área…
              </>
            ) : props.available == null ? (
              "Mínimo de 5 até o máximo disponível na base aberta"
            ) : props.available === 0 ? (
              <span className="text-warn">Nenhuma empresa encontrada nessa área — aumente o raio ou troque o segmento.</span>
            ) : props.available > MAX_LIMIT_CEILING ? (
              `${props.available.toLocaleString("pt-BR")} na região · limite por lote de ${MAX_LIMIT_CEILING} (com “Carregar mais” depois)`
            ) : (
              `${props.available.toLocaleString("pt-BR")} disponíveis nessa região e segmento`
            )}
          </p>
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
                    <span className="truncate">{r.label ?? categoryLabel(r.category)}</span>
                    <span className="shrink-0 tabular-nums text-muted">{r.results}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="space-y-2 border-t border-line bg-surface px-5 py-4 sm:px-6">
        {props.message && <p className="text-xs text-danger">{props.message}</p>}
        <button
          type="button"
          onClick={props.onSearch}
          disabled={!canSearch}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-[15px] font-semibold text-brand-on shadow-[0_12px_28px_-12px_var(--brand)] transition hover:bg-brand-hover disabled:opacity-55"
        >
          {props.searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radar className="h-5 w-5" aria-hidden />}
          {props.searching
            ? "Varrendo o mapa…"
            : `Buscar até ${props.limit} ${isCustom ? (props.customQuery.trim() || "empresas") : (cat?.plural ?? "clientes")}`}
        </button>
        <p className="text-center text-xs text-muted">{props.footnote}</p>
      </footer>
    </>
  );
}

/** Busca inteligente de segmentos: casa rótulos, sinônimos e permite segmento livre. */
function CategoryCombo({
  id,
  icon: Icon,
  value,
  onPickCategory,
  onPickCustom,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onPickCategory: (id: string) => void;
  onPickCustom: (term: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const matches = useMemo(() => searchCategories(q), [q]);
  const trimmed = q.trim();
  const showCustom = trimmed.length >= 2 && !matches.some((m) => m.label.toLowerCase() === trimmed.toLowerCase());

  type OptItem = { kind: "cat"; id: string; label: string; hint: string } | { kind: "custom"; term: string; label: string; hint: string };
  const items: OptItem[] = useMemo(() => {
    const base: OptItem[] = matches.map((c) => ({
      kind: "cat",
      id: c.id,
      label: c.label,
      hint: c.keywords.slice(0, 2).join(", "),
    }));
    if (showCustom) {
      base.push({ kind: "custom", term: trimmed, label: `Buscar “${trimmed}” na base`, hint: "segmento livre" });
    }
    return base;
  }, [matches, showCustom, trimmed]);

  const pick = (item: OptItem) => {
    if (item.kind === "cat") onPickCategory(item.id);
    else onPickCustom(item.term);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2.5 rounded-xl border bg-surface px-3.5 transition ${open ? "border-brand shadow-[0_0_0_3px_var(--brand-soft)]" : "border-line hover:border-line-strong"}`}>
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? q : value}
          placeholder={open ? value || "Barbearia, dentista, pet shop, óptica…" : "Barbearia, dentista, pet shop, óptica…"}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, items.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              pick(items[active]);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80 focus-visible:outline-none"
        />
        {open && q && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} aria-label="Limpar busca" className="rounded p-1 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <ul id={`${id}-lista`} role="listbox" className="fade-in absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-float)]">
          {items.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">Digite pelo menos 2 letras para buscar por qualquer nicho.</li>
          )}
          {items.map((o, i) => (
            <li key={o.kind === "cat" ? o.id : `custom-${o.term}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-brand-soft text-fg" : ""}`}
              >
                <span className="truncate font-medium">{o.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  <span className="hidden sm:inline">{o.hint}</span>
                  {o.kind === "cat" && value === o.label && <Check className="h-3.5 w-3.5 text-brand" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Campo com sugestões (cidade). */
function Combo({ id, icon: Icon, placeholder, value, options, onPick, clearable }: { id: string; icon: React.ComponentType<{ className?: string }>; placeholder: string; value: string; options: { id: string; label: string; hint?: string }[]; onPick: (id: string) => void; clearable: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = options.filter((o) => !q || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (o: { id: string }) => {
    onPick(o.id);
    setQ("");
    setOpen(false);
  };
  return (
    <div className="relative">
      <div className={`flex items-center gap-2.5 rounded-xl border bg-surface px-3.5 transition ${open ? "border-brand shadow-[0_0_0_3px_var(--brand-soft)]" : "border-line hover:border-line-strong"}`}>
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
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
              setActive((a) => Math.min(a + 1, Math.max(0, list.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              pick(list[active]);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80 focus-visible:outline-none"
        />
        {clearable && value && <X className="h-4 w-4 text-muted" />}
      </div>
      {open && (
        <ul id={`${id}-lista`} role="listbox" className="fade-in absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-float)]">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nada encontrado.</li>}
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
  queue: QueueItem[];
  center: LatLng;
  total: number;
  stats: { semSite: number; prioritarios: number; comContato: number; noCrm: number; ignorados: number; activeTotal: number };
  ticket: number;
  onTicket: (v: number) => void;
  pending: number;
  failed: number;
  pollError: string | null;
  retryingAudits: boolean;
  onRetryAudits: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  sortBy: SortBy;
  onSort: (s: SortBy) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  registerItemRef: (id: string, el: HTMLElement | null) => void;
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
  onApproachPlace: (id: string) => void;
  onProspect: (id: string, action: "ignorar" | "adiar" | "contatado" | "restaurar") => Promise<void>;
  demo: boolean;
  onBack: () => void;
}) {
  const { places, queue, total, stats, ticket, pending, failed } = props;
  const now = useNow();
  const [editingTicket, setEditingTicket] = useState(false);
  const cat = getCategory(props.category);
  const CatIcon = CATEGORY_ICON[props.category] ?? Radar;
  const analyzed = total - pending;
  const pct = total ? Math.round((analyzed / total) * 100) : 0;
  const filters: [Filter, string, number][] = [
    ["todos", "Todos", stats.activeTotal],
    ["com_contato", "Com contato", stats.comContato],
    ["prioritarios", "Prioritários", stats.prioritarios],
    ["sem_site", "Site ausente", stats.semSite],
    ["no_crm", "No CRM", stats.noCrm],
    ...(stats.ignorados > 0 ? ([["ignorados", "Ignorados/Adiados", stats.ignorados]] as [Filter, string, number][]) : []),
  ];
  const when = props.searchedAt
    ? now - props.searchedAt.getTime() < 90_000
      ? "agora"
      : relativeDays(props.searchedAt) === "hoje"
        ? `há ${Math.max(1, Math.round((now - props.searchedAt.getTime()) / 60_000))} min`
        : relativeDays(props.searchedAt)
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-4 px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={props.onBack} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Nova busca
          </button>
          <select
            aria-label="Ordenar resultados"
            value={props.sortBy}
            onChange={(e) => props.onSort(e.target.value as SortBy)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-fg"
          >
            <option value="oportunidade">Ordenar: melhor oportunidade</option>
            <option value="contato">Ordenar: contato útil</option>
            <option value="distancia">Ordenar: mais perto</option>
          </select>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted sm:text-sm">
            <CatIcon className="h-4 w-4 text-brand" aria-hidden />
            {props.placeLabel} · {fmtKm(props.radiusKm)}
            {when && <span>· {when}</span>}
          </p>
          <h1 className="mt-1 text-[30px] leading-[1.08]">
            {total} {total === 1 ? categoryLabel(props.category).toLowerCase() : (cat?.plural ?? categoryLabel(props.category).toLowerCase())}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {stats.comContato} com contato útil · {stats.prioritarios} {stats.prioritarios === 1 ? "prioritário" : "prioritários"}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-background p-3.5">
          <div className="text-xs font-medium text-muted">Potencial bruto hipotético (100% de conversão)</div>
          <div className="mt-1 font-heading text-[26px] leading-none tabular-nums">{brl.format(stats.comContato * ticket)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            {stats.comContato} com contato × {""}
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
                {brl.format(ticket)} (não é previsão de faturamento)
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
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-[15px] font-semibold text-brand-on shadow-[0_12px_28px_-12px_var(--brand)] transition hover:bg-brand-hover disabled:opacity-50"
          title="Abre o próximo negócio prioritário com contato no Estúdio de Mensagens"
        >
          {props.approaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" aria-hidden />}
          Abordar próximo lead
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

        {(props.pollError || failed > 0) && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs">
            <span className="text-warn">
              {props.pollError ?? `${failed} ${failed === 1 ? "site falhou na auditoria" : "sites falharam na auditoria"}.`}
            </span>
            <button type="button" disabled={props.retryingAudits} onClick={props.onRetryAudits} className="shrink-0 font-medium text-brand hover:underline disabled:opacity-50">
              {props.retryingAudits ? "Tentando…" : "Tentar novamente"}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map(([v, l, n]) => (
            <button
              key={v}
              type="button"
              aria-pressed={props.filter === v}
              onClick={() => props.onFilter(v)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                props.filter === v ? "border-fg bg-fg text-background" : "border-line text-muted hover:text-fg"
              }`}
            >
              {l} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
          {props.hotCount > 0 && (
            <button type="button" onClick={props.onAddHot} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              <Flame className="h-3.5 w-3.5" aria-hidden /> {props.hotCount} prioritários → CRM
            </button>
          )}
        </div>
        {props.message && <p className="text-xs text-muted">{props.message}</p>}

        {queue.length > 0 && props.filter !== "ignorados" && (
          <div className="rounded-2xl border border-brand/20 bg-brand-soft/45 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-brand">
              <span>Fila inteligente do dia</span>
              <span className="text-muted">{queue.length} sugeridos</span>
            </div>
            <ul className="space-y-2">
              {queue.map((item) => (
                <li key={item.place.id} className="rounded-xl border border-line bg-surface p-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => props.onSelect(item.place.id)} className="min-w-0 text-left hover:underline">
                      <span className="block truncate font-semibold text-fg">{item.place.name}</span>
                      <span className="block truncate text-muted">{item.reasons.join(" · ")}</span>
                    </button>
                    <span className="shrink-0 font-mono font-semibold text-brand">{item.place.score}</span>
                  </div>
                  {!props.demo && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={props.approaching}
                        onClick={() => props.onApproachPlace(item.place.id)}
                        className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-brand-on hover:bg-brand-hover disabled:opacity-50"
                      >
                        Preparar msg
                      </button>
                      <button type="button" onClick={() => void props.onProspect(item.place.id, "contatado")} className="rounded-md border border-line px-2 py-1 text-[11px] text-fg hover:bg-background">
                        Já contatei
                      </button>
                      <button type="button" onClick={() => void props.onProspect(item.place.id, "adiar")} className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-fg">
                        Adiar 7d
                      </button>
                      <button type="button" onClick={() => void props.onProspect(item.place.id, "ignorar")} className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-danger">
                        Ignorar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ul className="space-y-1.5 px-3 pb-16 md:pb-3">
        {places.map((p) => {
          const dist = distanceM(props.center, { lat: p.lat, lng: p.lng });
          const sel = props.selectedId === p.id;
          const cap = contactCapabilities(p);
          const status = deriveApproachStatus(p);
          return (
            <li
              key={p.id}
              ref={(el) => props.registerItemRef(p.id, el)}
              className={`rounded-2xl border p-3 transition ${sel ? "border-brand/40 bg-brand-soft" : "border-transparent hover:border-line hover:bg-background"}`}
            >
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => props.onSelect(p.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-semibold text-fg">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {p.rating != null ? (
                      <Stars rating={p.rating} count={p.ratingCount} />
                    ) : p.confidence != null ? (
                      `Confiança ${Math.round(p.confidence * 100)}%${p.sourceCount ? ` · ${p.sourceCount} ${p.sourceCount === 1 ? "fonte" : "fontes"}` : ""}`
                    ) : (
                      "Dados abertos"
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {categoryLabel(p.category)} · {p.neighborhood ?? p.city ?? "—"} · {km(dist)}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {status !== "nao_abordado" && (
                      <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand">
                        {APPROACH_STATUS_LABEL[status]}
                      </span>
                    )}
                    {badgesFor(p).slice(0, 2).map((b) => (
                      <span key={b.label} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-muted">
                        {b.label}
                      </span>
                    ))}
                    {cap.hasConfirmedWhatsapp ? (
                      <span className="rounded-full border border-brand/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-brand">WhatsApp confirmado</span>
                    ) : cap.hasMobile ? (
                      <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg/80">Celular útil</span>
                    ) : cap.hasUsableContact ? (
                      <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-muted">Telefone / canal</span>
                    ) : (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted/75">Sem contato</span>
                    )}
                  </span>
                </button>
                <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                  <ScoreRing score={p.score} size={42} />
                  {!props.demo && cap.hasUsableContact && !isHiddenFromQueue(p) && (
                    <button
                      type="button"
                      disabled={props.approaching}
                      onClick={() => props.onApproachPlace(p.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-surface px-2 py-1 text-[11px] font-medium text-brand hover:bg-brand hover:text-brand-on disabled:opacity-50"
                      title="Abrir no Estúdio de Mensagens com oferta selecionada"
                    >
                      <MessageSquareText className="h-3 w-3" aria-hidden /> Msg
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {places.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhum negócio neste filtro.</li>}
      </ul>
      {props.hasMore && (
        <div className="px-6 pb-4">
          <button type="button" disabled={props.loadingMore} onClick={props.onLoadMore} className="btn btn-ghost w-full justify-center">
            {props.loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {props.loadingMore ? "Carregando mais resultados…" : "Carregar mais resultados"}
          </button>
        </div>
      )}
      <p className="border-t border-line px-6 py-3 text-[11px] text-muted">Lugares: Overture Maps (dados abertos) · Mapa: © colaboradores do OpenStreetMap</p>
    </div>
  );
}

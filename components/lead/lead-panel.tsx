"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  addActivityAction,
  addToCrmAction,
  generateMessageAction,
  leadDetailAction,
  markSentAction,
  optOutAction,
} from "@/app/actions";
import { AtSign, ExternalLink, Globe, Loader2, Mail, MessageCircle, Phone, Share2, Wand2, type LucideIcon } from "lucide-react";

import { badgesFor, TONE_CLASS } from "@/components/lead/badges";
import { ScoreBadge, Stars } from "@/components/radar/ui";
import { getCategory } from "@/lib/config/categories";
import { parseBrPhone, waLink } from "@/lib/phone";
import { STAGES, type Activity, type Contact, type RadarPlace } from "@/lib/types";

const OFFERS = [
  ["site", "Site"],
  ["agendamento", "Agendamento online"],
  ["landing", "Landing page"],
  ["automacao_whatsapp", "Automação de WhatsApp"],
] as const;
const TONES = [
  ["amigavel", "Amigável"],
  ["direto", "Direto"],
  ["formal", "Formal"],
] as const;

const SOURCE_LABEL: Record<Contact["source"], string> = { site_empresa: "site da empresa", google_places: "Google", overture: "Overture (dados abertos)", manual: "manual" };
const KIND_LABEL: Record<Contact["kind"], string> = {
  whatsapp: "WhatsApp",
  phone: "Telefone",
  email: "E-mail",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
};

type Channel = "whatsapp" | "ligacao" | "email" | "instagram";

const KIND_ICON: Record<Contact["kind"], LucideIcon> = {
  whatsapp: MessageCircle,
  phone: Phone,
  email: Mail,
  instagram: AtSign,
  facebook: Share2,
  site: Globe,
};
const KIND_COLOR: Record<Contact["kind"], string> = {
  whatsapp: "text-emerald-400",
  phone: "text-sky-300",
  email: "text-amber-300",
  instagram: "text-pink-300",
  facebook: "text-blue-300",
  site: "text-sky-300",
};
const BLOCK_TITLE: Record<string, string> = {
  A: "Oportunidade digital",
  B: "Saúde do negócio",
  C: "Encaixe com a oferta",
  D: "Contato possível",
};
const SELECT = "w-full rounded-xl bg-white/[0.04] px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-sky-500/60";
const GHOST = "flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] py-2 text-sm ring-1 ring-white/10 hover:bg-white/[0.08]";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">{children}</h3>;
}

export function LeadPanel({
  placeId,
  onClose,
  onChanged,
  defaultOffer = "site",
  demo,
}: {
  placeId: string;
  onClose: () => void;
  onChanged?: () => void;
  defaultOffer?: (typeof OFFERS)[number][0];
  /** Modo demonstração: mostra este lugar sem chamar o servidor. */
  demo?: RadarPlace;
}) {
  const [place, setPlace] = useState<RadarPlace | null>(demo ?? null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<(typeof OFFERS)[number][0]>(defaultOffer);
  const [tone, setTone] = useState<(typeof TONES)[number][0]>("amigavel");
  const [text, setText] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState<Channel | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await leadDetailAction(placeId);
    if (r.ok) {
      setPlace(r.data.place);
      setActivities(r.data.activities);
      setError(null);
    } else setError(r.error);
  }, [placeId]);

  // o pai usa key={placeId}: trocar de lead monta um painel novo, com estado limpo
  useEffect(() => {
    if (demo) return;
    let alive = true;
    leadDetailAction(placeId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setPlace(r.data.place);
        setActivities(r.data.activities);
      } else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [placeId, demo]);

  if (error && !place) return <Shell onClose={onClose}><p className="text-sm text-red-300">{error}</p></Shell>;
  if (!place) return <Shell onClose={onClose}><p className="text-sm text-white/50">Carregando…</p></Shell>;

  const cat = getCategory(place.category ?? "");
  const wa =
    place.contacts.find((c) => c.kind === "whatsapp" && c.confirmed) ??
    place.contacts.find((c) => c.kind === "whatsapp") ??
    place.contacts.find((c) => c.kind === "phone" && parseBrPhone(c.value)?.mobile);
  const waPhone = wa ? parseBrPhone(wa.value) : null;
  const landline = place.contacts.find((c) => c.kind === "phone" && !parseBrPhone(c.value)?.mobile);
  const email = place.contacts.find((c) => c.kind === "email");
  const insta = place.contacts.find((c) => c.kind === "instagram");
  const blocked = place.optedOut;

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const confirmSent = (channel: Channel) =>
    start(async () => {
      const r = await markSentAction(place.id, channel, text);
      if (!r.ok) setError(r.error);
      setAwaitingConfirm(null);
      await refresh();
    });

  return (
    <Shell onClose={onClose}>
      <div className="space-y-5">
        <header>
          <div className="flex items-start gap-3 pr-6">
            <ScoreBadge score={place.score} size="lg" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{place.name}</h2>
              <p className="text-sm text-white/55">
                {cat?.label ?? place.category}
                {place.neighborhood ? ` · ${place.neighborhood}` : ""}
                {place.city ? ` · ${place.city}` : ""}
              </p>
              <p className="truncate text-xs text-white/35">{place.address}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {place.rating != null ? (
                  <Stars rating={place.rating} count={place.ratingCount} />
                ) : (
                  place.confidence != null && <span className="text-white/45">confiança {Math.round(place.confidence * 100)}%</span>
                )}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=19/${place.lat}/${place.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-sky-400 hover:underline"
                >
                  Ver no mapa <ExternalLink className="h-3 w-3" />
                </a>
                {place.leadStage && (
                  <span className="rounded-md bg-violet-500/15 px-1.5 py-px text-[11px] text-violet-300 ring-1 ring-violet-500/30">
                    CRM: {STAGES.find((s) => s.id === place.leadStage)?.label ?? place.leadStage}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {badgesFor(place).map((b) => (
              <span key={b.label} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${TONE_CLASS[b.tone]}`}>
                {b.label}
              </span>
            ))}
          </div>
        </header>

        {blocked && (
          <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/30">
            Este negócio pediu para não ser contatado. Os botões de contato foram desativados.
          </p>
        )}

        <section>
          <SectionTitle>Por que essa nota</SectionTitle>
          {place.auditStatus !== "done" ? (
            <p className="flex items-center gap-2 text-sm text-sky-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando o site…
            </p>
          ) : place.rules.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum sinal de oportunidade.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {place.rules.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-white/80">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[10px] font-semibold text-white/50" title={BLOCK_TITLE[r.block]}>
                      {r.block}
                    </span>
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="tabular-nums font-medium text-emerald-300/90">+{r.points}</span>
                </li>
              ))}
            </ul>
          )}
          {place.oldSite.length > 0 && <p className="mt-2 text-xs text-white/40">Sinais de site antigo: {place.oldSite.join(", ")}</p>}
        </section>

        <section>
          <SectionTitle>Contatos</SectionTitle>
          {place.contacts.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum contato encontrado.</p>
          ) : (
            <ul className="space-y-1.5">
              {place.contacts.map((c, i) => {
                const Icon = KIND_ICON[c.kind];
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]">
                    <Icon className={`h-4 w-4 shrink-0 ${KIND_COLOR[c.kind]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {c.kind === "phone" || c.kind === "whatsapp" ? (parseBrPhone(c.value)?.display ?? c.value) : c.value.replace(/^https?:\/\/(www\.)?/, "")}
                      </span>
                      <span className="block text-[11px] text-white/40">
                        {KIND_LABEL[c.kind]} · {SOURCE_LABEL[c.source]}
                      </span>
                    </span>
                    {c.kind === "whatsapp" && (
                      <span className={`shrink-0 rounded-md px-1.5 py-px text-[10px] font-medium ring-1 ${c.confirmed ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-white/5 text-white/50 ring-white/10"}`}>
                        {c.confirmed ? "confirmado" : "provável"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {!blocked && (
          <section className="space-y-2.5">
            <SectionTitle>Mensagem</SectionTitle>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select value={offer} onChange={(e) => setOffer(e.target.value as typeof offer)} className={SELECT}>
                {OFFERS.map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#0f1219]">
                    {l}
                  </option>
                ))}
              </select>
              <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} className={SELECT}>
                {TONES.map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#0f1219]">
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await generateMessageAction(place.id, offer, tone);
                  if (r.ok) setText(r.data);
                  else setError(r.error);
                })
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 hover:brightness-110 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {pending ? "Escrevendo…" : text ? "Gerar outra versão" : "Gerar mensagem com IA"}
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Gere com IA ou escreva a mensagem. Revise antes de enviar."
              className="w-full rounded-xl bg-white/[0.04] p-3 text-sm leading-relaxed outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-sky-500/60"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}

            {awaitingConfirm ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-2.5 text-sm ring-1 ring-emerald-500/25">
                <span className="flex-1">{awaitingConfirm === "ligacao" ? "Conseguiu falar?" : "Mandou a mensagem?"}</span>
                <button onClick={() => confirmSent(awaitingConfirm)} disabled={pending} className="rounded-lg bg-emerald-500 px-3 py-1 font-semibold text-[#0b0d12]">
                  Sim, registrar
                </button>
                <button onClick={() => setAwaitingConfirm(null)} className="rounded-lg px-2 py-1 text-white/60 hover:text-white">
                  Não
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {waPhone && (
                  <a
                    href={waLink(waPhone, text)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (!text.trim()) {
                        e.preventDefault();
                        setError("Escreva ou gere a mensagem antes.");
                        return;
                      }
                      setAwaitingConfirm("whatsapp");
                    }}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-[#0b0d12] hover:bg-emerald-400"
                  >
                    <MessageCircle className="h-4 w-4" /> Abrir no WhatsApp
                  </a>
                )}
                {(landline || waPhone) && (
                  <a href={`tel:${(landline ? parseBrPhone(landline.value) : waPhone)?.e164}`} onClick={() => setAwaitingConfirm("ligacao")} className={GHOST}>
                    <Phone className="h-4 w-4" /> Ligar
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email.value}?subject=${encodeURIComponent(`Ideia para ${place.name}`)}&body=${encodeURIComponent(text)}`}
                    onClick={() => setAwaitingConfirm("email")}
                    className={GHOST}
                  >
                    <Mail className="h-4 w-4" /> E-mail
                  </a>
                )}
                {insta && (
                  <a
                    href={insta.value}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      void navigator.clipboard?.writeText(text);
                      setAwaitingConfirm("instagram");
                    }}
                    className={GHOST}
                    title="Copia a mensagem e abre o perfil"
                  >
                    <AtSign className="h-4 w-4" /> Instagram
                  </a>
                )}
              </div>
            )}
            {!wa && !landline && !email && !insta && <p className="text-xs text-white/40">Sem contato disponível: este lead fica fora da fila de abordagem.</p>}
          </section>
        )}

        <section className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {!place.leadId && !blocked && (
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await addToCrmAction([place.id]);
                  if (!r.ok) setError(r.error);
                  await refresh();
                })
              }
              className="flex-1 rounded-xl bg-violet-500/15 py-2 text-sm font-medium text-violet-200 ring-1 ring-violet-500/30 hover:bg-violet-500/25"
            >
              Adicionar ao CRM
            </button>
          )}
          {!blocked && (
            <button
              disabled={pending}
              onClick={() => {
                const reason = window.prompt("Motivo (opcional). Este negócio não aparecerá mais nas buscas.", "Pediu para não ser contatado");
                if (reason === null) return;
                start(async () => {
                  const r = await optOutAction(place.id, reason);
                  if (!r.ok) setError(r.error);
                  await refresh();
                });
              }}
              className="rounded-xl px-3 py-2 text-sm text-red-300/80 ring-1 ring-red-500/25 hover:bg-red-500/10"
            >
              Não contatar mais
            </button>
          )}
        </section>

        {place.leadId && (
          <section className="space-y-2">
            <SectionTitle>Histórico</SectionTitle>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anotação, resposta do cliente…"
                className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-sky-500/60"
              />
              <button
                disabled={pending || !note.trim()}
                onClick={() =>
                  start(async () => {
                    await addActivityAction(place.leadId!, "nota", note);
                    setNote("");
                    await refresh();
                  })
                }
                className="rounded-md border border-white/15 px-2 py-1.5 text-sm"
              >
                Anotar
              </button>
              <button
                disabled={pending || !note.trim()}
                onClick={() =>
                  start(async () => {
                    await addActivityAction(place.leadId!, "resposta", note);
                    setNote("");
                    await refresh();
                  })
                }
                className="rounded-md border border-white/15 px-2 py-1.5 text-sm"
                title="Registra a resposta e move para Respondeu"
              >
                Respondeu
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {activities.map((a) => (
                <li key={a.id} className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.06]">
                  <div className="text-xs text-white/40">
                    {new Date(a.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {a.kind}
                    {a.channel ? ` · ${a.channel}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap text-white/80">{a.content}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="relative h-full overflow-y-auto bg-[#0f1219]/95 p-5 backdrop-blur-xl">
      <button onClick={onClose} className="absolute right-3 top-3 rounded px-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Fechar">
        ✕
      </button>
      {children}
    </div>
  );
}

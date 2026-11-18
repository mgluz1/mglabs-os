"use client";

import { AtSign, ExternalLink, Globe, Kanban, Loader2, Mail, MessageCircle, MessageSquareText, Phone, Plus, Share2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { leadDetailAction, openInStudioAction, optOutAction } from "@/app/actions";
import { addPlaceToCrmAction } from "@/lib/actions/crm";
import { badgesFor, TONE_CLASS } from "@/components/lead/badges";
import { ScoreBadge, Stars } from "@/components/radar/ui";
import { getCategory } from "@/lib/config/categories";
import { STAGE_DEFS } from "@/lib/config/crm";
import { fmtDateTime } from "@/lib/dates";
import { parseBrPhone, waLink } from "@/lib/phone";
import type { Activity, Contact, RadarPlace } from "@/lib/types";

const SOURCE_LABEL: Record<Contact["source"], string> = { site_empresa: "site da empresa", google_places: "Google", overture: "Overture (dados abertos)", manual: "manual" };
const KIND_LABEL: Record<Contact["kind"], string> = { whatsapp: "WhatsApp", phone: "Telefone", email: "E-mail", instagram: "Instagram", facebook: "Facebook", site: "Site" };
const KIND_ICON: Record<Contact["kind"], LucideIcon> = { whatsapp: MessageCircle, phone: Phone, email: Mail, instagram: AtSign, facebook: Share2, site: Globe };
const BLOCK_TITLE: Record<string, string> = { A: "Oportunidade digital", B: "Saúde do negócio", C: "Encaixe com a oferta", D: "Contato possível" };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</h3>;
}

export function LeadPanel({ placeId, onClose, onChanged, demo }: { placeId: string; onClose: () => void; onChanged?: () => void; demo?: RadarPlace }) {
  const router = useRouter();
  const [place, setPlace] = useState<RadarPlace | null>(demo ?? null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await leadDetailAction(placeId);
    if (r.ok) {
      setPlace(r.data.place);
      setActivities(r.data.activities);
      setError(null);
    } else setError(r.error);
  }, [placeId]);

  // o pai usa key={placeId}: trocar de lugar monta um painel novo, com estado limpo
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

  if (error && !place)
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-danger">{error}</p>
      </Shell>
    );
  if (!place)
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-muted">Carregando…</p>
      </Shell>
    );

  const cat = getCategory(place.category ?? "");
  // Telefone de celular é "provável WhatsApp": só vira "confirmado" com evidência (link wa.me no site da empresa).
  const wa =
    place.contacts.find((c) => c.kind === "whatsapp" && c.confirmed) ??
    place.contacts.find((c) => c.kind === "whatsapp") ??
    place.contacts.find((c) => c.kind === "phone" && parseBrPhone(c.value)?.mobile);
  const waPhone = wa ? parseBrPhone(wa.value) : null;
  const landline = place.contacts.find((c) => c.kind === "phone" && !parseBrPhone(c.value)?.mobile);
  const email = place.contacts.find((c) => c.kind === "email");
  const insta = place.contacts.find((c) => c.kind === "instagram");
  const site = place.contacts.find((c) => c.kind === "site");
  const blocked = place.optedOut;
  const stageLabel = STAGE_DEFS.find((s) => s.key === place.leadStage)?.label;

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const addToCrm = () =>
    start(async () => {
      const r = await addPlaceToCrmAction([place.id]);
      if (!r.ok) setError(r.error);
      else if (r.data.skipped) setError("Não foi possível adicionar este negócio.");
      await refresh();
    });

  const writeMessage = () =>
    start(async () => {
      const r = await openInStudioAction(place.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/mensagens?empresa=${r.data.companyId}&oportunidade=${r.data.dealId}`);
    });

  return (
    <Shell onClose={onClose}>
      <div className="space-y-5">
        <header>
          <div className="flex items-start gap-3 pr-6">
            <ScoreBadge score={place.score} size="lg" />
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-semibold leading-tight">{place.name}</h2>
              <p className="text-sm text-muted">
                {cat?.label ?? place.category}
                {place.neighborhood ? ` · ${place.neighborhood}` : ""}
                {place.city ? ` · ${place.city}` : ""}
              </p>
              <p className="truncate text-xs text-fg/40">{place.address}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {place.rating != null ? <Stars rating={place.rating} count={place.ratingCount} /> : place.confidence != null && <span className="text-muted">confiança {Math.round(place.confidence * 100)}%</span>}
                <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=19/${place.lat}/${place.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">
                  Ver no mapa <ExternalLink className="h-3 w-3" />
                </a>
                {stageLabel && <span className="rounded-md bg-brand/12 px-1.5 py-px text-[11px] text-brand ring-1 ring-brand/25">CRM: {stageLabel}</span>}
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

        {blocked && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger ring-1 ring-danger/30">Este negócio pediu para não ser contatado. Os botões de contato foram desativados.</p>}

        <section>
          <SectionTitle>Por que essa nota</SectionTitle>
          {place.auditStatus !== "done" ? (
            <p className="flex items-center gap-2 text-sm text-brand">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando o site…
            </p>
          ) : place.rules.length === 0 ? (
            <p className="text-sm text-muted">Nenhum sinal de oportunidade.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {place.rules.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-fg/85">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-fg/8 text-[10px] font-semibold text-muted" title={BLOCK_TITLE[r.block]}>
                      {r.block}
                    </span>
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="font-medium tabular-nums text-brand">+{r.points}</span>
                </li>
              ))}
            </ul>
          )}
          {place.oldSite.length > 0 && <p className="mt-2 text-xs text-muted">Sinais de site antigo: {place.oldSite.join(", ")}</p>}
        </section>

        <section>
          <SectionTitle>Contatos comerciais</SectionTitle>
          {place.contacts.length === 0 ? (
            <p className="text-sm text-muted">Nenhum contato encontrado nos dados abertos nem no site da empresa.</p>
          ) : (
            <ul className="space-y-1.5">
              {place.contacts.map((c, i) => {
                const Icon = KIND_ICON[c.kind];
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-3 py-2">
                    <Icon className="h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.kind === "phone" || c.kind === "whatsapp" ? (parseBrPhone(c.value)?.display ?? c.value) : c.value.replace(/^https?:\/\/(www\.)?/, "")}</span>
                      <span className="block text-[11px] text-muted">
                        {KIND_LABEL[c.kind]} · {SOURCE_LABEL[c.source]}
                      </span>
                    </span>
                    {c.kind === "whatsapp" && <span className={`shrink-0 rounded-md px-1.5 py-px text-[10px] font-medium ring-1 ${c.confirmed ? "bg-brand/15 text-brand ring-brand/30" : "bg-fg/5 text-muted ring-fg/10"}`}>{c.confirmed ? "confirmado" : "provável"}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {!blocked && (waPhone || landline || email || insta || site) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {waPhone && (
                <a href={waLink(waPhone, "")} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              {(landline || waPhone) && (
                <a href={`tel:${(landline ? parseBrPhone(landline.value) : waPhone)?.e164}`} className="btn btn-ghost">
                  <Phone className="h-4 w-4" /> Ligar
                </a>
              )}
              {email && (
                <a href={`mailto:${email.value}`} className="btn btn-ghost">
                  <Mail className="h-4 w-4" /> E-mail
                </a>
              )}
              {insta && (
                <a href={insta.value} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  <AtSign className="h-4 w-4" /> Instagram
                </a>
              )}
              {site && (
                <a href={site.value} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  <Globe className="h-4 w-4" /> Site
                </a>
              )}
            </div>
          )}
          {!wa && !landline && !email && !insta && !blocked && <p className="mt-2 text-xs text-muted">Sem contato disponível: este lead fica fora da fila de abordagem.</p>}
          <p className="mt-2 text-[11px] text-muted">Mensagens nunca são enviadas automaticamente: você revisa o texto e envia pelo seu WhatsApp.</p>
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}

        <section className="space-y-2 border-t border-line pt-4">
          {!blocked && (
            <button disabled={pending} onClick={writeMessage} className="btn btn-primary w-full">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
              Escrever mensagem no Estúdio
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            {!place.leadId && !blocked && (
              <button disabled={pending} onClick={addToCrm} className="btn btn-ghost flex-1">
                <Plus className="h-4 w-4" /> Adicionar ao CRM
              </button>
            )}
            {place.leadId && (
              <Link href={`/crm?deal=${place.leadId}`} className="btn btn-ghost flex-1">
                <Kanban className="h-4 w-4" /> Abrir no CRM
              </Link>
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
                className="btn btn-danger"
              >
                Não contatar mais
              </button>
            )}
          </div>
        </section>

        {activities.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>Histórico no CRM</SectionTitle>
            <ul className="space-y-2 text-sm">
              {activities.slice(0, 8).map((a) => (
                <li key={a.id} className="rounded-xl border border-line bg-elevated p-2.5">
                  <div className="text-xs text-muted">
                    {fmtDateTime(a.createdAt)} · {a.kind}
                    {a.channel ? ` · ${a.channel}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap text-fg/85">{a.content}</div>
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
    <div className="relative h-full overflow-y-auto bg-surface p-5">
      <button onClick={onClose} className="absolute right-3 top-3 rounded px-2 text-muted hover:bg-fg/10 hover:text-fg" aria-label="Fechar">
        ✕
      </button>
      {children}
    </div>
  );
}

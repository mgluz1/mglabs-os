"use client";

import { AtSign, Ban, ExternalLink, Globe, Kanban, Loader2, Mail, MessageCircle, MessageSquareText, Phone, Share2, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { leadDetailAction, openInStudioAction, optOutAction, prospectStateAction, retryAuditsAction } from "@/app/actions";
import { badgesFor } from "@/components/lead/badges";
import { CATEGORY_ICON, ScoreRing, Stars } from "@/components/radar/ui";
import { addPlaceToCrmAction, moveDealAction } from "@/lib/actions/crm";
import { categoryLabel } from "@/lib/config/categories";
import { LOST_REASONS, STAGE_DEFS } from "@/lib/config/crm";
import { fmtDateTime } from "@/lib/dates";
import { distanceM, type LatLng } from "@/lib/geo";
import { parseBrPhone, waLink } from "@/lib/phone";
import { APPROACH_STATUS_LABEL, deriveApproachStatus, isSnoozed } from "@/lib/prospecting";
import { signalsFor } from "@/lib/radar-signals";
import type { Activity, Contact, RadarPlace } from "@/lib/types";

const SOURCE_LABEL: Record<Contact["source"], string> = { site_empresa: "site da empresa", google_places: "Google", overture: "dados abertos", manual: "manual" };
const KIND_ICON: Record<Contact["kind"], LucideIcon> = { whatsapp: MessageCircle, phone: Phone, email: Mail, instagram: AtSign, facebook: Share2, site: Globe };
const BLOCK_TITLE: Record<string, string> = { A: "Oportunidade digital", B: "Saúde do negócio", C: "Encaixe com a oferta", D: "Contato possível" };
// pílulas do funil (rótulos curtos)
const PILLS = STAGE_DEFS.map((s) => ({ key: s.key, label: s.key === "primeiro_contato" ? "Abordado" : s.key === "ganho" ? "Fechado" : s.label, kind: s.kind }));

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function LeadPanel({ placeId, onClose, onChanged, demo, center, offer }: { placeId: string; onClose: () => void; onChanged?: () => void; demo?: RadarPlace; center?: LatLng; offer?: string | null }) {
  const router = useRouter();
  const [place, setPlace] = useState<RadarPlace | null>(demo ?? null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
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

  if (!place)
    return (
      <Shell onClose={onClose}>
        {error ? <p className="p-6 text-sm text-danger">{error}</p> : <div className="space-y-3 p-6"><div className="skeleton h-16 w-16 rounded-full" /><div className="skeleton h-7 w-2/3" /><div className="skeleton h-24" /></div>}
      </Shell>
    );

  const CatIcon = CATEGORY_ICON[place.category ?? ""] ?? Globe;
  // celular é "provável WhatsApp": só vira "confirmado" com evidência (link wa.me no site da empresa)
  const wa = place.contacts.find((c) => c.kind === "whatsapp" && c.confirmed) ?? place.contacts.find((c) => c.kind === "whatsapp") ?? place.contacts.find((c) => c.kind === "phone" && parseBrPhone(c.value)?.mobile);
  const waPhone = wa ? parseBrPhone(wa.value) : null;
  const landline = place.contacts.find((c) => c.kind === "phone" && !parseBrPhone(c.value)?.mobile);
  const blocked = place.optedOut;
  const dist = center ? distanceM(center, { lat: place.lat, lng: place.lng }) : null;
  const signals = signalsFor(place);
  const approachStatus = deriveApproachStatus(place);
  const hiddenInQueue = place.ignored || isSnoozed(place);
  const reason = signals.length ? signals.join("; ").replace(/^./, (c) => c.toUpperCase()) + "." : place.auditStatus === "done" ? "Nenhum sinal forte de oportunidade digital." : null;

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const setStage = (key: string, lostReason?: string) =>
    start(async () => {
      if (demo) return;
      let dealId = place.leadId;
      if (!dealId) {
        const r = await openInStudioAction(place.id, offer); // cria empresa + oportunidade sem duplicar
        if (!r.ok) return setError(r.error);
        dealId = r.data.dealId;
      }
      if (key !== "novo" || place.leadStage) {
        const r = await moveDealAction(dealId, key, lostReason);
        if (!r.ok) setError(r.error);
      }
      await refresh();
    });

  const writeMessage = () =>
    start(async () => {
      const r = await openInStudioAction(place.id, offer);
      if (!r.ok) return setError(r.error);
      const qs = new URLSearchParams({ empresa: r.data.companyId, oportunidade: r.data.dealId });
      if (r.data.serviceType) qs.set("servico", r.data.serviceType);
      router.push(`/mensagens?${qs.toString()}`);
    });

  return (
    <Shell onClose={onClose}>
      <div className="space-y-4 p-5">
        <header className="flex items-start gap-4 pr-8">
          <ScoreRing score={place.score} size={64} />
          <div className="min-w-0">
            <h2 className="font-heading text-[26px] leading-tight">{place.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {place.rating != null ? <Stars rating={place.rating} count={place.ratingCount} /> : place.confidence != null ? `Confiança ${Math.round(place.confidence * 100)}%${place.sourceCount ? ` · ${place.sourceCount} ${place.sourceCount === 1 ? "fonte" : "fontes"}` : ""}` : null}
            </p>
          </div>
        </header>

        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1"><CatIcon className="h-3.5 w-3.5" aria-hidden />{categoryLabel(place.category)}</span>
          {(place.neighborhood || place.city) && <span>{[place.neighborhood, place.city].filter(Boolean).join(", ")}</span>}
          {dist != null && <span>{(dist / 1000).toFixed(1).replace(".", ",")} km do centro da busca</span>}
          <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=19/${place.lat}/${place.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">
            Ver no OpenStreetMap <ExternalLink className="h-3 w-3" />
          </a>
        </p>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
            {APPROACH_STATUS_LABEL[approachStatus]}
          </span>
          {badgesFor(place).map((b) => (
            <span key={b.label} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              {b.label}
            </span>
          ))}
          {waPhone && (
            <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
              {wa?.confirmed ? "WhatsApp confirmado" : "Celular (WhatsApp não confirmado)"}
            </span>
          )}
        </div>

        {/* funil */}
        {!blocked && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa no CRM">
            {PILLS.map((s) => {
              const on = (place.leadStage ?? null) === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={pending || !!demo}
                  aria-pressed={on}
                  onClick={() => (s.kind === "lost" ? setLostOpen(true) : setStage(s.key))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ${on ? "border-brand bg-brand font-medium text-brand-on" : "border-line bg-surface hover:border-line-strong"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        {!place.leadStage && !blocked && <p className="-mt-2 text-xs text-muted">Ainda fora do CRM. Escolher uma etapa adiciona o negócio ao funil.</p>}
        {lostOpen && (
          <div className="rounded-xl border border-line bg-background p-3">
            <p className="mb-2 text-sm font-medium">Motivo da perda</p>
            <div className="flex flex-wrap gap-1.5">
              {LOST_REASONS.filter((r) => r !== "Pediu para não ser contatado").map((r) => (
                <button key={r} type="button" onClick={() => { setLostOpen(false); setStage("perdido", r); }} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs hover:border-line-strong">
                  {r}
                </button>
              ))}
              <button type="button" onClick={() => setLostOpen(false)} className="px-2 text-xs text-muted hover:text-fg">Cancelar</button>
            </div>
          </div>
        )}

        {blocked && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">Este negócio pediu para não ser contatado. Os botões de contato foram desativados.</p>}

        <Card title="Por que é uma oportunidade">
          {place.auditStatus === "pending" || place.auditStatus === "running" || !place.auditStatus ? (
            <p className="flex items-center gap-2 text-sm text-brand">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando o site…
            </p>
          ) : (
            <>
              {place.auditStatus === "error" && (
                <div className="mb-3 rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm">
                  <p className="font-medium text-danger">Não foi possível concluir a auditoria do site</p>
                  {place.auditError && <p className="mt-0.5 text-xs text-muted">Motivo: {place.auditError}</p>}
                  {!demo && place.auditError !== "endereço não permitido" && place.auditError !== "robots.txt não permite" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await retryAuditsAction([place.id]);
                          if (!r.ok) setError(r.error);
                          await refresh();
                        })
                      }
                      className="mt-2 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                    >
                      Tentar auditoria novamente
                    </button>
                  )}
                </div>
              )}
              {reason && <p className="text-[15px] leading-relaxed">{reason}</p>}
              {place.rules.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                  {place.rules.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-background font-mono text-[10px] text-muted" title={BLOCK_TITLE[r.block]}>
                          {r.block}
                        </span>
                        <span className="truncate">{r.label}</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-brand">+{r.points}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
                Fonte: {place.source === "overture" ? "Overture Maps" : "Google Places"}
                {place.auditedAt ? ` · Auditoria: ${fmtDateTime(place.auditedAt)}` : " · Site não verificado"}
                {place.scoredAt ? ` · Score: ${fmtDateTime(place.scoredAt)}` : ""}
              </p>
            </>
          )}
        </Card>

        <Card title="Contato">
          {place.contacts.length === 0 ? (
            <p className="text-sm text-muted">Nenhum contato nos dados abertos nem no site da empresa. Este negócio fica fora da abordagem.</p>
          ) : (
            <ul className="space-y-2">
              {place.contacts.map((c, i) => {
                const Icon = KIND_ICON[c.kind];
                const phone = c.kind === "phone" || c.kind === "whatsapp" ? parseBrPhone(c.value) : null;
                const text = phone?.display ?? c.value.replace(/^https?:\/\/(www\.)?/, "");
                const href = blocked ? undefined : phone ? (phone.mobile ? waLink(phone, "") : `tel:${phone.e164}`) : c.kind === "email" ? `mailto:${c.value}` : c.value;
                return (
                  <li key={i} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      {href ? (
                        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="block truncate text-[15px] font-medium text-brand hover:underline">
                          {text}
                        </a>
                      ) : (
                        <span className="block truncate text-[15px]">{text}</span>
                      )}
                      <span className="block text-xs text-muted">{SOURCE_LABEL[c.source]}</span>
                    </span>
                    {phone && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{c.confirmed && c.kind === "whatsapp" ? "WhatsApp confirmado" : phone.mobile ? "celular (não confirmado)" : "fixo"}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {!blocked && (waPhone || landline) && (
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              {waPhone && (
                <a href={waLink(waPhone, "")} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm flex-1">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              <a href={`tel:${(landline ? parseBrPhone(landline.value) : waPhone)?.e164}`} className="btn btn-ghost btn-sm flex-1">
                <Phone className="h-4 w-4" /> Ligar
              </a>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Nada é enviado automaticamente: você revisa o texto e envia pelo seu WhatsApp.</p>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        {!blocked && (
          <div className="space-y-2">
            <button type="button" disabled={pending || !!demo} onClick={writeMessage} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-[15px] font-semibold text-brand-on shadow-[0_12px_28px_-12px_var(--brand)] hover:bg-brand-hover disabled:opacity-60">
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquareText className="h-5 w-5" />}
              Escrever mensagem
            </button>
            {!demo && (
              <div className="flex flex-wrap gap-2">
                {approachStatus === "nao_abordado" || approachStatus === "mensagem_preparada" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(async () => { const r = await prospectStateAction(place.id, { action: "contatado", offer }); if (!r.ok) setError(r.error); await refresh(); })}
                    className="btn btn-ghost btn-sm flex-1"
                  >
                    Marcar contato realizado
                  </button>
                ) : null}
                {hiddenInQueue ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(async () => { const r = await prospectStateAction(place.id, { action: "restaurar" }); if (!r.ok) setError(r.error); await refresh(); })}
                    className="btn btn-ghost btn-sm flex-1"
                  >
                    Restaurar na fila
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => { const r = await prospectStateAction(place.id, { action: "adiar", days: 7 }); if (!r.ok) setError(r.error); await refresh(); })}
                      className="btn btn-ghost btn-sm"
                    >
                      Adiar 7d
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => { const r = await prospectStateAction(place.id, { action: "ignorar" }); if (!r.ok) setError(r.error); await refresh(); })}
                      className="btn btn-ghost btn-sm"
                    >
                      Ignorar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {place.leadId ? (
            <Link href={`/crm?deal=${place.leadId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
              <Kanban className="h-4 w-4" /> Abrir no CRM
            </Link>
          ) : (
            !blocked && (
              <button type="button" disabled={pending || !!demo} onClick={() => start(async () => { const r = await addPlaceToCrmAction([place.id]); if (!r.ok) setError(r.error); await refresh(); })} className="text-sm font-medium text-brand hover:underline disabled:opacity-60">
                + Adicionar ao CRM
              </button>
            )
          )}
          {!blocked && (
            <button
              type="button"
              disabled={pending || !!demo}
              onClick={() => {
                const r = window.prompt("Motivo (opcional). Este negócio some das buscas e não recebe mais mensagens.", "Pediu para não ser contatado");
                if (r === null) return;
                start(async () => {
                  const out = await optOutAction(place.id, r);
                  if (!out.ok) setError(out.error);
                  await refresh();
                });
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-danger hover:underline disabled:opacity-60"
            >
              <Ban className="h-4 w-4" /> Pediu para não ser contatado
            </button>
          )}
        </div>

        {activities.length > 0 && (
          <Card title="Histórico no CRM">
            <ul className="space-y-2.5 text-sm">
              {activities.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <div className="text-xs text-muted">
                    {fmtDateTime(a.createdAt)} · {a.kind}
                    {a.channel ? ` · ${a.channel}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap">{a.content}</div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-surface p-1.5 text-muted shadow-sm ring-1 ring-line hover:text-fg" aria-label="Fechar ficha">
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

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
import { badgesFor, BAND_COLOR, bandOf, TONE_CLASS } from "@/components/lead/badges";
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

const SOURCE_LABEL: Record<Contact["source"], string> = { site_empresa: "site da empresa", google_places: "Google", manual: "manual" };
const KIND_LABEL: Record<Contact["kind"], string> = {
  whatsapp: "WhatsApp",
  phone: "Telefone",
  email: "E-mail",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
};

type Channel = "whatsapp" | "ligacao" | "email" | "instagram";

export function LeadPanel({ placeId, onClose, onChanged }: { placeId: string; onClose: () => void; onChanged?: () => void }) {
  const [place, setPlace] = useState<RadarPlace | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<(typeof OFFERS)[number][0]>("site");
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
  }, [placeId]);

  if (error && !place) return <Shell onClose={onClose}><p className="text-sm text-red-300">{error}</p></Shell>;
  if (!place) return <Shell onClose={onClose}><p className="text-sm text-white/50">Carregando…</p></Shell>;

  const band = bandOf(place.score);
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
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-[#0b0d12]" style={{ background: BAND_COLOR[band] }}>
              {place.score ?? "…"}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{place.name}</h2>
              <p className="text-sm text-white/60">
                {cat?.label ?? place.category}
                {place.neighborhood ? ` · ${place.neighborhood}` : ""}
                {place.city ? ` · ${place.city}` : ""}
              </p>
              <p className="text-xs text-white/40">{place.address}</p>
              <p className="mt-1 text-xs text-white/60">
                {place.rating != null ? `★ ${place.rating.toFixed(1)} (${place.ratingCount ?? 0})` : "sem avaliações"}
                {place.googleMapsUri && (
                  <>
                    {" · "}
                    <a href={place.googleMapsUri} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                      Ver no Google Maps
                    </a>
                  </>
                )}
                {place.leadStage && ` · CRM: ${STAGES.find((s) => s.id === place.leadStage)?.label ?? place.leadStage}`}
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badgesFor(place).map((b) => (
              <span key={b.label} className={`rounded px-1.5 py-0.5 text-xs ring-1 ${TONE_CLASS[b.tone]}`}>
                {b.label}
              </span>
            ))}
          </div>
        </header>

        {blocked && (
          <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/30">
            Este negócio pediu para não ser contatado. Os botões de contato foram desativados.
          </p>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Por que essa nota</h3>
          {place.auditStatus !== "done" ? (
            <p className="text-sm text-white/50">Analisando o site…</p>
          ) : place.rules.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum sinal de oportunidade.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {place.rules.map((r, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-white/80">
                    <span className="mr-1.5 text-xs text-white/40">{r.block}</span>
                    {r.label}
                  </span>
                  <span className="tabular-nums text-white/60">+{r.points}</span>
                </li>
              ))}
            </ul>
          )}
          {place.oldSite.length > 0 && <p className="mt-1 text-xs text-white/40">Sinais de site antigo: {place.oldSite.join(", ")}</p>}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Contatos</h3>
          {place.contacts.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum contato encontrado.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {place.contacts.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-20 shrink-0 text-white/50">{KIND_LABEL[c.kind]}</span>
                  <span className="break-all">{c.kind === "phone" || c.kind === "whatsapp" ? (parseBrPhone(c.value)?.display ?? c.value) : c.value}</span>
                  <span className="text-xs text-white/40">
                    {SOURCE_LABEL[c.source]}
                    {c.kind === "whatsapp" && (c.confirmed ? " · WhatsApp confirmado" : " · provável WhatsApp")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!blocked && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40">Mensagem</h3>
            <div className="flex gap-2">
              <select value={offer} onChange={(e) => setOffer(e.target.value as typeof offer)} className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm">
                {OFFERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm">
                {TONES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await generateMessageAction(place.id, offer, tone);
                    if (r.ok) setText(r.data);
                    else setError(r.error);
                  })
                }
                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-[#0b0d12] hover:bg-sky-400 disabled:opacity-50"
              >
                {pending ? "…" : "Gerar com IA"}
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Gere com IA ou escreva a mensagem. Revise antes de enviar."
              className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-sm"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}

            {awaitingConfirm ? (
              <div className="flex items-center gap-2 rounded-md bg-white/5 p-2 text-sm">
                <span>{awaitingConfirm === "ligacao" ? "Conseguiu falar?" : "Mandou a mensagem?"}</span>
                <button onClick={() => confirmSent(awaitingConfirm)} disabled={pending} className="rounded bg-green-500 px-2 py-1 font-medium text-[#0b0d12]">
                  Sim, registrar
                </button>
                <button onClick={() => setAwaitingConfirm(null)} className="rounded border border-white/10 px-2 py-1">
                  Não
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
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
                    className="rounded-md bg-green-500 px-3 py-1.5 text-sm font-medium text-[#0b0d12] hover:bg-green-400"
                  >
                    Abrir no WhatsApp
                  </a>
                )}
                {(landline || waPhone) && (
                  <a
                    href={`tel:${(landline ? parseBrPhone(landline.value) : waPhone)?.e164}`}
                    onClick={() => setAwaitingConfirm("ligacao")}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
                  >
                    Ligar
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email.value}?subject=${encodeURIComponent(`Ideia para ${place.name}`)}&body=${encodeURIComponent(text)}`}
                    onClick={() => setAwaitingConfirm("email")}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
                  >
                    E-mail
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
                    className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
                    title="Copia a mensagem e abre o perfil"
                  >
                    Instagram (copia o texto)
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
              className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10"
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
              className="rounded-md border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
            >
              Não contatar mais
            </button>
          )}
        </section>

        {place.leadId && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40">Histórico</h3>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anotação, resposta do cliente…"
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
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
                <li key={a.id} className="rounded-md bg-white/5 p-2">
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
    <div className="relative h-full overflow-y-auto border-l border-white/10 bg-[#0f1219] p-5">
      <button onClick={onClose} className="absolute right-3 top-3 rounded px-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Fechar">
        ✕
      </button>
      {children}
    </div>
  );
}

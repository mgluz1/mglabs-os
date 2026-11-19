"use client";

import {
  AtSign,
  Bookmark,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Globe,
  History,
  Loader2,
  Mail,
  MessageCircle,
  Undo2,
  Wand2,
  MessageSquareReply,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Badge, EmptyState, Field, SectionCard } from "@/components/ui/kit";
import { ConfirmButton, Dialog, useRun, useToast } from "@/components/ui/overlays";
import { GeminiSetupGuide } from "@/components/settings/gemini-setup";
import { OutreachQueue } from "@/components/messages/outreach-queue";
import { ReplyAssistant, type ReplyOutcome } from "@/components/messages/reply-assistant";
import { generateMessagesAction, refineMessageAction } from "@/lib/actions/ai";
import { optOutCompanyAction } from "@/lib/actions/crm";
import {
  advanceDealAction,
  deleteTemplateAction,
  messageContextAction,
  recordReplyAction,
  registerSentAction,
  saveDraftAction,
  saveTemplateAction,
  scheduleFollowUpAction,
  toggleFavoriteTemplateAction,
  whatsappLinkAction,
} from "@/lib/actions/messages";
import { MESSAGE_LENGTHS, MESSAGE_OBJECTIVES, MESSAGE_TONES, STAGE_DEFS, labelOf, type MessageLengthId } from "@/lib/config/crm";
import { categoryLabel } from "@/lib/config/categories";
import { fmtDateTime } from "@/lib/dates";
import { COLD_OBJECTIVES, OPT_OUT_LINE, TEMPLATE_VARIABLES, buildTemplateText, pickTemplateForOffer } from "@/lib/messages";
import { planMessage } from "@/lib/message-plan";
import { REFINE_ACTIONS } from "@/lib/refine-actions";
import type { MessageContext } from "@/lib/services/messages";
import type { QueueItem } from "@/lib/services/outreach";

export type Opt = { value: string; label: string };
type Template = {
  id: string;
  name: string;
  objective: string;
  service: string | null;
  tone: string | null;
  channel: string;
  body: string;
  version: number;
  favorite: boolean;
};
type Draft = {
  id: string;
  dealId: string | null;
  companyId: string | null;
  companyName: string | null;
  objective: string;
  service: string | null;
  channel: string;
  body: string;
  status: string;
  origin: string;
  createdAt: Date;
  sentAt: Date | null;
};
type Variant = { text: string; warnings: string[] };
type Channel = "whatsapp" | "email" | "instagram";

const CORE_OBJECTIVES = ["primeiro_contato", "follow_up", "resposta_interesse", "apresentacao_proposta", "negociacao"] as const;
const OBJECTIVE_SHORT: Record<string, string> = {
  primeiro_contato: "1º contato",
  follow_up: "Follow-up",
  resposta_interesse: "Resposta",
  apresentacao_proposta: "Proposta",
  negociacao: "Negociação",
};

const ACTIVITY_LABEL: Record<string, string> = {
  mensagem_enviada: "Mensagem enviada",
  resposta: "Resposta do cliente",
  ligacao: "Ligação",
  reuniao: "Reunião",
  nota: "Nota",
  proposta: "Proposta",
  tarefa: "Follow-up",
  etapa: "Etapa",
};

function presenceBadges(mc: MessageContext) {
  const badges: { label: string; tone: "neutral" | "brand" | "warn" | "info" | "ok" }[] = [];
  if (mc.presence.siteType === "sem_site") badges.push({ label: "Site não encontrado", tone: "warn" });
  else if (mc.presence.siteType === "so_rede_social") badges.push({ label: "Só rede social", tone: "warn" });
  else if (mc.presence.website) badges.push({ label: "Site próprio", tone: "info" });
  if (mc.presence.psiPerformance != null) {
    badges.push({ label: `Velocidade ${mc.presence.psiPerformance}/100`, tone: mc.presence.psiPerformance < 50 ? "warn" : "ok" });
  }
  if (mc.presence.viewport === false) badges.push({ label: "Desalinhado no celular", tone: "warn" });
  if (mc.presence.hasBooking === false) badges.push({ label: "Sem agendamento detectado", tone: "info" });
  if (mc.presence.instagram) badges.push({ label: "Instagram ativo", tone: "neutral" });
  return badges;
}

export function MessageStudio({
  options,
  templates,
  drafts,
  services,
  sender,
  ai,
  initial,
  initialContext,
  initialService = "",
  queue = [],
}: {
  options: Opt[];
  templates: Template[];
  drafts: Draft[];
  services: string[];
  sender: string;
  ai: { enabled: boolean; model: string; dailyLimit: number; usedToday: number };
  initial: string;
  initialContext: MessageContext | null;
  initialService?: string;
  queue?: QueueItem[];
}) {
  const { run, pending } = useRun();
  const toast = useToast();
  const [tab, setTab] = useState<"escrever" | "fila" | "modelos">("escrever");
  const [leadFilter, setLeadFilter] = useState("");
  const [sel, setSel] = useState(initial);
  const [mc, setMc] = useState<MessageContext | null>(initialContext);
  const [loadingCtx, setLoadingCtx] = useState(false);

  const [objective, setObjective] = useState<string>(() => (initialContext ? planMessage({ stageKey: initialContext.dealStageKey, history: initialContext.recentHistory }).objective : "primeiro_contato"));
  const [service, setService] = useState(initialContext?.serviceType ?? initialService);
  const [tone, setTone] = useState("natural");
  const [length, setLength] = useState<MessageLengthId>("media");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [recipientId, setRecipientId] = useState(initialContext?.recipients[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [observation, setObservation] = useState("");
  const [facts, setFacts] = useState<string[]>(initialContext?.facts ?? []);
  const [optOut, setOptOut] = useState(true);
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState<"manual" | "modelo" | "ia">("manual");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState(ai.usedToday);
  const [consentCb, setConsentCb] = useState<(() => void) | null>(null);
  const [prevText, setPrevText] = useState<string | null>(null);
  const [refining, setRefining] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [replyRaw, setReplyRaw] = useState("");
  const [replyStop, setReplyStop] = useState(false);
  const [replyStage, setReplyStage] = useState<string | null>(null);

  const [awaiting, setAwaiting] = useState<Channel | null>(null);
  const [followUpDays, setFollowUpDays] = useState(3);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<"lead" | "todos">(initialContext ? "lead" : "todos");

  const [saveTpl, setSaveTpl] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplFav, setTplFav] = useState(true);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replySummary, setReplySummary] = useState("");
  const [replyFollowDays, setReplyFollowDays] = useState(2);
  const [replyAdvance, setReplyAdvance] = useState(true);

  const [followOpen, setFollowOpen] = useState(false);
  const [followTitle, setFollowTitle] = useState("Follow-up comercial");
  const [followModalDays, setFollowModalDays] = useState(3);

  const loadCtx = useCallback(
    async (value: string) => {
      if (!value) {
        setMc(null);
        setHistoryScope("todos");
        return;
      }
      setLoadingCtx(true);
      const r = await messageContextAction(value.startsWith("d:") ? { dealId: value.slice(2) } : { companyId: value.slice(2) });
      setLoadingCtx(false);
      if (!r.ok) {
        toast(r.error, "error");
        setMc(null);
        return;
      }
      setMc(r.data);
      if (!r.data.blocked) setObjective(planMessage({ stageKey: r.data.dealStageKey, history: r.data.recentHistory }).objective);
      setFacts(r.data.facts);
      setRecipientId(r.data.recipients[0]?.id ?? "");
      if (r.data.serviceType) setService(r.data.serviceType);
      setHistoryScope("lead");
    },
    [toast],
  );

  const pick = (value: string) => {
    setSel(value);
    setVariants([]);
    setAiError(null);
    setActiveDraftId(null);
    setAwaiting(null);
    setConfirmKey(null);
    setJustSent(false);
    setPrevText(null);
    void loadCtx(value);
  };

  const filteredOptions = useMemo(() => {
    const q = leadFilter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, leadFilter]);

  const recipient = mc?.recipients.find((r) => r.id === recipientId) ?? null;

  const templatesForObjective = useMemo(() => {
    const list = templates.filter((t) => t.objective === objective);
    return [...list].sort((a, b) => {
      const favDiff = Number(b.favorite) - Number(a.favorite);
      if (favDiff !== 0) return favDiff;
      const aMatch = service && a.service === service ? 1 : 0;
      const bMatch = service && b.service === service ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [templates, objective, service]);

  const favoriteTemplates = useMemo(() => templates.filter((t) => t.favorite), [templates]);
  const recommendedTemplate = useMemo(() => pickTemplateForOffer(templatesForObjective, objective, service), [templatesForObjective, objective, service]);
  const serviceOptions = useMemo(() => (service && !services.includes(service) ? [service, ...services] : services), [services, service]);
  const cold = (COLD_OBJECTIVES as string[]).includes(objective);
  const blocked = !!mc?.blocked;

  const fromTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t || !mc) return;
    setTemplateId(id);
    setText(
      buildTemplateText(
        t.body,
        { empresa: mc.companyName, contatoNome: mc.contactName, remetente: sender, servico: service || mc.serviceType, cidade: mc.city, observacao: observation || null, origem: mc.origin },
        objective,
        optOut,
      ),
    );
    setOrigin("modelo");
  };

  const generate = async () => {
    if (!mc) return;
    setAiBusy(true);
    setAiError(null);
    const r = await generateMessagesAction({
      dealId: mc.dealId,
      companyId: mc.companyId,
      contactId: mc.contactId,
      objective,
      service: service || null,
      tone,
      length,
      observation: observation || null,
      useFacts: facts,
      count: 3,
      optOut,
      consent: true,
    });
    setAiBusy(false);
    if (!r.ok) {
      setAiError(r.error);
      toast(r.error, "error");
      return;
    }
    setVariants(r.data);
    setUsedAi((n) => n + 1);
  };

  /** Executa `fn` se o usuário já autorizou o envio de contexto anonimizado ao Gemini; senão pergunta antes. */
  const withConsent = (fn: () => void) => {
    let ok = false;
    try {
      ok = localStorage.getItem("mglabs-ai-consent") === "1";
    } catch {
      /* sem armazenamento: pergunta sempre */
    }
    if (ok) fn();
    else setConsentCb(() => fn);
  };
  const askAi = () => withConsent(() => void generate());

  const refine = async (action: (typeof REFINE_ACTIONS)[number]["id"]) => {
    if (!text.trim()) return;
    const before = text;
    setRefining(action);
    const r = await refineMessageAction({ text: before, action, consent: true });
    setRefining(null);
    if (!r.ok) {
      toast(r.error, "error");
      return;
    }
    setPrevText(before);
    setText(r.data.text);
    setOrigin("ia");
    setUsedAi((n) => n + 1);
  };
  const askRefine = (action: (typeof REFINE_ACTIONS)[number]["id"]) => withConsent(() => void refine(action));

  const plan = useMemo(() => (mc && !mc.blocked ? planMessage({ stageKey: mc.dealStageKey, history: mc.recentHistory }) : null), [mc]);
  const nextInQueue = useMemo(() => queue.find((q) => q.companyId !== mc?.companyId) ?? null, [queue, mc?.companyId]);

  const draftInput = () => ({
    dealId: mc?.dealId ?? null,
    companyId: mc?.companyId ?? null,
    contactId: recipient?.contactId ?? mc?.contactId ?? null,
    objective: objective as "primeiro_contato",
    service: service || null,
    tone: tone as "natural",
    channel,
    body: text,
    origin,
    templateId: templateId || null,
    facts: facts.length ? facts : null,
  });

  const startAwaiting = (ch: Channel) => {
    setAwaiting(ch);
    setConfirmKey((prev) => prev ?? crypto.randomUUID());
  };

  const openWhatsapp = async () => {
    if (!mc || !recipient?.waDigits) return;
    const r = await whatsappLinkAction({ companyId: mc.companyId, contactId: recipient.contactId, phone: recipient.value, text });
    if (!r.ok) {
      toast(r.error, "error");
      return;
    }
    window.open(r.data, "_blank", "noopener,noreferrer");
    startAwaiting("whatsapp");
  };

  const copyText = async (value: string, label = "Mensagem copiada.") => {
    try {
      await navigator.clipboard.writeText(value);
      toast(label);
    } catch {
      toast("Não foi possível copiar automaticamente.", "error");
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.trim().length;
  const visibleDrafts = useMemo(
    () => (historyScope === "lead" && mc ? drafts.filter((d) => d.companyId === mc.companyId) : drafts),
    [drafts, historyScope, mc],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Modo do Estúdio" className="flex w-fit rounded-xl border border-line bg-surface p-1 text-sm">
          {(["escrever", "fila", "modelos"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 font-medium transition ${tab === t ? "bg-brand text-brand-on" : "text-muted hover:text-fg"}`}
            >
              {t === "escrever" ? "Central de abordagem" : t === "fila" ? `Fila (${queue.length})` : `Modelos (${templates.length})`}
            </button>
          ))}
        </div>

        {favoriteTemplates.length > 0 && tab === "escrever" && mc && !blocked && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow flex items-center gap-1 text-brand">
              <Star className="h-3 w-3 fill-current" aria-hidden /> Favoritos:
            </span>
            {favoriteTemplates.slice(0, 4).map((ft) => (
              <button
                key={ft.id}
                type="button"
                onClick={() => {
                  setObjective(ft.objective);
                  fromTemplate(ft.id);
                }}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:border-brand hover:text-brand"
              >
                {ft.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "fila" ? (
        <OutreachQueue
          items={queue}
          onPick={(it) => {
            setTab("escrever");
            pick(`d:${it.dealId}`);
            setObjective(it.objective);
          }}
        />
      ) : tab === "modelos" ? (
        <Templates
          templates={templates}
          onToggleFavorite={(t) => run(() => toggleFavoriteTemplateAction(t.id, !t.favorite), { ok: t.favorite ? "Removido dos favoritos." : "Marcado como favorito." })}
          onUse={(id) => {
            setTab("escrever");
            const tpl = templates.find((x) => x.id === id);
            if (tpl) setObjective(tpl.objective);
            if (mc) fromTemplate(id);
            else {
              setTemplateId(id);
              toast("Escolha uma empresa para preencher o modelo.");
            }
          }}
        />
      ) : (
        <>
        {justSent && nextInQueue && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm">
            <span>
              Registrado! Próximo da fila: <b>{nextInQueue.companyName}</b> — <span className="text-muted">{nextInQueue.reason}</span>
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                pick(`d:${nextInQueue.dealId}`);
                setObjective(nextInQueue.objective);
              }}
            >
              Próximo da fila <Check className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
          {/* Coluna esquerda: Contexto automático + Estilo */}
          <div className="space-y-4">
            <SectionCard title="1 · Lead e contexto automático">
              <div className="space-y-2.5">
                {options.length > 10 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
                    <input
                      type="search"
                      className="input pl-8 text-xs"
                      placeholder="Filtrar empresa ou oportunidade…"
                      value={leadFilter}
                      onChange={(e) => setLeadFilter(e.target.value)}
                      aria-label="Filtrar empresas"
                    />
                  </div>
                )}
                <Field label="Empresa ou oportunidade">
                  <select className="input" value={sel} onChange={(e) => pick(e.target.value)} aria-label="Empresa ou oportunidade">
                    <option value="">Escolha…</option>
                    {filteredOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {loadingCtx && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando Radar, presença digital e histórico…
                </p>
              )}

              {mc && blocked && (
                <p className="mt-3 flex gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{mc.blockedReason} Envio e geração estão bloqueados para este contato.</span>
                </p>
              )}

              {mc && !blocked && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  {/* Resumo do negócio */}
                  <div className="rounded-xl border border-line bg-background p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/empresas/${mc.companyId}`} className="block truncate text-sm font-semibold text-fg hover:text-brand hover:underline">
                          {mc.companyName}
                        </Link>
                        <p className="mt-0.5 text-muted">
                          {categoryLabel(mc.category)}
                          {mc.city ? ` · ${mc.city}` : ""}
                          {mc.dealStageLabel ? ` · ${mc.dealStageLabel}` : ""}
                        </p>
                      </div>
                      {mc.dealId && (
                        <Link href={`/crm?deal=${mc.dealId}`} className="shrink-0 text-brand hover:underline">
                          Abrir CRM
                        </Link>
                      )}
                    </div>

                    {/* Presença digital detectada */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {presenceBadges(mc).map((b) => (
                        <Badge key={b.label} tone={b.tone}>
                          {b.label}
                        </Badge>
                      ))}
                      {mc.presence.website && (
                        <a href={mc.presence.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-brand hover:underline">
                          <Globe className="h-3 w-3" /> Site
                        </a>
                      )}
                      {mc.presence.instagram && (
                        <a href={mc.presence.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-info hover:underline">
                          <AtSign className="h-3 w-3" /> Instagram
                        </a>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setReplySummary("");
                          setReplyRaw("");
                          setReplyStop(false);
                          setReplyStage("conversa");
                          setReplyFollowDays(2);
                          setReplyAdvance(true);
                          setReplyOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-fg hover:border-brand hover:text-brand"
                      >
                        <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Cliente respondeu
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFollowTitle(mc.nextStep || `Follow-up — ${mc.companyName}`);
                          setFollowOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-fg hover:border-brand hover:text-brand"
                      >
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Agendar follow-up
                      </button>
                    </div>
                  </div>

                  {plan && (
                    <div className="rounded-xl border border-brand/30 bg-brand-soft p-3 text-xs">
                      <p className="eyebrow text-brand">Sugestão de abordagem</p>
                      <p className="mt-1 text-fg">
                        <b>{labelOf(MESSAGE_OBJECTIVES, plan.objective)}</b> — {plan.reason}
                      </p>
                      {objective !== plan.objective && (
                        <button type="button" className="btn btn-primary btn-sm mt-2" onClick={() => setObjective(plan.objective)}>
                          Usar “{labelOf(MESSAGE_OBJECTIVES, plan.objective)}”
                        </button>
                      )}
                    </div>
                  )}

                  <Field label="Destinatário / canal">
                    {mc.recipients.length === 0 ? (
                      <p className="text-xs text-muted">Sem telefone/canal cadastrado. Adicione na ficha da empresa.</p>
                    ) : (
                      <select className="input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                        {mc.recipients.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Sinais do Radar (inclua os que quiser citar)</p>
                    {mc.facts.length === 0 ? (
                      <p className="text-xs text-muted">Nenhum sinal auditado. A IA não inventa defeitos — adicione abaixo só o que você observou.</p>
                    ) : (
                      <ul className="space-y-1">
                        {mc.facts.map((f) => (
                          <li key={f}>
                            <label className="flex cursor-pointer items-start gap-2 text-xs sm:text-sm">
                              <input
                                type="checkbox"
                                className="mt-1 accent-[var(--brand)]"
                                checked={facts.includes(f)}
                                onChange={(e) => setFacts((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))}
                              />
                              <span>{f}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-[11px] text-muted">Origem: {mc.origin ?? "cadastro direto (sem citação de mapa)"}.</p>
                  </div>

                  <Field label="Observação pessoal (opcional)" hint="Ex.: cardápio só em PDF nos destaques, sem link de agenda.">
                    <textarea
                      className="input"
                      rows={2}
                      value={observation}
                      onChange={(e) => setObservation(e.target.value)}
                      placeholder="Algo específico que você confirmou sobre esta empresa…"
                    />
                  </Field>
                </div>
              )}
            </SectionCard>

            <SectionCard title="2 · Objetivo, tom e tamanho">
              <div className="space-y-3">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">Objetivo da abordagem</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CORE_OBJECTIVES.map((id) => {
                      const on = objective === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setObjective(id);
                            setTemplateId("");
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            on ? "border-brand bg-brand text-brand-on" : "border-line bg-surface text-fg/85 hover:border-line-strong"
                          }`}
                        >
                          {OBJECTIVE_SHORT[id]}
                        </button>
                      );
                    })}
                    <select
                      aria-label="Outros objetivos"
                      value={(CORE_OBJECTIVES as readonly string[]).includes(objective) ? "" : objective}
                      onChange={(e) => {
                        if (e.target.value) {
                          setObjective(e.target.value);
                          setTemplateId("");
                        }
                      }}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted hover:text-fg"
                    >
                      <option value="">Outros…</option>
                      {MESSAGE_OBJECTIVES.filter((o) => !(CORE_OBJECTIVES as readonly string[]).includes(o.id)).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">Tamanho da mensagem</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {MESSAGE_LENGTHS.map((l) => {
                      const on = length === l.id;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          aria-pressed={on}
                          title={l.hint}
                          onClick={() => setLength(l.id)}
                          className={`rounded-xl border px-2 py-1.5 text-center transition ${
                            on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface text-muted hover:text-fg"
                          }`}
                        >
                          <span className="block text-xs">{l.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Serviço ofertado">
                    <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
                      <option value="">—</option>
                      {serviceOptions.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tom">
                    <select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
                      {MESSAGE_TONES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Canal">
                    <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">E-mail</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </Field>
                  <Field label="Modelo salvo">
                    <select className="input" value={templateId} onChange={(e) => e.target.value && fromTemplate(e.target.value)} disabled={!mc || blocked}>
                      <option value="">{templatesForObjective.length ? "Escolher modelo…" : "Sem modelo"}</option>
                      {templatesForObjective.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.favorite ? "★ " : ""}
                          {t.name}
                          {service && t.service === service ? " · oferta" : ""} (v{t.version})
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {recommendedTemplate && mc && !blocked && (
                  <button type="button" onClick={() => fromTemplate(recommendedTemplate.id)} className="text-xs font-medium text-brand hover:underline">
                    Preencher com modelo recomendado ({recommendedTemplate.name})
                  </button>
                )}

                {cold && (
                  <label className="flex cursor-pointer items-start gap-2 text-xs sm:text-sm">
                    <input type="checkbox" className="mt-1 accent-[var(--brand)]" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />
                    <span>Incluir aviso de saída: “{OPT_OUT_LINE}”</span>
                  </label>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Coluna direita: Geração com Gemini + Editor + Envio + Histórico */}
          <div className="space-y-4">
            <SectionCard
              title="3 · Gerar com Gemini (até 3 versões humanizadas)"
              action={
                ai.enabled ? (
                  <span className="font-mono text-[11px] text-muted">
                    {ai.model} · {usedAi}/{ai.dailyLimit} hoje
                  </span>
                ) : (
                  <Badge>Gemini desativado</Badge>
                )
              }
            >
              {!ai.enabled ? (
                <div className="space-y-2.5">
                  <p className="text-sm font-medium">Ative o Gemini gratuito em 2 minutos</p>
                  <GeminiSetupGuide compact />
                  <p className="text-xs text-muted">
                    Depois use <Link href="/configuracoes" className="text-brand underline">Configurações → Testar conexão</Link>. Enquanto isso, o editor manual, os modelos, a fila e a leitura de respostas por regras continuam funcionando.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-primary btn-sm" disabled={!mc || blocked || aiBusy} onClick={askAi}>
                      {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : variants.length ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      {aiBusy ? "Escrevendo versões…" : variants.length ? "Regenerar 3 versões" : "Gerar 3 versões personalizadas"}
                    </button>
                    {!mc && <span className="text-xs text-muted">Selecione um lead à esquerda para gerar com o contexto real.</span>}
                  </div>
                  {aiError && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{aiError}</p>}
                  {variants.length > 0 && (
                    <div className="mt-3 grid gap-2.5 md:grid-cols-3">
                      {variants.map((v, i) => (
                        <div key={i} className="flex flex-col justify-between rounded-xl border border-line bg-elevated p-3">
                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="eyebrow text-brand">Versão {i + 1}</span>
                              {v.warnings.length > 0 && <Badge tone="warn">Revisar</Badge>}
                            </div>
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{v.text}</p>
                            {v.warnings.length > 0 && <p className="mt-2 text-[11px] text-warn">Atenção: {v.warnings.join("; ")}.</p>}
                          </div>
                          <div className="mt-3 flex gap-1.5 border-t border-line pt-2">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm flex-1 justify-center"
                              onClick={() => {
                                setText(v.text);
                                setOrigin("ia");
                              }}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden /> Usar
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyText(v.text, `Versão ${i + 1} copiada.`)} aria-label={`Copiar versão ${i + 1}`}>
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2.5 text-[11px] text-muted">
                    O Gemini recebe apenas contexto comercial anonimizado (segmento, cidade, presença digital, sinais do Radar e resumo do histórico — sem telefones, e-mails ou nomes pessoais).
                  </p>
                </>
              )}
            </SectionCard>

            <SectionCard
              title="4 · Revisar e enviar"
              action={
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {wordCount} palavras · {charCount} caracteres
                </span>
              }
            >
              <textarea
                className="input min-h-[190px] text-[15px] leading-relaxed"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setOrigin("manual");
                }}
                placeholder="Escreva do zero, escolha um modelo ou gere até 3 versões acima. Você revisa tudo antes de abrir o WhatsApp."
                aria-label="Texto da mensagem"
                disabled={blocked}
              />
              {ai.enabled && !blocked && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Refinar texto com IA">
                  <span className="eyebrow flex items-center gap-1 text-brand">
                    <Wand2 className="h-3 w-3" aria-hidden /> Refinar com IA:
                  </span>
                  {REFINE_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!text.trim() || !!refining}
                      onClick={() => askRefine(a.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refining === a.id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                      {a.label}
                    </button>
                  ))}
                  {prevText !== null && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-warn/50 px-2.5 py-1 text-xs font-medium text-warn hover:bg-warn/10"
                      onClick={() => {
                        setText(prevText);
                        setPrevText(null);
                      }}
                    >
                      <Undo2 className="h-3 w-3" aria-hidden /> Desfazer
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted">Variáveis aceitas em modelos: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}</p>

              {awaiting ? (
                <div className="mt-3 space-y-2.5 rounded-xl border border-brand/30 bg-brand-soft p-3.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-fg">Você enviou a mensagem?</span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted">Agendar follow-up:</span>
                      {[
                        [1, "Amanhã"],
                        [3, "3 dias"],
                        [7, "7 dias"],
                        [0, "Sem tarefa"],
                      ].map(([d, label]) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setFollowUpDays(Number(d))}
                          className={`rounded-md border px-2 py-0.5 transition ${followUpDays === d ? "border-brand bg-brand text-brand-on" : "border-line bg-surface text-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setAwaiting(null);
                        setConfirmKey(null);
                      }}
                    >
                      Ainda não
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            registerSentAction({
                              draft: draftInput(),
                              draftId: activeDraftId,
                              idempotencyKey: confirmKey,
                              channel: awaiting,
                              followUpDays,
                            }),
                          {
                            ok: followUpDays > 0 ? `Envio registrado e follow-up agendado para ${followUpDays} dia(s).` : "Envio registrado no histórico.",
                            onOk: () => {
                              setAwaiting(null);
                              setConfirmKey(null);
                              setActiveDraftId(null);
                              setText("");
                              setVariants([]);
                              setPrevText(null);
                              setJustSent(true);
                            },
                          },
                        )
                      }
                    >
                      Sim, registrar no histórico
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!text.trim() || blocked || !recipient?.waDigits || channel !== "whatsapp"}
                    onClick={openWhatsapp}
                    title={channel !== "whatsapp" ? "Escolha o canal WhatsApp" : !recipient?.waDigits ? "Sem celular para WhatsApp" : undefined}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden /> Abrir no WhatsApp
                  </button>
                  {channel === "email" && recipient?.kind === "email" && !blocked && (
                    <a
                      className={`btn btn-ghost ${!text.trim() ? "pointer-events-none opacity-50" : ""}`}
                      href={`mailto:${recipient.value}?subject=${encodeURIComponent(`Ideia para ${mc?.companyName ?? ""}`)}&body=${encodeURIComponent(text)}`}
                      onClick={() => startAwaiting("email")}
                    >
                      <Mail className="h-4 w-4" aria-hidden /> Abrir e-mail
                    </a>
                  )}
                  {channel === "instagram" && recipient?.kind === "instagram" && !blocked && (
                    <a
                      className="btn btn-ghost"
                      href={recipient.value}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        void copyText(text);
                        startAwaiting("instagram");
                      }}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden /> Copiar e abrir perfil
                    </a>
                  )}
                  <button type="button" className="btn btn-ghost" disabled={!text.trim()} onClick={() => void copyText(text)}>
                    <Copy className="h-4 w-4" aria-hidden /> Copiar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!text.trim() || !mc || blocked || pending}
                    onClick={() => run(() => saveDraftAction(draftInput(), activeDraftId), { ok: "Rascunho salvo.", onOk: (saved) => setActiveDraftId(saved.id) })}
                  >
                    <Save className="h-4 w-4" aria-hidden /> Salvar rascunho
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!text.trim() || pending}
                    onClick={() => {
                      setTplName("");
                      setTplFav(true);
                      setSaveTpl(true);
                    }}
                  >
                    <Bookmark className="h-4 w-4" aria-hidden /> Salvar modelo
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!text.trim() || !mc || blocked || pending}
                    onClick={() => startAwaiting(channel)}
                    title="Use se você enviou manualmente fora desta tela"
                  >
                    Já enviei por fora
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">Nada é disparado automaticamente: você abre o WhatsApp com o texto pronto e confirma o registro aqui.</p>
            </SectionCard>

            {/* Histórico do lead + Rascunhos/envios */}
            <SectionCard
              title="Histórico e rascunhos"
              action={
                mc && (
                  <div className="flex rounded-lg border border-line p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryScope("lead")}
                      className={`rounded-md px-2 py-0.5 ${historyScope === "lead" ? "bg-brand-soft font-medium text-brand" : "text-muted"}`}
                    >
                      Só este lead
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryScope("todos")}
                      className={`rounded-md px-2 py-0.5 ${historyScope === "todos" ? "bg-brand-soft font-medium text-brand" : "text-muted"}`}
                    >
                      Todos
                    </button>
                  </div>
                )
              }
            >
              {mc && historyScope === "lead" && (
                <div className="mb-4">
                  <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                    <History className="h-3 w-3" aria-hidden /> Atividades recentes — {mc.companyName}
                  </h3>
                  {mc.recentHistory.length === 0 ? (
                    <p className="text-xs text-muted">Nenhuma interação registrada para este lead ainda.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {mc.recentHistory.map((h) => (
                        <li key={h.id} className="rounded-lg border border-line bg-background px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2 text-muted">
                            <span className="font-medium text-fg">
                              {ACTIVITY_LABEL[h.kind] ?? h.kind}
                              {h.channel ? ` · ${h.channel}` : ""}
                            </span>
                            <span>{fmtDateTime(h.occurredAt)}</span>
                          </div>
                          {h.content && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted">{h.content}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <h3 className="eyebrow mb-2">{historyScope === "lead" && mc ? "Rascunhos e envios deste lead" : "Rascunhos e envios recentes"}</h3>
              {visibleDrafts.length === 0 ? (
                <p className="text-sm text-muted">Nenhum rascunho ou envio encontrado neste filtro.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {visibleDrafts.map((d) => (
                    <li key={d.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-fg">{d.companyName ?? "Sem empresa vinculada"}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{d.body}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {labelOf(MESSAGE_OBJECTIVES, d.objective)} · {fmtDateTime(d.sentAt ?? d.createdAt)}
                        </p>
                      </div>
                      <Badge tone={d.status === "enviada" ? "ok" : "neutral"}>{d.status === "enviada" ? "enviada" : "rascunho"}</Badge>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setText(d.body);
                          setActiveDraftId(d.status === "rascunho" ? d.id : null);
                          setObjective(d.objective);
                          setOrigin("manual");
                          setTab("escrever");
                        }}
                      >
                        Abrir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
        </>
      )}

      {/* Dialog: consentimento Gemini */}
      <Dialog
        open={!!consentCb}
        onClose={() => setConsentCb(null)}
        title="Usar o Gemini neste texto"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConsentCb(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                try {
                  localStorage.setItem("mglabs-ai-consent", "1");
                } catch {
                  /* ok */
                }
                const cb = consentCb;
                setConsentCb(null);
                cb?.();
              }}
            >
              Autorizar e continuar
            </button>
          </>
        }
      >
        <p className="text-sm">
          Para gerar, refinar ou analisar uma resposta, o servidor envia ao Gemini apenas contexto comercial anonimizado: segmento, cidade, presença digital, sinais marcados do Radar, resumo das últimas interações, sua observação e o texto em questão.
        </p>
        <p className="mt-2 text-sm text-muted">Telefones, e-mails, links, perfis e nomes pessoais são removidos ou trocados por marcadores antes do envio e restaurados só aqui. No plano gratuito do Google, o conteúdo pode ser usado para melhorar produtos — por isso nada pessoal vai junto.</p>
      </Dialog>

      {/* Dialog: salvar modelo / favorito */}
      <Dialog
        open={saveTpl}
        onClose={() => setSaveTpl(false)}
        title="Salvar como modelo"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSaveTpl(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!tplName.trim() || pending}
              onClick={() =>
                run(
                  () =>
                    saveTemplateAction(null, {
                      name: tplName,
                      objective: objective as "primeiro_contato",
                      service: service || null,
                      tone: tone as "natural",
                      channel,
                      body: cold ? text.replace(OPT_OUT_LINE, "").trim() : text,
                      favorite: tplFav,
                    }),
                  { ok: "Modelo salvo.", onOk: () => setSaveTpl(false) },
                )
              }
            >
              Salvar modelo
            </button>
          </>
        }
      >
        <Field label="Nome do modelo">
          <input autoFocus className="input" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex.: Abordagem rápida — site desatualizado" />
        </Field>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--brand)]" checked={tplFav} onChange={(e) => setTplFav(e.target.checked)} />
          <span>Marcar como modelo favorito (acesso rápido no topo)</span>
        </label>
        <p className="mt-2 text-xs text-muted">Você pode usar variáveis como {"{{empresa}}"}, {"{{contato}}"} e {"{{servico}}"} para reaproveitar em outros leads.</p>
      </Dialog>

      {/* Dialog: registrar resposta do cliente (com assistente) */}
      <Dialog
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        title="Resposta do cliente"
        wide
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setReplyOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!mc || !(replySummary.trim() || replyRaw.trim()) || pending}
              onClick={() =>
                mc &&
                run(
                  async () => {
                    const r = await recordReplyAction({
                      companyId: mc.companyId,
                      dealId: mc.dealId,
                      contactId: recipient?.contactId ?? mc.contactId,
                      channel: channel === "whatsapp" || channel === "email" || channel === "instagram" ? channel : "whatsapp",
                      summary: (replySummary.trim() || replyRaw.trim()).slice(0, 2000),
                      advanceToConversation: false,
                      followUpDays: replyStop ? 0 : replyFollowDays,
                    });
                    // só avança de etapa se o usuário deixou marcado (nunca volta etapa, nunca fecha negócio)
                    if (r.ok && mc.dealId && replyAdvance && replyStage && replyStage !== "perdido") await advanceDealAction(mc.dealId, replyStage);
                    return r;
                  },
                  {
                    ok: "Resposta registrada no histórico.",
                    onOk: () => {
                      setReplyOpen(false);
                      void loadCtx(sel);
                    },
                  },
                )
              }
            >
              Salvar no histórico
            </button>
          </>
        }
      >
        {mc && (
          <div className="space-y-4">
            <ReplyAssistant
              dealId={mc.dealId}
              companyId={mc.companyId}
              contactId={recipient?.contactId ?? mc.contactId}
              aiEnabled={ai.enabled}
              withConsent={withConsent}
              text={replyRaw}
              setText={setReplyRaw}
              onOutcome={(o: ReplyOutcome) => {
                setReplyStop(o.stop);
                setReplyStage(o.stage);
                setReplyFollowDays(o.followUpDays > 0 ? Math.min(o.followUpDays, 30) : 0);
                setReplyAdvance(!o.stop && !!o.stage && o.stage !== "perdido");
                if (o.summary) setReplySummary(o.summary);
              }}
              onUseDraft={(t) => {
                setText(t);
                setOrigin("ia");
                setObjective("resposta_interesse");
                setReplyOpen(false);
                toast("Resposta colocada no editor. Revise antes de enviar.");
              }}
              onOptOut={() =>
                run(() => optOutCompanyAction(mc.companyId, "Pediu para parar de receber mensagens", recipient?.contactId ?? mc.contactId), {
                  ok: "Contato marcado como “não contatar”.",
                  onOk: () => {
                    setReplyOpen(false);
                    void loadCtx(sel);
                  },
                })
              }
            />

            <div className="space-y-3 border-t border-line pt-3">
              <Field label="Resumo para o histórico (opcional — se vazio, vai o texto colado)">
                <textarea className="input" rows={2} value={replySummary} onChange={(e) => setReplySummary(e.target.value)} placeholder="Ex.: Pediu valores e exemplos de sites feitos na área." />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Próximo retorno">
                  <select className="input" value={replyFollowDays} disabled={replyStop} onChange={(e) => setReplyFollowDays(Number(e.target.value))}>
                    {[...new Set([1, 2, 3, 7, replyFollowDays])]
                      .filter((d) => d > 0)
                      .sort((x, y) => x - y)
                      .map((d) => (
                        <option key={d} value={d}>
                          {d === 1 ? "Amanhã (1 dia)" : `Em ${d} dias`}
                        </option>
                      ))}
                    <option value={0}>Não agendar tarefa</option>
                  </select>
                </Field>
                {mc.dealId && replyStage && replyStage !== "perdido" && !replyStop && (
                  <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                    <input type="checkbox" className="accent-[var(--brand)]" checked={replyAdvance} onChange={(e) => setReplyAdvance(e.target.checked)} />
                    <span>Avançar CRM para “{STAGE_DEFS.find((st) => st.key === replyStage)?.label ?? replyStage}” (só se for adiante)</span>
                  </label>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Dialog: agendar follow-up rápido */}
      <Dialog
        open={followOpen}
        onClose={() => setFollowOpen(false)}
        title="Agendar follow-up"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFollowOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!mc || !followTitle.trim() || pending}
              onClick={() =>
                mc &&
                run(
                  () =>
                    scheduleFollowUpAction({
                      companyId: mc.companyId,
                      dealId: mc.dealId,
                      title: followTitle,
                      days: followModalDays,
                      priority: "media",
                    }),
                  {
                    ok: `Follow-up agendado para ${followModalDays} dia(s).`,
                    onOk: () => {
                      setFollowOpen(false);
                      void loadCtx(sel);
                    },
                  },
                )
              }
            >
              Agendar retorno
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Ação de retorno">
            <input autoFocus className="input" value={followTitle} onChange={(e) => setFollowTitle(e.target.value)} />
          </Field>
          <Field label="Prazo">
            <select className="input" value={followModalDays} onChange={(e) => setFollowModalDays(Number(e.target.value))}>
              <option value={1}>Amanhã (1 dia)</option>
              <option value={2}>Daqui a 2 dias</option>
              <option value={3}>Daqui a 3 dias</option>
              <option value={5}>Daqui a 5 dias</option>
              <option value={7}>Daqui a 1 semana</option>
              <option value={14}>Daqui a 2 semanas</option>
            </select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function Templates({ templates, onUse, onToggleFavorite }: { templates: Template[]; onUse: (id: string) => void; onToggleFavorite: (t: Template) => void }) {
  const { run, pending } = useRun();
  const [edit, setEdit] = useState<Template | "novo" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Modelos editáveis e favoritos. Cada edição de texto cria uma nova versão.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit("novo")}>
          Novo modelo
        </button>
      </div>
      {templates.length === 0 ? (
        <EmptyState title="Nenhum modelo" description="Crie um modelo ou salve uma mensagem pelo editor." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onToggleFavorite(t)}
                    aria-label={t.favorite ? `Remover ${t.name} dos favoritos` : `Favoritar ${t.name}`}
                    className={`rounded p-1 transition ${t.favorite ? "text-warn" : "text-muted hover:text-fg"}`}
                  >
                    <Star className={`h-4 w-4 ${t.favorite ? "fill-current" : ""}`} />
                  </button>
                  <h3 className="truncate text-sm font-semibold">{t.name}</h3>
                </div>
                <Badge>{labelOf(MESSAGE_OBJECTIVES, t.objective)}</Badge>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{t.body}</p>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onUse(t.id)}>
                  Usar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}>
                  Editar
                </button>
                <ConfirmButton
                  className="btn btn-danger btn-sm ml-auto"
                  ariaLabel={`Excluir modelo ${t.name}`}
                  onConfirm={() => run(() => deleteTemplateAction(t.id), { ok: "Modelo removido." })}
                  disabled={pending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
                <span className="text-xs text-muted">v{t.version}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <TemplateDialog key={edit === "novo" ? "novo" : edit?.id ?? "x"} edit={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function TemplateDialog({ edit, onClose }: { edit: Template | "novo" | null; onClose: () => void }) {
  const { run, pending } = useRun();
  const t = edit && edit !== "novo" ? edit : null;
  const [f, setF] = useState({ name: t?.name ?? "", objective: t?.objective ?? "primeiro_contato", body: t?.body ?? "", favorite: t?.favorite ?? false });
  return (
    <Dialog open={edit !== null} onClose={onClose} title={t ? "Editar modelo" : "Novo modelo"} wide>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveTemplateAction(t?.id ?? null, { name: f.name, objective: f.objective as "primeiro_contato", channel: "whatsapp", body: f.body, favorite: f.favorite }), {
            ok: "Modelo salvo.",
            onOk: onClose,
          });
        }}
      >
        <Field label="Nome">
          <input required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Objetivo">
          <select className="input" value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })}>
            {MESSAGE_OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--brand)]" checked={f.favorite} onChange={(e) => setF({ ...f, favorite: e.target.checked })} />
          <span>Modelo favorito</span>
        </label>
        <Field label="Texto" hint={`Variáveis: ${TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}. Linhas com variável vazia são omitidas.`}>
          <textarea required className="input" rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={pending}>
            Salvar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

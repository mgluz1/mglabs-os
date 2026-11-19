"use client";

import { Bookmark, Copy, ExternalLink, Loader2, Mail, MessageCircle, Save, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Badge, EmptyState, Field, SectionCard } from "@/components/ui/kit";
import { ConfirmButton, Dialog, useRun, useToast } from "@/components/ui/overlays";
import { generateMessagesAction } from "@/lib/actions/ai";
import { messageContextAction, registerSentAction, saveDraftAction, saveTemplateAction, deleteTemplateAction, whatsappLinkAction } from "@/lib/actions/messages";
import { MESSAGE_OBJECTIVES, MESSAGE_TONES, labelOf } from "@/lib/config/crm";
import { fmtDateTime } from "@/lib/dates";
import { COLD_OBJECTIVES, OPT_OUT_LINE, buildTemplateText, pickTemplateForOffer, TEMPLATE_VARIABLES } from "@/lib/messages";
import type { MessageContext } from "@/lib/services/messages";

export type Opt = { value: string; label: string };
type Template = { id: string; name: string; objective: string; service: string | null; tone: string | null; channel: string; body: string; version: number };
type Draft = { id: string; objective: string; body: string; status: string; origin: string; createdAt: Date; companyId: string | null };
type Variant = { text: string; warnings: string[] };
type Channel = "whatsapp" | "email" | "instagram";

export function MessageStudio({ options, templates, drafts, services, sender, ai, initial, initialContext, initialService = "" }: { options: Opt[]; templates: Template[]; drafts: Draft[]; services: string[]; sender: string; ai: { enabled: boolean; model: string; dailyLimit: number; usedToday: number }; initial: string; initialContext: MessageContext | null; initialService?: string }) {
  const { run, pending } = useRun();
  const toast = useToast();
  const [tab, setTab] = useState<"escrever" | "modelos">("escrever");
  const [sel, setSel] = useState(initial);
  const [mc, setMc] = useState<MessageContext | null>(initialContext);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [objective, setObjective] = useState("primeiro_contato");
  const [service, setService] = useState(initialContext?.serviceType ?? initialService);
  const [tone, setTone] = useState("natural");
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
  const [consentOpen, setConsentOpen] = useState(false);
  const [awaiting, setAwaiting] = useState<Channel | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [saveTpl, setSaveTpl] = useState(false);
  const [tplName, setTplName] = useState("");

  const loadCtx = useCallback(async (value: string) => {
    if (!value) { setMc(null); return; }
    setLoadingCtx(true);
    const r = await messageContextAction(value.startsWith("d:") ? { dealId: value.slice(2) } : { companyId: value.slice(2) });
    setLoadingCtx(false);
    if (!r.ok) { toast(r.error, "error"); setMc(null); return; }
    setMc(r.data);
    setFacts(r.data.facts);
    setRecipientId(r.data.recipients[0]?.id ?? "");
    setService(r.data.serviceType ?? "");
  }, [toast]);

  const pick = (value: string) => {
    setSel(value);
    setVariants([]);
    setActiveDraftId(null);
    setAwaiting(null);
    setConfirmKey(null);
    void loadCtx(value);
  };

  const recipient = mc?.recipients.find((r) => r.id === recipientId) ?? null;
  const templatesForObjective = useMemo(() => {
    const list = templates.filter((t) => t.objective === objective);
    return [...list].sort((a, b) => {
      const aMatch = service && a.service === service ? 1 : 0;
      const bMatch = service && b.service === service ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [templates, objective, service]);
  const recommendedTemplate = useMemo(() => pickTemplateForOffer(templates, objective, service), [templates, objective, service]);
  const serviceOptions = useMemo(() => (service && !services.includes(service) ? [service, ...services] : services), [services, service]);
  const cold = (COLD_OBJECTIVES as string[]).includes(objective);
  const blocked = !!mc?.blocked;

  const fromTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t || !mc) return;
    setTemplateId(id);
    setText(buildTemplateText(t.body, { empresa: mc.companyName, contatoNome: mc.contactName, remetente: sender, servico: service || mc.serviceType, cidade: mc.city, observacao: observation || null, origem: mc.origin }, objective, optOut));
    setOrigin("modelo");
  };

  const generate = async () => {
    if (!mc) return;
    setAiBusy(true);
    const r = await generateMessagesAction({ dealId: mc.dealId, companyId: mc.companyId, contactId: mc.contactId, objective, service: service || null, tone, observation: observation || null, useFacts: facts, count: 3, optOut, consent: true });
    setAiBusy(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    setVariants(r.data);
  };
  const askAi = () => {
    let ok = false;
    try { ok = localStorage.getItem("mglabs-ai-consent") === "1"; } catch { /* sem armazenamento: pergunta sempre */ }
    if (ok) void generate(); else setConsentOpen(true);
  };

  const draftInput = () => ({
    dealId: mc?.dealId ?? null, companyId: mc?.companyId ?? null, contactId: recipient?.contactId ?? mc?.contactId ?? null,
    objective: objective as "primeiro_contato", service: service || null, tone: tone as "natural", channel, body: text, origin, templateId: templateId || null, facts: facts.length ? facts : null,
  });

  const startAwaiting = (ch: Channel) => {
    setAwaiting(ch);
    setConfirmKey((prev) => prev ?? crypto.randomUUID());
  };

  const openWhatsapp = async () => {
    if (!mc || !recipient?.waDigits) return;
    const r = await whatsappLinkAction({ companyId: mc.companyId, contactId: recipient.contactId, phone: recipient.value, text });
    if (!r.ok) { toast(r.error, "error"); return; }
    window.open(r.data, "_blank", "noopener,noreferrer");
    startAwaiting("whatsapp");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Mensagem copiada."); } catch { toast("Não foi possível copiar automaticamente.", "error"); }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex w-fit rounded-lg border border-line p-0.5 text-sm">
        {(["escrever", "modelos"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-4 py-1.5 capitalize ${tab === t ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>{t === "escrever" ? "Escrever" : `Modelos (${templates.length})`}</button>)}
      </div>

      {tab === "modelos" ? (
        <Templates templates={templates} onUse={(id) => { setTab("escrever"); if (mc) fromTemplate(id); else { setTemplateId(id); toast("Escolha uma empresa para preencher o modelo."); } }} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <SectionCard title="1 · Para quem">
              <Field label="Empresa ou oportunidade">
                <select className="input" value={sel} onChange={(e) => pick(e.target.value)} aria-label="Empresa ou oportunidade">
                  <option value="">Escolha…</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {loadingCtx && <p className="mt-2 flex items-center gap-2 text-xs text-muted"><Loader2 className="h-3 w-3 animate-spin" /> Carregando dados verificados…</p>}
              {mc && blocked && <p className="mt-3 flex gap-2 rounded-lg bg-danger/10 p-3 text-sm text-danger"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{mc.blockedReason} A escrita e os botões de contato estão bloqueados para este negócio.</span></p>}
              {mc && !blocked && (
                <div className="mt-3 space-y-3">
                  <Field label="Enviar para">
                    {mc.recipients.length === 0 ? <p className="text-xs text-muted">Sem canal cadastrado. Adicione telefone ou contato na ficha da empresa.</p> : (
                      <select className="input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>{mc.recipients.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                    )}
                  </Field>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Fatos verificados sobre o negócio</p>
                    {mc.facts.length === 0 ? <p className="text-xs text-muted">Nenhum fato auditado. A IA não vai inventar nenhum — escreva abaixo algo que você sabe e confirmou.</p> : (
                      <ul className="space-y-1">{mc.facts.map((f) => <li key={f}><label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={facts.includes(f)} onChange={(e) => setFacts((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))} /><span>{f}</span></label></li>)}</ul>
                    )}
                    <p className="mt-1 text-[11px] text-muted">Origem do contato: {mc.origin ?? "não informada (a mensagem não cita como encontramos)"}.</p>
                  </div>
                  <Field label="Observação sua (opcional)" hint="Só o que você sabe e confirmou. Evite nomes de pessoas e dados pessoais."><textarea className="input" rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Ex.: o Instagram deles tem agenda aberta pelo direct." /></Field>
                </div>
              )}
            </SectionCard>

            <SectionCard title="2 · Objetivo e estilo">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Objetivo" className="sm:col-span-2"><select className="input" value={objective} onChange={(e) => { setObjective(e.target.value); setTemplateId(""); }}>{MESSAGE_OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
                <Field label="Serviço ofertado"><select className="input" value={service} onChange={(e) => setService(e.target.value)}><option value="">—</option>{serviceOptions.map((s) => <option key={s}>{s}</option>)}</select></Field>
                <Field label="Tom"><select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>{MESSAGE_TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
                <Field label="Canal"><select className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="instagram">Instagram (rascunho)</option></select></Field>
                <Field label="Modelo salvo"><select className="input" value={templateId} onChange={(e) => e.target.value && fromTemplate(e.target.value)} disabled={!mc || blocked}><option value="">{templatesForObjective.length ? "Escolher modelo…" : "Sem modelo para este objetivo"}</option>{templatesForObjective.map((t) => <option key={t.id} value={t.id}>{t.name}{service && t.service === service ? " · da oferta" : ""} (v{t.version})</option>)}</select></Field>
              </div>
              {recommendedTemplate && mc && !blocked && (
                <button type="button" onClick={() => fromTemplate(recommendedTemplate.id)} className="mt-2 text-xs font-medium text-brand hover:underline">
                  Preencher com modelo recomendado ({recommendedTemplate.name})
                </button>
              )}
              {cold && <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} /><span>Incluir aviso de saída: “{OPT_OUT_LINE}”</span></label>}
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="3 · Mensagem" action={<span className="text-xs text-muted">{wordCount} palavras</span>}>
              <textarea className="input min-h-[190px] text-[15px] leading-relaxed" value={text} onChange={(e) => { setText(e.target.value); setOrigin("manual"); }} placeholder="Escreva do zero, monte a partir de um modelo ou gere variações com IA. Você revisa e edita livremente antes de usar." aria-label="Texto da mensagem" disabled={blocked} />
              <p className="mt-1 text-[11px] text-muted">Variáveis aceitas em modelos: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}</p>

              {awaiting ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm">
                  <span className="flex-1">Você enviou a mensagem?</span>
                  <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => registerSentAction({ draft: draftInput(), draftId: activeDraftId, idempotencyKey: confirmKey, channel: awaiting }), { ok: "Envio registrado no histórico. Follow-up agendado para daqui a 3 dias.", onOk: () => { setAwaiting(null); setConfirmKey(null); setActiveDraftId(null); setText(""); setVariants([]); } })}>Sim, registrar</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setAwaiting(null); setConfirmKey(null); }}>Não</button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-primary" disabled={!text.trim() || blocked || !recipient?.waDigits || channel !== "whatsapp"} onClick={openWhatsapp} title={channel !== "whatsapp" ? "Escolha o canal WhatsApp" : !recipient?.waDigits ? "Sem celular para WhatsApp" : undefined}><MessageCircle className="h-4 w-4" /> Abrir no WhatsApp</button>
                  {channel === "email" && recipient?.kind === "email" && !blocked && <a className={`btn btn-ghost ${!text.trim() ? "pointer-events-none opacity-50" : ""}`} href={`mailto:${recipient.value}?subject=${encodeURIComponent(`Ideia para ${mc?.companyName ?? ""}`)}&body=${encodeURIComponent(text)}`} onClick={() => startAwaiting("email")}><Mail className="h-4 w-4" /> Abrir e-mail</a>}
                  {channel === "instagram" && recipient?.kind === "instagram" && !blocked && <a className="btn btn-ghost" href={recipient.value} target="_blank" rel="noreferrer" onClick={() => { void copy(); startAwaiting("instagram"); }}><ExternalLink className="h-4 w-4" /> Copiar e abrir perfil</a>}
                  <button className="btn btn-ghost" disabled={!text.trim()} onClick={copy}><Copy className="h-4 w-4" /> Copiar</button>
                  <button className="btn btn-ghost" disabled={!text.trim() || !mc || blocked || pending} onClick={() => run(() => saveDraftAction(draftInput(), activeDraftId), { ok: "Rascunho salvo.", onOk: (saved) => setActiveDraftId(saved.id) })}><Save className="h-4 w-4" /> Salvar rascunho</button>
                  <button className="btn btn-ghost" disabled={!text.trim() || pending} onClick={() => { setTplName(""); setSaveTpl(true); }}><Bookmark className="h-4 w-4" /> Salvar como modelo</button>
                  <button className="btn btn-ghost" disabled={!text.trim() || !mc || blocked || pending} onClick={() => startAwaiting(channel)} title="Use se enviou por fora do app (ligação, e-mail, outro WhatsApp)">Já enviei por fora</button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">O MGLABS OS nunca envia nada sozinho: você abre o WhatsApp com o texto pronto e envia pelo seu aparelho. O histórico só é gravado depois da sua confirmação.</p>
            </SectionCard>

            <SectionCard title="Variações com IA (opcional)" action={ai.enabled ? <span className="text-xs text-muted">{ai.model} · {ai.usedToday}/{ai.dailyLimit} hoje</span> : <Badge>não configurada</Badge>}>
              {!ai.enabled ? (
                <p className="text-sm text-muted">A IA é opcional e está desligada (sem <code className="rounded bg-fg/8 px-1">GEMINI_API_KEY</code>). Tudo funciona normalmente com modelos e escrita manual.</p>
              ) : (
                <>
                  <button className="btn btn-ghost" disabled={!mc || blocked || aiBusy} onClick={askAi}>{aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {variants.length ? "Gerar outras 3 versões" : "Gerar 3 versões"}</button>
                  {variants.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {variants.map((v, i) => (
                        <li key={i} className="rounded-lg border border-line bg-elevated p-3">
                          <p className="whitespace-pre-wrap text-sm">{v.text}</p>
                          {v.warnings.length > 0 && <p className="mt-2 text-xs text-warn">Revise: {v.warnings.join("; ")}.</p>}
                          <button className="btn btn-ghost btn-sm mt-2" onClick={() => { setText(v.text); setOrigin("ia"); }}>Usar esta versão</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-muted">Sugestões são só rascunhos para você editar. Nenhum nome de pessoa, telefone ou e-mail é enviado ao Gemini.</p>
                </>
              )}
            </SectionCard>

            <SectionCard title="Rascunhos e envios recentes">
              {drafts.length === 0 ? <p className="text-sm text-muted">Nada por aqui ainda.</p> : (
                <ul className="divide-y divide-line">
                  {drafts.map((d) => (
                    <li key={d.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm">{d.body}</p><p className="mt-0.5 text-xs text-muted">{labelOf(MESSAGE_OBJECTIVES, d.objective)} · {fmtDateTime(d.createdAt)}</p></div>
                      <Badge tone={d.status === "enviada" ? "ok" : "neutral"}>{d.status === "enviada" ? "enviada" : "rascunho"}</Badge>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setText(d.body); setActiveDraftId(d.status === "rascunho" ? d.id : null); setOrigin("manual"); setTab("escrever"); }}>Abrir</button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} title="Usar o Gemini (plano gratuito)" footer={<><button className="btn btn-ghost" onClick={() => setConsentOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => { try { localStorage.setItem("mglabs-ai-consent", "1"); } catch { /* ok */ } setConsentOpen(false); void generate(); }}>Autorizar e gerar</button></>}>
        <p className="text-sm">Para gerar as versões, o app envia ao Gemini: nome do negócio, categoria, cidade, objetivo, tom, os fatos que você marcou e sua observação (com e-mails, telefones, links e @perfis removidos).</p>
        <p className="mt-2 text-sm text-muted">No plano gratuito, o Google pode usar entradas e saídas para melhorar produtos e revisá-las por pessoas. Não envia nomes de contatos, histórico, valores nem dados de clientes. Evite escrever dados pessoais na observação.</p>
      </Dialog>

      <Dialog open={saveTpl} onClose={() => setSaveTpl(false)} title="Salvar como modelo" footer={<><button className="btn btn-ghost" onClick={() => setSaveTpl(false)}>Cancelar</button><button className="btn btn-primary" disabled={!tplName.trim() || pending} onClick={() => run(() => saveTemplateAction(null, { name: tplName, objective: objective as "primeiro_contato", service: service || null, tone: tone as "natural", channel, body: cold ? text.replace(OPT_OUT_LINE, "").trim() : text }), { ok: "Modelo salvo.", onOk: () => setSaveTpl(false) })}>Salvar</button></>}>
        <Field label="Nome do modelo"><input autoFocus className="input" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex.: Primeiro contato — barbearias" /></Field>
        <p className="mt-2 text-xs text-muted">O texto atual vira o corpo do modelo. Troque nomes por variáveis como {"{{empresa}}"} e {"{{contato}}"} se quiser reaproveitar.</p>
      </Dialog>
    </div>
  );
}

function Templates({ templates, onUse }: { templates: Template[]; onUse: (id: string) => void }) {
  const { run, pending } = useRun();
  const [edit, setEdit] = useState<Template | "novo" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2"><p className="text-sm text-muted">Modelos editáveis com variáveis. Cada edição de texto cria uma nova versão.</p><button className="btn btn-primary btn-sm" onClick={() => setEdit("novo")}>Novo modelo</button></div>
      {templates.length === 0 ? <EmptyState title="Nenhum modelo" description="Crie um modelo ou salve uma mensagem pelo editor." /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{t.name}</h3><Badge>{labelOf(MESSAGE_OBJECTIVES, t.objective)}</Badge></div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{t.body}</p>
              <div className="mt-3 flex items-center gap-2"><button className="btn btn-primary btn-sm" onClick={() => onUse(t.id)}>Usar</button><button className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}>Editar</button><ConfirmButton className="btn btn-danger btn-sm ml-auto" onConfirm={() => run(() => deleteTemplateAction(t.id), { ok: "Modelo removido." })} disabled={pending}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton><span className="text-xs text-muted">v{t.version}</span></div>
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
  const [f, setF] = useState({ name: t?.name ?? "", objective: t?.objective ?? "primeiro_contato", body: t?.body ?? "" });
  return (
    <Dialog open={edit !== null} onClose={onClose} title={t ? "Editar modelo" : "Novo modelo"} wide>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveTemplateAction(t?.id ?? null, { name: f.name, objective: f.objective as "primeiro_contato", channel: "whatsapp", body: f.body }), { ok: "Modelo salvo.", onOk: onClose }); }}>
        <Field label="Nome"><input required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Objetivo"><select className="input" value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })}>{MESSAGE_OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
        <Field label="Texto" hint={`Variáveis: ${TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}. Linhas com variável vazia são omitidas.`}><textarea required className="input" rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending}>Salvar</button></div>
      </form>
    </Dialog>
  );
}


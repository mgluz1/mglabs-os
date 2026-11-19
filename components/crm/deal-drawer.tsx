"use client";

import { Check, FileText, FolderKanban, Loader2, MessageSquareText, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StageBadge, ScorePill } from "@/components/crm/common";
import { Badge, priorityTone } from "@/components/ui/kit";
import { Dialog, SlideOver, useRun, useToast } from "@/components/ui/overlays";
import { MoneyInput } from "@/components/ui/money-input";
import { nextActionAction, suggestTasksAction, summarizeDealAction } from "@/lib/actions/ai";
import { createProposalAction } from "@/lib/actions/business";
import { addNoteAction, convertDealAction, dealDetailAction, moveDealAction, optOutCompanyAction, updateDealAction } from "@/lib/actions/crm";
import { completeTaskAction, createTaskAction } from "@/lib/actions/tasks";
import { LOST_REASONS, SERVICE_TYPES, labelOf, PRIORITIES, PROPOSAL_STATUS, sourceLabel } from "@/lib/config/crm";
import { fmtDate, fmtDateTime, relativeDays, ymdSP, ymdToInstantSP } from "@/lib/dates";
import { brl, centsToInput, parseMoney } from "@/lib/money";
import { useNow } from "@/lib/use-now";
import type { StageOption } from "@/components/crm/crm-client";

type Detail = Extract<Awaited<ReturnType<typeof dealDetailAction>>, { ok: true }>["data"];
type Tab = "geral" | "historico" | "tarefas" | "propostas";
const KIND_LABEL: Record<string, string> = { nota: "Nota", etapa: "Etapa", mensagem_enviada: "Mensagem registrada", ligacao: "Ligação", resposta: "Resposta do cliente", reuniao: "Reunião", tarefa: "Tarefa", proposta: "Proposta", projeto: "Projeto", pagamento: "Financeiro", optout: "Não contatar", sistema: "Sistema" };

export function DealDrawer({ dealId, stages, onClose, onChanged, aiEnabled }: { dealId: string | null; stages: StageOption[]; onClose: () => void; onChanged: () => void; aiEnabled: boolean }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("geral");
  const open = !!dealId;

  const load = useCallback(async () => {
    if (!dealId) return;
    const r = await dealDetailAction(dealId);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, [dealId]);

  // o pai usa key={dealId}: cada oportunidade monta um painel novo, sem precisar zerar estado aqui
  useEffect(() => {
    if (!dealId) return;
    let alive = true;
    dealDetailAction(dealId).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [dealId]);

  const changed = async () => {
    await load();
    onChanged();
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={data?.card.title ?? "Oportunidade"}
      subtitle={data && <span className="flex flex-wrap items-center gap-2"><Link href={`/empresas/${data.card.companyId}`} className="hover:text-fg hover:underline">{data.card.companyName}</Link><StageBadge kind={data.card.stageKind} label={stages.find((s) => s.key === data.card.stageKey)?.label ?? data.card.stageKey} /><ScorePill score={data.card.score} /></span>}
    >
      {error && <p className="p-5 text-sm text-danger">{error}</p>}
      {!data && !error && <div className="space-y-3 p-5"><div className="skeleton h-6 w-2/3" /><div className="skeleton h-24" /><div className="skeleton h-40" /></div>}
      {data && (
        <div className="flex h-full flex-col">
          <Actions data={data} stages={stages} onChanged={changed} />
          <div role="tablist" aria-label="Abas da oportunidade" className="flex gap-1 overflow-x-auto border-b border-line px-4">
            {([["geral", "Visão geral"], ["historico", "Histórico"], ["tarefas", `Tarefas (${data.tasks.filter((t) => t.status !== "concluida" && t.status !== "cancelada").length})`], ["propostas", `Propostas (${data.proposals.length})`]] as [Tab, string][]).map(([k, l]) => (
              <button type="button" key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>{l}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "geral" && <General data={data} onChanged={changed} aiEnabled={aiEnabled} />}
            {tab === "historico" && <History data={data} onChanged={changed} />}
            {tab === "tarefas" && <Tasks data={data} onChanged={changed} />}
            {tab === "propostas" && <Proposals data={data} />}
          </div>
        </div>
      )}
    </SlideOver>
  );
}

function Actions({ data, stages, onChanged }: { data: Detail; stages: StageOption[]; onChanged: () => void }) {
  const router = useRouter();
  const { run, pending } = useRun();
  const [lostOpen, setLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const c = data.card;
  const current = stages.find((s) => s.key === c.stageKey);
  const blockedByOptOut = data.contacts.some((k) => k.optedOut) && data.contacts.every((k) => k.optedOut);
  return (
    <div className="space-y-2 border-b border-line px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Etapa"
          className="input w-auto py-1.5"
          value={c.stageKey}
          disabled={pending}
          onChange={(e) => {
            const key = e.target.value;
            if (stages.find((s) => s.key === key)?.kind === "lost") setLostOpen(true);
            else run(() => moveDealAction(c.id, key), { ok: "Etapa atualizada.", onOk: onChanged, refresh: false });
          }}
        >
          {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {!blockedByOptOut && (
          <Link href={`/mensagens?empresa=${c.companyId}&oportunidade=${c.id}${c.serviceType ? `&servico=${encodeURIComponent(c.serviceType)}` : ""}`} className="btn btn-ghost btn-sm"><MessageSquareText className="h-4 w-4" /> Mensagem</Link>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => createProposalAction({ companyId: c.companyId, dealId: c.id, title: `Proposta — ${c.title}`, items: [] }), { onOk: (p) => router.push(`/propostas/${p.id}`), refresh: false })}
          className="btn btn-ghost btn-sm"
        >
          <FileText className="h-4 w-4" /> Proposta
        </button>
        {data.project ? (
          <Link href={`/projetos/${data.project.id}`} className="btn btn-ghost btn-sm"><FolderKanban className="h-4 w-4" /> Ver projeto</Link>
        ) : (
          current?.kind !== "lost" && <button className="btn btn-primary btn-sm" onClick={() => setConvertOpen(true)}><FolderKanban className="h-4 w-4" /> Fechar e criar projeto</button>
        )}
      </div>
      {blockedByOptOut && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">Todos os contatos pediram para não ser contatados. Os botões de contato foram desativados.</p>}
      <LostDialog open={lostOpen} onClose={() => setLostOpen(false)} onConfirm={(reason) => { setLostOpen(false); run(() => moveDealAction(c.id, "perdido", reason), { ok: "Marcado como perdido.", onOk: onChanged, refresh: false }); }} />
      <ConvertDialog open={convertOpen} onClose={() => setConvertOpen(false)} data={data} onDone={onChanged} />
    </div>
  );
}

function LostDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [other, setOther] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Motivo da perda" footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onConfirm(reason === "Outro" ? other.trim() || "Outro" : reason)}>Marcar como perdido</button></>}>
      <p className="mb-3 text-sm text-muted">O motivo fica registrado no histórico e nos relatórios de perdas.</p>
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo">{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      {reason === "Outro" && <input className="input mt-2" placeholder="Descreva" value={other} onChange={(e) => setOther(e.target.value)} />}
    </Dialog>
  );
}

function ConvertDialog({ open, onClose, data, onDone }: { open: boolean; onClose: () => void; data: Detail; onDone: () => void }) {
  const { run, pending } = useRun();
  const [rec, setRec] = useState(true);
  const now = useNow();
  const [due, setDue] = useState(ymdSP(new Date(now + 7 * 86_400_000)));
  const approved = data.proposals.find((p) => p.status === "aprovada");
  const amount = approved?.totalCents ?? data.card.valueCents ?? 0;
  const toast = useToast();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Fechar negócio e criar projeto"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={pending} onClick={() => run(() => convertDealAction(data.card.id, { createReceivables: rec && amount > 0, dueDate: due }), { onOk: (r) => { toast(r.created ? "Negócio fechado e projeto criado." : "Este negócio já tinha projeto."); onClose(); onDone(); } })}>
            {pending ? "Criando…" : "Confirmar"}
          </button>
        </>
      }
    >
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-fg/85">
        <li>Marca a oportunidade como <strong>Fechado ganho</strong>.</li>
        <li>Transforma <strong>{data.card.companyName}</strong> em cliente.</li>
        <li>Cria o projeto com checklist inicial (briefing, materiais, direção criativa, desenvolvimento e entrega).</li>
      </ul>
      {amount > 0 ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={rec} onChange={(e) => setRec(e.target.checked)} />
          <span>Criar cobranças planejadas de {brl(amount)}{approved ? ` (proposta aprovada, ${approved.title})` : " (valor previsto da oportunidade)"}.<br /><span className="text-xs text-muted">Valor contratado ≠ recebido: nada é marcado como pago.</span></span>
        </label>
      ) : (
        <p className="text-sm text-muted">Sem valor definido: nenhuma cobrança será criada.</p>
      )}
      {rec && amount > 0 && <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-muted">Primeiro vencimento</span><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></label>}
      <p className="mt-4 text-xs text-muted">A ação é idempotente: repetir não cria projeto nem cobranças duplicados.</p>
    </Dialog>
  );
}

function General({ data, onChanged, aiEnabled }: { data: Detail; onChanged: () => void; aiEnabled: boolean }) {
  const { run, pending } = useRun();
  const c = data.card;
  const [f, setF] = useState({
    title: c.title,
    serviceType: c.serviceType ?? "",
    value: centsToInput(c.valueCents),
    probability: data.deal.probability?.toString() ?? "",
    nextStep: c.nextStep ?? "",
    nextStepDate: c.nextStepAt ? ymdSP(c.nextStepAt) : "",
    expectedCloseAt: c.expectedCloseAt ?? "",
    notes: data.deal.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [optOpen, setOptOpen] = useState(false);
  const [optReason, setOptReason] = useState("Pediu para não ser contatado");
  const now = useNow();
  const late = c.nextStepAt && c.nextStepAt.getTime() < now && c.stageKind === "open";
  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              updateDealAction(c.id, {
                title: f.title,
                serviceType: f.serviceType || null,
                estimatedValueCents: parseMoney(f.value),
                probability: f.probability === "" ? null : Number(f.probability),
                nextStep: f.nextStep || null,
                nextStepAt: f.nextStepDate ? ymdToInstantSP(f.nextStepDate)?.toISOString() : null,
                expectedCloseAt: f.expectedCloseAt || null,
                notes: f.notes || null,
              }),
            { ok: "Salvo.", onOk: onChanged, refresh: false },
          );
        }}
      >
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block text-xs text-muted">Título</span><input className="input" value={f.title} onChange={set("title")} required /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Serviço</span>
          <select className="input" value={f.serviceType} onChange={set("serviceType")}><option value="">—</option>{[...new Set([...(c.serviceType ? [c.serviceType] : []), ...SERVICE_TYPES])].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Valor previsto</span><MoneyInput value={f.value} onChange={(v) => setF((s) => ({ ...s, value: v }))} /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Próximo passo</span><input className="input" value={f.nextStep} onChange={set("nextStep")} /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Prazo do acompanhamento {late && <span className="text-danger">· atrasado</span>}</span><input type="date" className="input" value={f.nextStepDate} onChange={set("nextStepDate")} /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Probabilidade (%) <span className="text-muted">— vazio usa a da etapa ({c.probability}%)</span></span><input type="number" min={0} max={100} className="input" value={f.probability} onChange={set("probability")} /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted">Fechamento esperado</span><input type="date" className="input" value={f.expectedCloseAt} onChange={set("expectedCloseAt")} /></label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block text-xs text-muted">Notas comerciais</span><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></label>
        <div className="flex items-center justify-between sm:col-span-2">
          <span className="text-xs text-muted">Origem: <Badge>{sourceLabel(c.source)}</Badge></span>
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</button>
        </div>
      </form>

      {c.lostReason && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Motivo da perda: {c.lostReason}</p>}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Contatos</h3>
        {data.contacts.length === 0 && !data.company.phone && !data.company.email ? (
          <p className="text-sm text-muted">Sem contatos. Adicione na <Link className="text-brand hover:underline" href={`/empresas/${c.companyId}`}>ficha da empresa</Link>.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.company.phone && <li className="flex justify-between rounded-lg border border-line bg-elevated px-3 py-2"><span>{data.company.phone}</span><span className="text-xs text-muted">empresa</span></li>}
            {data.company.email && <li className="flex justify-between rounded-lg border border-line bg-elevated px-3 py-2"><span>{data.company.email}</span><span className="text-xs text-muted">empresa</span></li>}
            {data.contacts.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-elevated px-3 py-2">
                <span className="min-w-0"><span className="block truncate">{k.name}{k.role ? ` · ${k.role}` : ""}</span><span className="block truncate text-xs text-muted">{[k.whatsapp ?? k.phone, k.email].filter(Boolean).join(" · ")}</span></span>
                {k.optedOut && <Badge tone="danger">não contatar</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.scoreRules.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Por que essa nota (Radar)</h3>
          <ul className="space-y-1 text-sm">{data.scoreRules.map((r, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className="tabular-nums text-brand">+{r.points}</span></li>)}</ul>
        </section>
      )}

      <AiPanel data={data} onChanged={onChanged} aiEnabled={aiEnabled} />

      <section className="border-t border-line pt-4">
        <button className="text-xs text-danger hover:underline" onClick={() => setOptOpen(true)}>Registrar “não contatar mais”</button>
        <Dialog open={optOpen} onClose={() => setOptOpen(false)} title="Não contatar mais" footer={<><button className="btn btn-ghost" onClick={() => setOptOpen(false)}>Cancelar</button><button className="btn btn-danger" disabled={pending} onClick={() => run(() => optOutCompanyAction(c.companyId, optReason), { ok: "Registrado. A oportunidade foi encerrada.", onOk: () => { setOptOpen(false); onChanged(); }, refresh: false })}>Confirmar</button></>}>
          <p className="mb-3 text-sm text-muted">Bloqueia mensagens e botões de contato para esta empresa e encerra as oportunidades abertas como perdidas.</p>
          <input className="input" value={optReason} onChange={(e) => setOptReason(e.target.value)} aria-label="Motivo" />
        </Dialog>
      </section>
    </div>
  );
}

function History({ data, onChanged }: { data: Detail; onChanged: () => void }) {
  const { run, pending } = useRun();
  const [kind, setKind] = useState<"nota" | "ligacao" | "resposta" | "reuniao">("nota");
  const [text, setText] = useState("");
  return (
    <div className="space-y-4">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => addNoteAction({ dealId: data.card.id, kind, content: text }), { ok: "Registrado.", onOk: () => { setText(""); onChanged(); }, refresh: false }); }}>
        <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anote o que aconteceu: conversa, resposta do cliente, objeções…" aria-label="Nova anotação" />
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1.5" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo">
            <option value="nota">Nota</option><option value="ligacao">Ligação</option><option value="resposta">Resposta do cliente</option><option value="reuniao">Reunião</option>
          </select>
          <button className="btn btn-primary btn-sm ml-auto" disabled={pending || !text.trim()}>Registrar</button>
        </div>
        {kind === "resposta" && <p className="text-xs text-muted">Registrar uma resposta leva o negócio para “Conversa” se ainda estiver no começo do funil.</p>}
      </form>
      <Timeline items={data.timeline} />
    </div>
  );
}

export function Timeline({ items }: { items: Detail["timeline"] }) {
  if (!items.length) return <p className="text-sm text-muted">Nenhum registro ainda.</p>;
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" aria-hidden />
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="font-medium text-fg/80">{KIND_LABEL[a.kind] ?? a.kind}</span>
            {a.channel && <span>· {a.channel}</span>}
            <span>· {fmtDateTime(a.occurredAt)}</span>
            {a.authorKind !== "user" && <Badge tone="info">{a.authorKind === "mcp" ? "via Claude Code" : a.authorKind}</Badge>}
          </div>
          {a.content && <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg/90">{a.content}</p>}
        </li>
      ))}
    </ol>
  );
}

function Tasks({ data, onChanged }: { data: Detail; onChanged: () => void }) {
  const { run, pending } = useRun();
  const now = useNow();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [prio, setPrio] = useState("media");
  return (
    <div className="space-y-4">
      <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createTaskAction({ title, dueAt: due ? ymdToInstantSP(due)?.toISOString() : null, priority: prio as "media", dealId: data.card.id, companyId: data.card.companyId }), { ok: "Tarefa criada.", onOk: () => { setTitle(""); setDue(""); onChanged(); }, refresh: false }); }}>
        <input className="input" placeholder="Nova tarefa para esta oportunidade" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título da tarefa" />
        <button className="btn btn-primary btn-sm" disabled={pending || !title.trim()}><Plus className="h-4 w-4" /> Adicionar</button>
        <div className="col-span-2 flex gap-2">
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Vencimento" />
          <select className="input" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridade">{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </div>
      </form>
      {data.tasks.length === 0 ? <p className="text-sm text-muted">Nenhuma tarefa ligada a esta oportunidade.</p> : (
        <ul className="space-y-1.5">
          {data.tasks.map((t) => {
            const done = t.status === "concluida";
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line bg-elevated px-3 py-2 text-sm">
                <button aria-label={done ? "Concluída" : "Concluir tarefa"} disabled={done || pending} onClick={() => run(() => completeTaskAction(t.id), { onOk: onChanged, refresh: false })} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${done ? "border-brand bg-brand text-brand-on" : "border-fg/30 hover:border-brand"}`}>{done && <Check className="h-3.5 w-3.5" />}</button>
                <span className={`min-w-0 flex-1 truncate ${done ? "text-muted line-through" : ""}`}>{t.title}</span>
                {!done && <Badge tone={priorityTone(t.priority)}>{labelOf(PRIORITIES, t.priority)}</Badge>}
                {t.dueAt && <span className={`text-xs ${!done && t.dueAt.getTime() < now ? "text-danger" : "text-muted"}`}>{fmtDate(t.dueAt)} · {relativeDays(t.dueAt)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Proposals({ data }: { data: Detail }) {
  const router = useRouter();
  const { run, pending } = useRun();
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => createProposalAction({ companyId: data.card.companyId, dealId: data.card.id, title: `Proposta — ${data.card.title}`, items: [] }), { onOk: (p) => router.push(`/propostas/${p.id}`), refresh: false })}
        className="btn btn-ghost btn-sm"
      >
        <Plus className="h-4 w-4" /> Nova proposta
      </button>
      {data.proposals.length === 0 ? <p className="text-sm text-muted">Nenhuma proposta ainda.</p> : (
        <ul className="space-y-1.5">
          {data.proposals.map((p) => (
            <li key={p.id}><Link href={`/propostas/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-sm hover:border-fg/25"><span className="truncate">{p.title} · v{p.version}</span><span className="flex items-center gap-2"><span className="tabular-nums text-muted">{brl(p.totalCents)}</span><Badge tone={p.status === "aprovada" ? "ok" : p.status === "recusada" ? "danger" : "neutral"}>{labelOf(PROPOSAL_STATUS, p.status)}</Badge></span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Assistente de IA (opcional; sugestões sempre editáveis, nada é gravado sem você confirmar) ----------
type Summary = { resumo: string; pontos_de_atencao: string[] };
type Next = { acao: string; motivo: string; canal_sugerido: string; prazo_dias: number };
type Sug = { titulo: string; prazo_dias: number; prioridade: "baixa" | "media" | "alta"; on: boolean };

function AiPanel({ data, onChanged, aiEnabled }: { data: Detail; onChanged: () => void; aiEnabled: boolean }) {
  const { run, pending } = useRun();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [consent, setConsent] = useState<null | (() => void)>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [next, setNext] = useState<Next | null>(null);
  const [tasks, setTasks] = useState<Sug[] | null>(null);
  const due = (days: number) => ymdSP(new Date(Date.now() + days * 86_400_000));

  if (!aiEnabled) return <p className="text-xs text-muted">IA desligada (sem GEMINI_API_KEY): tudo continua manual.</p>;

  const guard = (fn: () => void) => {
    let ok = false;
    try { ok = localStorage.getItem("mglabs-ai-consent") === "1"; } catch { /* pergunta sempre */ }
    if (ok) fn(); else setConsent(() => fn);
  };
  const call = async <T,>(key: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, set: (d: T) => void) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.ok) set(r.data); else toast(r.error, "error");
  };

  return (
    <section className="rounded-xl border border-line bg-elevated p-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand" /> Assistente de IA <span className="text-xs font-normal text-muted">opcional · você revisa tudo</span></h3>
      <p className="mb-3 text-xs text-muted">Envia ao Gemini só um resumo anonimizado (sem nome da empresa, contatos, valores nem telefones).</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => guard(() => call("r", () => summarizeDealAction(data.card.id, true), setSummary))}>{busy === "r" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Resumir</button>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => guard(() => call("a", () => nextActionAction(data.card.id, true), setNext))}>{busy === "a" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Próxima ação</button>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => guard(() => call("t", () => suggestTasksAction(data.card.id, true), (d) => setTasks(d.tarefas.map((t) => ({ titulo: t.titulo, prazo_dias: t.prazo_dias, prioridade: t.prioridade, on: true })))))}>{busy === "t" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sugerir tarefas</button>
      </div>

      {summary && (
        <div className="mt-3 space-y-2">
          <textarea className="input" rows={4} value={summary.resumo} onChange={(e) => setSummary({ ...summary, resumo: e.target.value })} aria-label="Resumo sugerido" />
          {summary.pontos_de_atencao.length > 0 && <ul className="list-disc pl-5 text-xs text-muted">{summary.pontos_de_atencao.map((p) => <li key={p}>{p}</li>)}</ul>}
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => addNoteAction({ dealId: data.card.id, kind: "nota", content: `Resumo (sugestão de IA, revisado): ${summary.resumo}` }), { ok: "Resumo salvo como nota.", onOk: () => { setSummary(null); onChanged(); }, refresh: false })}>Salvar como nota</button>
        </div>
      )}

      {next && (
        <div className="mt-3 space-y-2">
          <input className="input" value={next.acao} onChange={(e) => setNext({ ...next, acao: e.target.value })} aria-label="Ação sugerida" />
          <p className="text-xs text-muted">{next.motivo} · canal sugerido: {next.canal_sugerido} · prazo sugerido: {next.prazo_dias} dia(s)</p>
          <button className="btn btn-primary btn-sm" disabled={pending || !next.acao.trim()} onClick={() => run(() => createTaskAction({ title: next.acao, dealId: data.card.id, companyId: data.card.companyId, dueAt: ymdToInstantSP(due(next.prazo_dias))?.toISOString(), source: "ia" }), { ok: "Tarefa criada.", onOk: () => { setNext(null); onChanged(); }, refresh: false })}>Criar tarefa com esta ação</button>
        </div>
      )}

      {tasks && (
        <div className="mt-3 space-y-2">
          {tasks.map((t, i) => (
            <label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.on} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} /><input className="input py-1" value={t.titulo} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} aria-label={`Tarefa ${i + 1}`} /><span className="shrink-0 text-xs text-muted">{t.prazo_dias}d</span></label>
          ))}
          <button className="btn btn-primary btn-sm" disabled={pending || !tasks.some((t) => t.on)} onClick={async () => { for (const t of tasks.filter((x) => x.on && x.titulo.trim())) await createTaskAction({ title: t.titulo, dealId: data.card.id, companyId: data.card.companyId, dueAt: ymdToInstantSP(due(t.prazo_dias))?.toISOString(), priority: t.prioridade, source: "ia" }); toast("Tarefas criadas."); setTasks(null); onChanged(); }}>Criar selecionadas</button>
        </div>
      )}

      <Dialog open={!!consent} onClose={() => setConsent(null)} title="Usar o Gemini (plano gratuito)" footer={<><button className="btn btn-ghost" onClick={() => setConsent(null)}>Cancelar</button><button className="btn btn-primary" onClick={() => { try { localStorage.setItem("mglabs-ai-consent", "1"); } catch { /* ok */ } const f = consent; setConsent(null); f?.(); }}>Autorizar e continuar</button></>}>
        <p className="text-sm">O app envia um resumo anonimizado: etapa, serviço, origem, dias no funil, próximo passo, tarefas e os últimos registros do histórico — com e-mails, telefones, links, @perfis e valores removidos e o nome da empresa trocado por “[empresa]”.</p>
        <p className="mt-2 text-sm text-muted">No plano gratuito, o Google pode usar entradas e saídas para melhorar produtos e revisá-las por pessoas. Evite registrar dados pessoais nas notas.</p>
      </Dialog>
    </section>
  );
}

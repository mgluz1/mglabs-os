"use client";

import { Check, Clipboard, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Timeline } from "@/components/crm/deal-drawer";
import { Badge, Field, SectionCard, priorityTone } from "@/components/ui/kit";
import { ConfirmButton, useRun, useToast } from "@/components/ui/overlays";
import { addDocumentAction, deleteDocumentAction, saveSectionAction, setLinksAction, updateProjectAction } from "@/lib/actions/business";
import { completeTaskAction, createTaskAction } from "@/lib/actions/tasks";
import { PRIORITIES, PROJECT_PHASES, PROJECT_STATUS, labelOf } from "@/lib/config/crm";
import { fmtDate, fmtYmd, ymdToInstantSP } from "@/lib/dates";
import { brl } from "@/lib/money";
import type { ReceivableItem } from "@/lib/services/finance";
import type { TaskItem } from "@/lib/services/tasks";
import type { getProject } from "@/lib/services/projects";

type Data = Awaited<ReturnType<typeof getProject>>;
type Tab = "geral" | "briefing" | "materiais" | "direcao_criativa" | "desenvolvimento" | "entrega" | "arquivos" | "financeiro";
const TABS: [Tab, string][] = [["geral", "Visão geral"], ["briefing", "Briefing"], ["materiais", "Materiais"], ["direcao_criativa", "Direção criativa"], ["desenvolvimento", "Desenvolvimento"], ["entrega", "Entrega"], ["arquivos", "Arquivos e links"], ["financeiro", "Financeiro"]];
const HINTS: Record<string, string> = {
  briefing: "Objetivo do site, público, concorrentes, referências, conteúdo, prazo e orçamento. Marque o que ainda precisa ser validado com [CONFIRMAR] — pendência não é fato.",
  materiais: "Inventário do que o cliente enviou e do que falta: logos, fotos, textos. Registre o direito de uso de cada item na aba “Arquivos e links”.",
  direcao_criativa: "Três direções distintas, a escolhida e a justificativa. Registre a aprovação (sua e do cliente) e as referências usadas.",
  desenvolvimento: "Plano de construção (fundação → seções → movimento → revisão), decisões técnicas, links do repositório e do preview, evidências de QA.",
  entrega: "Checklist de publicação, aceite do cliente, documentos finais e pós-entrega. Publicar é uma ação separada, com aprovação explícita.",
};

export function ProjectDetail({ data, tasks, receivables }: { data: Data; tasks: TaskItem[]; receivables: ReceivableItem[] | null }) {
  const { project: p, company } = data;
  const { run, pending } = useRun();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("geral");
  const sections = (p.sections ?? {}) as Record<string, string>;
  const links = (p.links ?? []) as { label: string; url: string }[];
  const [meta, setMeta] = useState({ status: p.status, phase: p.phase, dueDate: p.dueDate ?? "", scope: p.scope ?? "", notes: p.notes ?? "" });

  const exportMd = () => {
    const md = [`# ${p.name}`, `Cliente: ${company?.name ?? ""}`, p.serviceType && `Serviço: ${p.serviceType}`, p.dueDate && `Prazo: ${fmtYmd(p.dueDate)}`, p.scope && `\n## Escopo\n${p.scope}`, ...PROJECT_PHASES.map((ph) => sections[ph.id]?.trim() && `\n## ${ph.label}\n${sections[ph.id]}`), links.length && `\n## Links\n${links.map((l) => `- ${l.label || l.url}: ${l.url}`).join("\n")}`, data.documents.length && `\n## Materiais e documentos\n${data.documents.map((d) => `- ${d.title}${d.rightsStatus ? ` [${d.rightsStatus}]` : ""}${d.url ? ` — ${d.url}` : ""}`).join("\n")}`].filter(Boolean).join("\n");
    navigator.clipboard.writeText(md).then(() => toast("Briefing do projeto copiado em Markdown."), () => toast("Não foi possível copiar.", "error"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/empresas/${p.companyId}`} className="text-sm text-brand hover:underline">{company?.name}</Link>
        {p.serviceType && <Badge>{p.serviceType}</Badge>}
        <Badge tone={p.status === "entregue" ? "ok" : "brand"}>{labelOf(PROJECT_STATUS, p.status)}</Badge>
        {data.deal && <Link href={`/crm?deal=${data.deal.id}`} className="text-xs text-muted hover:text-fg hover:underline">Negócio: {data.deal.title}</Link>}
        {data.proposal && <Link href={`/propostas/${data.proposal.id}`} className="text-xs text-muted hover:text-fg hover:underline">Proposta v{data.proposal.version}</Link>}
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={exportMd}><Clipboard className="h-4 w-4" aria-hidden /> Copiar briefing (Markdown)</button>
      </div>

      <div role="tablist" aria-label="Seções do projeto" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.filter(([k]) => k !== "financeiro" || receivables) .map(([k, l]) => <button type="button" key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>{l}</button>)}
      </div>

      {tab === "geral" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <SectionCard title="Status e escopo">
              <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(() => updateProjectAction(p.id, { status: meta.status as "planejado", phase: meta.phase as "briefing", dueDate: meta.dueDate || null, scope: meta.scope || null, notes: meta.notes || null }), { ok: "Projeto atualizado." }); }}>
                <Field label="Status"><select className="input" value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>{PROJECT_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
                <Field label="Fase atual"><select className="input" value={meta.phase} onChange={(e) => setMeta({ ...meta, phase: e.target.value })}>{PROJECT_PHASES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
                <Field label="Data prevista"><input type="date" className="input" value={meta.dueDate} onChange={(e) => setMeta({ ...meta, dueDate: e.target.value })} /></Field>
                <Field label="Escopo" className="sm:col-span-3"><textarea className="input" rows={4} value={meta.scope} onChange={(e) => setMeta({ ...meta, scope: e.target.value })} /></Field>
                <Field label="Anotações" className="sm:col-span-3"><textarea className="input" rows={3} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
                <div className="flex justify-end sm:col-span-3"><button className="btn btn-primary" disabled={pending}>Salvar</button></div>
              </form>
            </SectionCard>
            <ProjectTasks projectId={p.id} companyId={p.companyId} tasks={tasks} />
          </div>
          <SectionCard title="Linha do tempo"><Timeline items={data.timeline} /></SectionCard>
        </div>
      )}

      {(["briefing", "materiais", "direcao_criativa", "desenvolvimento", "entrega"] as const).map((k) => tab === k && <SectionEditor key={k} projectId={p.id} section={k} initial={sections[k] ?? ""} hint={HINTS[k]} />)}

      {tab === "arquivos" && <Files projectId={p.id} documents={data.documents} links={links} />}

      {tab === "financeiro" && receivables && (
        <SectionCard title="Cobranças do projeto" action={<Link href="/financeiro" className="text-xs text-brand hover:underline">Abrir financeiro</Link>}>
          {receivables.length === 0 ? <p className="text-sm text-muted">Sem cobranças. Crie no Financeiro ou ao fechar o negócio.</p> : (
            <ul className="divide-y divide-line">{receivables.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{r.description}<span className="block text-xs text-muted">vence {fmtYmd(r.dueDate)}</span></span><span className="flex items-center gap-2"><span className="tabular-nums">{brl(r.amountCents)}</span><Badge tone={r.state === "paga" ? "ok" : r.state === "vencida" ? "danger" : "neutral"}>{r.state.replace("_", " ")}</Badge></span></li>)}</ul>
          )}
        </SectionCard>
      )}
      <p className="text-xs text-muted">Criado em {fmtDate(p.createdAt)}. Execução de agentes (briefing, assets e site) ainda é manual via Claude Code; este painel guarda o que for decidido.</p>
    </div>
  );
}

function SectionEditor({ projectId, section, initial, hint }: { projectId: string; section: string; initial: string; hint: string }) {
  const { run, pending } = useRun();
  const [text, setText] = useState(initial);
  const pendingItems = (text.match(/\[CONFIRMAR\]/g) ?? []).length;
  return (
    <SectionCard title={labelOf(PROJECT_PHASES, section)} action={pendingItems > 0 && <Badge tone="warn">{pendingItems} pendência(s) [CONFIRMAR]</Badge>}>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <textarea className="input min-h-[280px] font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} aria-label={labelOf(PROJECT_PHASES, section)} />
      <div className="mt-3 flex justify-end"><button type="button" className="btn btn-primary" disabled={pending || text === initial} onClick={() => run(() => saveSectionAction(projectId, section, text), { ok: "Seção salva." })}>Salvar seção</button></div>
    </SectionCard>
  );
}

function ProjectTasks({ projectId, companyId, tasks }: { projectId: string; companyId: string; tasks: TaskItem[] }) {
  const { run, pending } = useRun();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [prio, setPrio] = useState("media");
  return (
    <SectionCard title={`Tarefas (${tasks.filter((t) => t.status !== "concluida").length} abertas)`}>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createTaskAction({ title, projectId, companyId, dueAt: due ? ymdToInstantSP(due)?.toISOString() : null, priority: prio as "media" }), { ok: "Tarefa criada.", onOk: () => { setTitle(""); setDue(""); } }); }}>
        <input className="input min-w-[200px] flex-1" placeholder="Nova tarefa do projeto" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título" />
        <input type="date" className="input w-auto" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Vencimento" />
        <select className="input w-auto" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridade">{PRIORITIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <button className="btn btn-primary" disabled={pending || !title.trim()} aria-label="Adicionar tarefa"><Plus className="h-4 w-4" aria-hidden /></button>
      </form>
      <ul className="space-y-1.5">
        {tasks.map((t) => { const done = t.status === "concluida"; return (
          <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line bg-elevated px-3 py-2 text-sm">
            <button type="button" disabled={done || pending} aria-label="Concluir tarefa" onClick={() => run(() => completeTaskAction(t.id), { ok: "Tarefa concluída." })} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${done ? "border-brand bg-brand text-brand-on" : "border-fg/30 hover:border-brand"}`}>{done && <Check className="h-3.5 w-3.5" aria-hidden />}</button>
            <span className={`min-w-0 flex-1 truncate ${done ? "text-muted line-through" : ""}`}>{t.title}</span>
            {!done && <Badge tone={priorityTone(t.priority)}>{labelOf(PRIORITIES, t.priority)}</Badge>}
            {t.dueAt && <span className="text-xs text-muted">{fmtDate(t.dueAt)}</span>}
          </li>); })}
        {tasks.length === 0 && <li className="text-sm text-muted">Sem tarefas.</li>}
      </ul>
    </SectionCard>
  );
}

const RIGHTS = [["", "—"], ["recebido", "Recebido"], ["falta", "Falta"], ["a_produzir", "A produzir"], ["nao_autorizado", "Não autorizado"]] as const;
function Files({ projectId, documents, links }: { projectId: string; documents: Data["documents"]; links: { label: string; url: string }[] }) {
  const { run, pending } = useRun();
  const [doc, setDoc] = useState({ title: "", url: "", kind: "documento", rightsStatus: "" });
  const [link, setLink] = useState({ label: "", url: "" });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Documentos e materiais">
        <form className="mb-3 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addDocumentAction(projectId, { title: doc.title, url: doc.url || null, kind: doc.kind as "documento", rightsStatus: (doc.rightsStatus || null) as "recebido" | null }), { ok: "Documento adicionado.", onOk: () => setDoc({ title: "", url: "", kind: "documento", rightsStatus: "" }) }); }}>
          <input required className="input col-span-2" placeholder="Título (ex.: Logo em SVG)" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} aria-label="Título" />
          <input className="input col-span-2" placeholder="Link (Drive, Figma, GitHub…)" value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} aria-label="Link" />
          <select className="input" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })} aria-label="Tipo"><option value="documento">Documento</option><option value="referencia">Referência</option><option value="material">Material do cliente</option><option value="entrega">Entrega</option></select>
          <select className="input" value={doc.rightsStatus} onChange={(e) => setDoc({ ...doc, rightsStatus: e.target.value })} aria-label="Direito de uso">{RIGHTS.map(([v, l]) => <option key={v} value={v}>{v ? `Uso: ${l}` : "Direito de uso: —"}</option>)}</select>
          <button className="btn btn-primary col-span-2" disabled={pending}>Adicionar</button>
        </form>
        <ul className="space-y-1.5">{documents.map((d) => <li key={d.id} className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand hover:underline">{d.title}<ExternalLink className="h-3 w-3" aria-hidden /></a> : d.title}</span><Badge>{d.kind}</Badge>{d.rightsStatus && <Badge tone={d.rightsStatus === "nao_autorizado" ? "danger" : d.rightsStatus === "recebido" ? "ok" : "warn"}>{d.rightsStatus.replace("_", " ")}</Badge>}<ConfirmButton className="rounded p-1 text-muted hover:text-danger" label="Excluir?" ariaLabel={`Excluir ${d.title}`} onConfirm={() => run(() => deleteDocumentAction(projectId, d.id))}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton></li>)}{documents.length === 0 && <li className="text-sm text-muted">Nenhum documento.</li>}</ul>
        <p className="mt-3 text-xs text-muted">Upload de arquivos ainda não existe: guarde o link e o direito de uso de cada material. Nunca use material sem autorização.</p>
      </SectionCard>
      <SectionCard title="Links de referência">
        <form className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(() => setLinksAction(projectId, [...links, link]), { ok: "Link adicionado.", onOk: () => setLink({ label: "", url: "" }) }); }}>
          <input className="input" placeholder="Rótulo" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} aria-label="Rótulo" />
          <input required className="input" placeholder="https://…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} aria-label="URL" />
          <button className="btn btn-primary" disabled={pending} aria-label="Adicionar link"><Plus className="h-4 w-4" aria-hidden /></button>
        </form>
        <ul className="space-y-1.5">{links.map((l, i) => <li key={i} className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-sm"><a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-brand hover:underline">{l.label || l.url}</a><ConfirmButton className="rounded p-1 text-muted hover:text-danger" label="Remover?" ariaLabel={`Remover ${l.label || l.url}`} onConfirm={() => run(() => setLinksAction(projectId, links.filter((_, j) => j !== i)))}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton></li>)}{links.length === 0 && <li className="text-sm text-muted">Nenhum link.</li>}</ul>
      </SectionCard>
    </div>
  );
}

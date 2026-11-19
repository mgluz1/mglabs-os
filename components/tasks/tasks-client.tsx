"use client";

import { CalendarDays, Check, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge, EmptyState, Field, priorityTone } from "@/components/ui/kit";
import { ConfirmButton, Dialog, useRun } from "@/components/ui/overlays";
import { completeTaskAction, createTaskAction, deleteTaskAction, reopenTaskAction, updateTaskAction } from "@/lib/actions/tasks";
import { PRIORITIES, labelOf } from "@/lib/config/crm";
import { fmtDate, fmtDateTime, relativeDays, ymdSP, ymdToInstantSP } from "@/lib/dates";
import type { TaskItem } from "@/lib/services/tasks";

export type Option = { id: string; label: string };
const VIEWS = [["hoje", "Hoje"], ["atrasadas", "Atrasadas"], ["semana", "Próximos 7 dias"], ["abertas", "Todas abertas"], ["sem_data", "Sem data"], ["concluidas", "Concluídas"]] as const;

export function TasksClient({ view, tasks, counts, deals, companies }: { view: string; tasks: TaskItem[]; counts: Record<string, number>; deals: Option[]; companies: Option[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<TaskItem | "novo" | null>(sp.get("novo") === "1" ? "novo" : null);

  // agenda: agrupa por dia quando a visão tem datas
  const groups = new Map<string, TaskItem[]>();
  for (const t of tasks) {
    const k = t.dueAt ? ymdSP(t.dueAt) : "sem-data";
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Visões" className="flex flex-wrap gap-1">
          {VIEWS.map(([k, l]) => (
            <button type="button" key={k} onClick={() => router.push(`/tarefas?v=${k}`)} aria-current={view === k ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm ${view === k ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-fg/6 hover:text-fg"}`}>
              {l}{k !== "concluidas" && counts[k] != null && <span className={`ml-1.5 text-xs ${k === "atrasadas" && counts[k] ? "text-danger" : "text-muted"}`}>{counts[k]}</span>}
            </button>
          ))}
        </nav>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing("novo")}><Plus className="h-4 w-4" aria-hidden /> Nova tarefa</button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CalendarDays} title={view === "atrasadas" ? "Nada atrasado 🎉" : view === "hoje" ? "Nada para hoje" : "Nenhuma tarefa aqui"} description="Crie tarefas ligadas a oportunidades, clientes ou projetos para não perder nenhum retorno." action={<button type="button" className="btn btn-primary" onClick={() => setEditing("novo")}>Nova tarefa</button>} />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day} aria-label={day}>
              {(view === "semana" || view === "abertas" || view === "atrasadas") && day !== "sem-data" && (
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{fmtDate(items[0].dueAt)} · {relativeDays(items[0].dueAt)}</h2>
              )}
              {day === "sem-data" && view !== "sem_data" && <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Sem data</h2>}
              <ul className="card divide-y divide-line">
                {items.map((t) => {
                  const done = t.status === "concluida";
                  const late = !done && t.dueAt && t.dueAt.getTime() < new Date().setHours(0, 0, 0, 0);
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                      <button type="button" aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"} disabled={pending} onClick={() => run(() => (done ? reopenTaskAction(t.id) : completeTaskAction(t.id)), { ok: done ? "Tarefa reaberta." : "Tarefa concluída." })} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${done ? "border-brand bg-brand text-brand-on" : "border-fg/30 hover:border-brand"}`}>{done && <Check className="h-3.5 w-3.5" aria-hidden />}</button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${done ? "text-muted line-through" : "font-medium"}`}>{t.title}</p>
                        {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.description}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          {t.dealId && <Link href={`/crm?deal=${t.dealId}`} className="hover:text-brand hover:underline">{t.companyName ?? t.dealTitle}</Link>}
                          {!t.dealId && t.companyId && <Link href={`/empresas/${t.companyId}`} className="hover:text-brand hover:underline">{t.companyName}</Link>}
                          {t.projectId && <Link href={`/projetos/${t.projectId}`} className="hover:text-brand hover:underline">Projeto: {t.projectName}</Link>}
                          {done ? <span>concluída em {fmtDateTime(t.completedAt)}</span> : t.dueAt && <span className={late ? "font-medium text-danger" : ""}>{late ? "Atrasada · " : ""}{fmtDateTime(t.dueAt)}</span>}
                          {t.source !== "manual" && <Badge tone="info">{t.source === "mcp" ? "Claude Code" : t.source === "ia" ? "IA" : "automática"}</Badge>}
                        </p>
                      </div>
                      {!done && <Badge tone={priorityTone(t.priority)}>{labelOf(PRIORITIES, t.priority)}</Badge>}
                      <button type="button" className="rounded p-1 text-muted hover:bg-fg/8 hover:text-fg" onClick={() => setEditing(t)} aria-label={`Editar ${t.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <ConfirmButton className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" label="Excluir?" ariaLabel={`Excluir ${t.title}`} onConfirm={() => run(() => deleteTaskAction(t.id), { ok: "Tarefa excluída." })}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TaskDialog key={editing === "novo" ? "novo" : editing?.id ?? "x"} editing={editing} onClose={() => setEditing(null)} deals={deals} companies={companies} />
    </>
  );
}

function TaskDialog({ editing, onClose, deals, companies }: { editing: TaskItem | "novo" | null; onClose: () => void; deals: Option[]; companies: Option[] }) {
  const { run, pending } = useRun();
  const t = editing && editing !== "novo" ? editing : null;
  const [f, setF] = useState({
    title: t?.title ?? "",
    description: t?.description ?? "",
    priority: t?.priority ?? "media",
    date: t?.dueAt ? ymdSP(t.dueAt) : "",
    time: t?.dueAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(t.dueAt) : "09:00",
    dealId: t?.dealId ?? "",
    companyId: t?.companyId ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={editing !== null} onClose={onClose} title={t ? "Editar tarefa" : "Nova tarefa"}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = { title: f.title, description: f.description || null, priority: f.priority as "media", dueAt: f.date ? ymdToInstantSP(f.date, f.time || "09:00")?.toISOString() : null, dealId: f.dealId || null, companyId: f.dealId ? null : f.companyId || null };
          run(() => (t ? updateTaskAction(t.id, input) : createTaskAction(input)), { ok: "Tarefa salva.", onOk: onClose });
        }}
      >
        <Field label="Título *" className="sm:col-span-2"><input required autoFocus className="input" value={f.title} onChange={set("title")} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><textarea className="input" rows={2} value={f.description} onChange={set("description")} /></Field>
        <Field label="Vencimento"><input type="date" className="input" value={f.date} onChange={set("date")} /></Field>
        <Field label="Horário"><input type="time" className="input" value={f.time} onChange={set("time")} disabled={!f.date} /></Field>
        <Field label="Prioridade"><select className="input" value={f.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
        <Field label="Oportunidade"><select className="input" value={f.dealId} onChange={set("dealId")}><option value="">—</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
        {!f.dealId && <Field label="Cliente / empresa" className="sm:col-span-2"><select className="input" value={f.companyId} onChange={set("companyId")}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !f.title.trim()}>{pending ? "Salvando…" : "Salvar"}</button></div>
      </form>
    </Dialog>
  );
}

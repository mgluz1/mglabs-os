"use client";

import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge, EmptyState, Field } from "@/components/ui/kit";
import { Dialog, useRun } from "@/components/ui/overlays";
import { createProjectAction } from "@/lib/actions/business";
import { PROJECT_PHASES, PROJECT_STATUS, SERVICE_TYPES, labelOf } from "@/lib/config/crm";
import { fmtYmd } from "@/lib/dates";

type P = { id: string; name: string; companyId: string; companyName: string; serviceType: string | null; status: string; phase: string; dueDate: string | null; openTasks: number; doneTasks: number };

export function ProjectsClient({ projects, companies }: { projects: P[]; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { run, pending } = useRun();
  const [open, setOpen] = useState(sp.get("novo") === "1");
  const [f, setF] = useState({ companyId: "", name: "", serviceType: "", dueDate: "" });
  return (
    <>
      <div className="mb-4 flex justify-end"><button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo projeto</button></div>
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Nenhum projeto ainda" description="Projetos nascem de negócios fechados (botão “Fechar e criar projeto” no CRM) ou podem ser criados manualmente para um cliente." action={<><Link href="/crm" className="btn btn-primary">Abrir o CRM</Link><button className="btn btn-ghost" onClick={() => setOpen(true)}>Criar manualmente</button></>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const total = p.openTasks + p.doneTasks;
            const pct = total ? Math.round((p.doneTasks / total) * 100) : 0;
            const done = p.status === "entregue" || p.status === "cancelado";
            return (
              <Link key={p.id} href={`/projetos/${p.id}`} className={`card block p-4 transition hover:border-fg/25 ${done ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-heading text-base font-semibold">{p.name}</h3><p className="truncate text-xs text-muted">{p.companyName}{p.serviceType ? ` · ${p.serviceType}` : ""}</p></div><Badge tone={p.status === "entregue" ? "ok" : p.status === "cancelado" ? "danger" : p.status === "pausado" ? "warn" : "brand"}>{labelOf(PROJECT_STATUS, p.status)}</Badge></div>
                <p className="mt-3 text-xs text-muted">Fase: <span className="text-fg/85">{labelOf(PROJECT_PHASES, p.phase)}</span>{p.dueDate ? ` · prazo ${fmtYmd(p.dueDate)}` : ""}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/8" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1 text-xs text-muted">{total ? `${p.doneTasks}/${total} tarefas` : "Sem tarefas"}</p>
              </Link>
            );
          })}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo projeto">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => createProjectAction({ companyId: f.companyId, name: f.name, serviceType: f.serviceType || null, dueDate: f.dueDate || null, status: "planejado", phase: "briefing" }), { ok: "Projeto criado.", onOk: (p) => router.push(`/projetos/${p.id}`), refresh: false }); }}>
          <Field label="Cliente / empresa"><select required className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}><option value="">Escolha…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Nome do projeto"><input required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Tipo de serviço"><select className="input" value={f.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value })}><option value="">—</option>{SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Data prevista"><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={pending || !f.companyId || !f.name.trim()}>Criar projeto</button></div>
        </form>
      </Dialog>
    </>
  );
}

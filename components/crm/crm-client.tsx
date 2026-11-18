"use client";

import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Download, Kanban, LayoutList, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DealDrawer } from "@/components/crm/deal-drawer";
import { NewDealDialog, type CompanyOption } from "@/components/crm/new-deal-dialog";
import { ScorePill, StageBadge } from "@/components/crm/common";
import { EmptyState, PageHeader } from "@/components/ui/kit";
import { Dialog, useRun } from "@/components/ui/overlays";
import { moveDealAction } from "@/lib/actions/crm";
import { LOST_REASONS, SOURCES, sourceLabel } from "@/lib/config/crm";
import { fmtShort } from "@/lib/dates";
import { brl } from "@/lib/money";
import { useNow } from "@/lib/use-now";
import type { DealCard } from "@/lib/services/deals";

export type StageOption = { key: string; label: string; kind: string; probability: number };

export function CrmClient({ deals, stages, companies, services }: { deals: DealCard[]; stages: StageOption[]; companies: CompanyOption[]; services: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { run } = useRun();
  const [view, setView] = useState<"kanban" | "tabela">("kanban");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [service, setService] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [newOpen, setNewOpen] = useState(sp.get("novo") === "1");
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0]);
  const [lostOther, setLostOther] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const openId = sp.get("deal");
  const now = useNow();

  const setDeal = (id: string | null) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("novo");
    if (id) next.set("deal", id);
    else next.delete("deal");
    router.replace(`${pathname}${next.size ? "?" + next : ""}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return deals.filter(
      (d) =>
        (!term || d.title.toLowerCase().includes(term) || d.companyName.toLowerCase().includes(term) || (d.nextStep ?? "").toLowerCase().includes(term)) &&
        (!source || d.source === source) &&
        (!service || d.serviceType === service) &&
        (!overdue || (d.stageKind === "open" && d.nextStepAt && d.nextStepAt.getTime() < now)),
    );
  }, [deals, q, source, service, overdue, now]);

  const totals = useMemo(() => {
    const open = filtered.filter((d) => d.stageKind === "open");
    return {
      open: open.length,
      openCents: open.reduce((s, d) => s + (d.valueCents ?? 0), 0),
      weighted: Math.round(open.reduce((s, d) => s + ((d.valueCents ?? 0) * d.probability) / 100, 0)),
      won: filtered.filter((d) => d.stageKind === "won").length,
    };
  }, [filtered]);

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const key = e.over?.id as string | undefined;
    const deal = deals.find((d) => d.id === id);
    if (!key || !deal || deal.stageKey === key) return;
    if (stages.find((s) => s.key === key)?.kind === "lost") {
      setLostFor(id);
      return;
    }
    run(() => moveDealAction(id, key), { ok: "Etapa atualizada." });
  };

  const filtersActive = !!(q || source || service || overdue);
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="CRM"
        description={`${totals.open} em aberto · previsto ${brl(totals.openCents, { compact: true })} · ponderado ${brl(totals.weighted, { compact: true })} · ${totals.won} fechado(s)`}
        actions={
          <>
            <a href="/api/crm/export" className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> CSV</a>
            <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Nova oportunidade</button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-8">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Buscar oportunidade, empresa, próximo passo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <select className="input w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origem"><option value="">Todas as origens</option>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select className="input w-auto" value={service} onChange={(e) => setService(e.target.value)} aria-label="Serviço"><option value="">Todos os serviços</option>{services.map((s) => <option key={s}>{s}</option>)}</select>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Atrasados</label>
        {filtersActive && <button className="text-xs text-muted hover:text-fg" onClick={() => { setQ(""); setSource(""); setService(""); setOverdue(false); }}>Limpar filtros</button>}
        <div className="ml-auto flex rounded-lg border border-line p-0.5" role="group" aria-label="Visualização">
          <button className={`rounded-md p-1.5 ${view === "kanban" ? "bg-brand/15 text-brand" : "text-muted"}`} onClick={() => setView("kanban")} aria-label="Quadro" aria-pressed={view === "kanban"}><Kanban className="h-4 w-4" /></button>
          <button className={`rounded-md p-1.5 ${view === "tabela" ? "bg-brand/15 text-brand" : "text-muted"}`} onClick={() => setView("tabela")} aria-label="Tabela" aria-pressed={view === "tabela"}><LayoutList className="h-4 w-4" /></button>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="px-4 sm:px-8">
          <EmptyState icon={Kanban} title="Seu funil está vazio" description="Crie uma oportunidade manualmente ou envie empresas do Radar para o CRM. Elas aparecem aqui na etapa “Novo”." action={<><button className="btn btn-primary" onClick={() => setNewOpen(true)}>Nova oportunidade</button><a href="/radar" className="btn btn-ghost">Buscar no Radar</a></>} />
        </div>
      ) : view === "kanban" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:px-8">
            {stages.map((s) => (
              <Column key={s.key} stage={s} deals={filtered.filter((d) => d.stageKey === s.key)} onOpen={setDeal} now={now} />
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 sm:px-8">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs text-muted"><tr>{["Oportunidade", "Etapa", "Valor", "Próximo passo", "Origem", "Score"].map((h) => <th key={h} className="border-b border-line px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} tabIndex={0} onClick={() => setDeal(d.id)} onKeyDown={(e) => e.key === "Enter" && setDeal(d.id)} className="cursor-pointer border-b border-line/60 hover:bg-fg/5">
                  <td className="px-3 py-2.5"><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{d.companyName}</div></td>
                  <td className="px-3 py-2.5"><StageBadge kind={d.stageKind} label={stages.find((s) => s.key === d.stageKey)?.label ?? d.stageKey} /></td>
                  <td className="px-3 py-2.5 tabular-nums">{brl(d.valueCents)}</td>
                  <td className="px-3 py-2.5"><div className="max-w-[240px] truncate">{d.nextStep ?? "—"}</div>{d.nextStepAt && <div className={`text-xs ${d.stageKind === "open" && d.nextStepAt.getTime() < now ? "text-danger" : "text-muted"}`}>{fmtShort(d.nextStepAt)}</div>}</td>
                  <td className="px-3 py-2.5 text-muted">{sourceLabel(d.source)}</td>
                  <td className="px-3 py-2.5"><ScorePill score={d.score} /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted">Nenhuma oportunidade com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <NewDealDialog open={newOpen} onClose={() => { setNewOpen(false); if (sp.get("novo")) setDeal(openId); }} companies={companies} onCreated={(id) => setDeal(id)} />
      <DealDrawer key={openId ?? "none"} dealId={openId} stages={stages} onClose={() => setDeal(null)} onChanged={() => router.refresh()} />
      <Dialog
        open={!!lostFor}
        onClose={() => setLostFor(null)}
        title="Motivo da perda"
        footer={<><button className="btn btn-ghost" onClick={() => setLostFor(null)}>Cancelar</button><button className="btn btn-primary" onClick={() => { const id = lostFor!; setLostFor(null); run(() => moveDealAction(id, "perdido", lostReason === "Outro" ? lostOther.trim() || "Outro" : lostReason), { ok: "Marcado como perdido." }); }}>Marcar como perdido</button></>}
      >
        <select className="input" value={lostReason} onChange={(e) => setLostReason(e.target.value)} aria-label="Motivo">{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        {lostReason === "Outro" && <input className="input mt-2" placeholder="Descreva" value={lostOther} onChange={(e) => setLostOther(e.target.value)} />}
      </Dialog>
    </div>
  );
}

function Column({ stage, deals, onOpen, now }: { stage: StageOption; deals: DealCard[]; onOpen: (id: string) => void; now: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = deals.reduce((s, d) => s + (d.valueCents ?? 0), 0);
  return (
    <section ref={setNodeRef} aria-label={stage.label} className={`flex w-72 shrink-0 flex-col rounded-xl border bg-surface/60 transition-colors ${isOver ? "border-brand/60 bg-brand/5" : "border-line"}`}>
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-medium"><span className={`h-2 w-2 rounded-full ${stage.kind === "won" ? "bg-ok" : stage.kind === "lost" ? "bg-muted" : "bg-brand"}`} aria-hidden />{stage.label}<span className="text-xs font-normal text-muted">{deals.length}</span></h2>
        {total > 0 && <span className="text-xs tabular-nums text-muted">{brl(total, { compact: true })}</span>}
      </header>
      <div className="min-h-[80px] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {deals.map((d) => <Card key={d.id} deal={d} onOpen={onOpen} now={now} />)}
        {deals.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">Arraste oportunidades para cá</p>}
      </div>
    </section>
  );
}

function Card({ deal: d, onOpen, now }: { deal: DealCard; onOpen: (id: string) => void; now: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: d.id });
  const late = d.stageKind === "open" && d.nextStepAt && d.nextStepAt.getTime() < now;
  return (
    <div ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} className={`rounded-lg border border-line bg-elevated p-2.5 text-sm transition-shadow hover:border-fg/25 ${isDragging ? "z-50 opacity-90 shadow-2xl" : ""}`}>
      <div {...listeners} {...attributes} className="cursor-grab touch-none active:cursor-grabbing" aria-label={`Arrastar ${d.title}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0"><span className="block truncate font-medium">{d.companyName}</span><span className="block truncate text-xs text-muted">{d.title}</span></span>
          <ScorePill score={d.score} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {d.valueCents != null && <span className="font-medium tabular-nums text-fg/85">{brl(d.valueCents, { compact: true })}</span>}
          {d.nextStepAt && <span className={late ? "font-medium text-danger" : ""}>{late ? "Atrasado · " : ""}{fmtShort(d.nextStepAt)}{d.nextStep ? ` · ${d.nextStep}` : ""}</span>}
          {d.lostReason && <span>{d.lostReason}</span>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted">{sourceLabel(d.source)}{d.openTasks ? ` · ${d.openTasks} tarefa(s)` : ""}</span>
        <button onClick={() => onOpen(d.id)} className="rounded px-1.5 py-0.5 text-brand hover:bg-brand/10">Abrir</button>
      </div>
    </div>
  );
}

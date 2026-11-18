"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { moveStageAction, updateLeadAction } from "@/app/actions";
import { BAND_COLOR, bandOf } from "@/components/lead/badges";
import { LeadPanel } from "@/components/lead/lead-panel";
import { getCategory } from "@/lib/config/categories";
import { STAGES, type LeadCard, type StageId } from "@/lib/types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const when = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

function endOfTodaySP(): number {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  return new Date(`${ymd}T23:59:59-03:00`).getTime();
}

export function CrmBoard({ leads }: { leads: LeadCard[] }) {
  const router = useRouter();
  const [items, setItems] = useState(leads);
  // dados novos do servidor (router.refresh) substituem o estado local sem remontar o quadro
  const [prevLeads, setPrevLeads] = useState(leads);
  if (leads !== prevLeads) {
    setPrevLeads(leads);
    setItems(leads);
  }
  const [openPlace, setOpenPlace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const due = useMemo(() => {
    const limit = endOfTodaySP();
    return items.filter((l) => l.nextStepAt && new Date(l.nextStepAt).getTime() <= limit && !["fechado", "perdido"].includes(l.stage));
  }, [items]);

  const totals = useMemo(() => {
    const open = items.filter((l) => !["fechado", "perdido"].includes(l.stage)).reduce((s, l) => s + (l.expectedValue ?? 0), 0);
    const won = items.filter((l) => l.stage === "fechado").reduce((s, l) => s + (l.expectedValue ?? 0), 0);
    return { open, won };
  }, [items]);

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const stage = e.over?.id as StageId | undefined;
    const lead = items.find((l) => l.id === id);
    if (!stage || !lead || lead.stage === stage) return;
    let reason: string | undefined;
    if (stage === "perdido") {
      const r = window.prompt("Motivo da perda?");
      if (r === null) return;
      reason = r;
    }
    setItems((xs) => xs.map((l) => (l.id === id ? { ...l, stage, lostReason: reason ?? null } : l)));
    start(async () => {
      const r = await moveStageAction(id, stage, reason);
      if (!r.ok) {
        setError(r.error);
        setItems((xs) => xs.map((l) => (l.id === id ? lead : l)));
      }
    });
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
          <h1 className="text-xl font-semibold">CRM</h1>
          <span className="text-sm text-white/50">
            {items.length} leads · em aberto {brl.format(totals.open)} · fechado {brl.format(totals.won)}
          </span>
          <a href="/api/crm/export" className="ml-auto rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5">
            Exportar CSV
          </a>
        </header>
        {error && <p className="px-6 py-2 text-sm text-red-300">{error}</p>}

        {due.length > 0 && (
          <section className="border-b border-white/10 px-6 py-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">Follow-ups de hoje ({due.length})</h2>
            <div className="flex flex-wrap gap-2">
              {due.map((l) => (
                <button key={l.id} onClick={() => setOpenPlace(l.place.id)} className="rounded-md bg-amber-500/10 px-2.5 py-1 text-sm text-amber-200 ring-1 ring-amber-500/30">
                  {l.place.name} · {l.nextStep ?? "próximo passo"}
                </button>
              ))}
            </div>
          </section>
        )}

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {STAGES.map((s) => (
              <Column key={s.id} id={s.id} label={s.label} leads={items.filter((l) => l.stage === s.id)} onOpen={setOpenPlace} onSaved={() => router.refresh()} />
            ))}
          </div>
        </DndContext>
      </div>
      {openPlace && (
        <div className="w-[420px] shrink-0">
          <LeadPanel key={openPlace} placeId={openPlace} onClose={() => setOpenPlace(null)} onChanged={() => router.refresh()} />
        </div>
      )}
    </div>
  );
}

function Column({ id, label, leads, onOpen, onSaved }: { id: StageId; label: string; leads: LeadCard[]; onOpen: (placeId: string) => void; onSaved: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex w-64 shrink-0 flex-col rounded-lg bg-white/[0.03] ${isOver ? "ring-1 ring-sky-500/50" : ""}`}>
      <div className="flex items-center justify-between px-3 py-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-white/40">{leads.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {leads.map((l) => (
          <Card key={l.id} lead={l} onOpen={onOpen} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}

function Card({ lead, onOpen, onSaved }: { lead: LeadCard; onOpen: (placeId: string) => void; onSaved: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => Date.now());
  const p = lead.place;
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const late = lead.nextStepAt && new Date(lead.nextStepAt).getTime() < now;

  return (
    <div ref={setNodeRef} style={style} className={`rounded-md bg-[#151a24] p-2.5 text-sm ring-1 ring-white/10 ${isDragging ? "z-50 opacity-80 shadow-xl" : ""}`}>
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: BAND_COLOR[bandOf(p.score)] }} title={`Lead Score ${p.score ?? "—"}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block truncate text-xs text-white/50">
              {getCategory(p.category ?? "")?.label} · {p.neighborhood ?? p.city ?? ""}
            </span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-white/60">
          {lead.expectedValue != null && <span>{brl.format(lead.expectedValue)}</span>}
          {lead.nextStepAt && (
            <span className={late ? "text-amber-300" : ""}>
              {when(lead.nextStepAt)} · {lead.nextStep}
            </span>
          )}
          {lead.lostReason && <span className="text-white/40">{lead.lostReason}</span>}
        </div>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <button onClick={() => onOpen(p.id)} className="text-sky-400 hover:underline">
          Abrir
        </button>
        <button onClick={() => setEditing((v) => !v)} className="text-white/50 hover:text-white">
          {editing ? "Fechar" : "Editar"}
        </button>
      </div>
      {editing && <EditLead lead={lead} onSaved={() => { setEditing(false); onSaved(); }} />}
    </div>
  );
}

function EditLead({ lead, onSaved }: { lead: LeadCard; onSaved: () => void }) {
  const [value, setValue] = useState(lead.expectedValue?.toString() ?? "");
  const [step, setStep] = useState(lead.nextStep ?? "");
  const [date, setDate] = useState(lead.nextStepAt ? lead.nextStepAt.slice(0, 10) : "");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const n = value.trim() === "" ? null : Number(value.replace(",", "."));
          await updateLeadAction(lead.id, {
            expectedValue: n != null && Number.isFinite(n) ? n : null,
            nextStep: step.trim() || null,
            nextStepAt: date ? new Date(`${date}T09:00:00-03:00`).toISOString() : null,
          });
          onSaved();
        });
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Valor previsto (R$)" inputMode="decimal" className="w-full rounded border border-white/10 bg-white/5 px-2 py-1" />
      <input value={step} onChange={(e) => setStep(e.target.value)} placeholder="Próximo passo" className="w-full rounded border border-white/10 bg-white/5 px-2 py-1" />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border border-white/10 bg-white/5 px-2 py-1" />
      <button disabled={pending} className="w-full rounded bg-sky-500 py-1 font-medium text-[#0b0d12] disabled:opacity-50">
        Salvar
      </button>
    </form>
  );
}

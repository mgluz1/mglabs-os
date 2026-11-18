"use client";

import { FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge, EmptyState, Field } from "@/components/ui/kit";
import { Dialog, useRun } from "@/components/ui/overlays";
import { MoneyInput } from "@/components/ui/money-input";
import { createProposalAction } from "@/lib/actions/business";
import { saveServiceAction } from "@/lib/actions/business";
import { PROPOSAL_STATUS, labelOf } from "@/lib/config/crm";
import { fmtDate } from "@/lib/dates";
import { brl, centsToInput, parseMoney } from "@/lib/money";

type P = { id: string; title: string; status: string; version: number; totalCents: number; companyName: string; updatedAt: Date };
type S = { id: string; name: string; description: string | null; defaultScope: string | null; basePriceCents: number | null; estimatedDays: number | null; recurring: boolean; active: boolean };
type DealOpt = { id: string; companyId: string; label: string };

const tone = (s: string) => (s === "aprovada" ? "ok" : s === "recusada" || s === "expirada" ? "danger" : s === "enviada" || s === "visualizada" ? "info" : "neutral");

export function ProposalsClient({ tab, status, proposals, services, companies, deals }: { tab: "propostas" | "catalogo"; status: string; proposals: P[]; services: S[]; companies: { id: string; name: string }[]; deals: DealOpt[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [newOpen, setNewOpen] = useState(sp.get("novo") === "1");
  const [svc, setSvc] = useState<S | "novo" | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-lg border border-line p-0.5 text-sm">
          {([["propostas", "Propostas"], ["catalogo", "Catálogo de serviços"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => router.push(`/propostas?aba=${k}`)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>{l}</button>)}
        </div>
        {tab === "propostas" && <select className="input w-auto" value={status} onChange={(e) => router.push(`/propostas?${e.target.value ? `status=${e.target.value}` : ""}`)} aria-label="Status"><option value="">Todos os status</option>{PROPOSAL_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
        {tab === "propostas" ? <button className="btn btn-primary btn-sm ml-auto" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Nova proposta</button> : <button className="btn btn-primary btn-sm ml-auto" onClick={() => setSvc("novo")}><Plus className="h-4 w-4" /> Novo serviço</button>}
      </div>

      {tab === "propostas" ? (
        proposals.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma proposta" description="Crie um rascunho a partir de uma oportunidade: escopo, entregáveis, valores e condições. Versões enviadas ficam congeladas." action={<button className="btn btn-primary" onClick={() => setNewOpen(true)}>Nova proposta</button>} />
        ) : (
          <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-xs text-muted"><tr>{["Proposta", "Cliente", "Valor", "Status", "Atualizada"].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}</tr></thead><tbody>
            {proposals.map((p) => <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-fg/5"><td className="px-4 py-2.5"><Link href={`/propostas/${p.id}`} className="font-medium hover:text-brand hover:underline">{p.title}</Link> <span className="text-xs text-muted">v{p.version}</span></td><td className="px-4 py-2.5 text-muted">{p.companyName}</td><td className="px-4 py-2.5 tabular-nums">{brl(p.totalCents)}</td><td className="px-4 py-2.5"><Badge tone={tone(p.status)}>{labelOf(PROPOSAL_STATUS, p.status)}</Badge></td><td className="px-4 py-2.5 text-muted">{fmtDate(p.updatedAt)}</td></tr>)}
          </tbody></table></div>
        )
      ) : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-xs text-muted"><tr>{["Serviço", "Preço de referência", "Prazo", "Recorrente", ""].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}</tr></thead><tbody>
          {services.map((s) => <tr key={s.id} className={`border-b border-line/60 last:border-0 ${s.active ? "" : "opacity-50"}`}><td className="px-4 py-2.5"><div className="font-medium">{s.name}{!s.active && <span className="ml-2 text-xs text-muted">(inativo)</span>}</div><div className="max-w-md truncate text-xs text-muted">{s.description}</div></td><td className="px-4 py-2.5 tabular-nums">{s.basePriceCents == null ? <span className="text-muted">a definir</span> : brl(s.basePriceCents)}</td><td className="px-4 py-2.5 text-muted">{s.estimatedDays ? `${s.estimatedDays} dias` : "—"}</td><td className="px-4 py-2.5 text-muted">{s.recurring ? "Sim" : "Não"}</td><td className="px-4 py-2.5 text-right"><button className="rounded p-1.5 text-muted hover:bg-fg/8 hover:text-fg" onClick={() => setSvc(s)} aria-label={`Editar ${s.name}`}><Pencil className="h-4 w-4" /></button></td></tr>)}
        </tbody></table><p className="border-t border-line px-4 py-2 text-xs text-muted">Preços são referência comercial: ao montar uma proposta o valor é copiado e pode ser ajustado, sem alterar propostas anteriores.</p></div>
      )}

      <NewProposalDialog open={newOpen} onClose={() => setNewOpen(false)} companies={companies} deals={deals} initialCompany={sp.get("empresa") ?? ""} initialDeal={sp.get("oportunidade") ?? ""} />
      <ServiceDialog key={svc === "novo" ? "novo" : svc?.id ?? "x"} svc={svc} onClose={() => setSvc(null)} />
    </>
  );
}

function NewProposalDialog({ open, onClose, companies, deals, initialCompany, initialDeal }: { open: boolean; onClose: () => void; companies: { id: string; name: string }[]; deals: DealOpt[]; initialCompany: string; initialDeal: string }) {
  const router = useRouter();
  const { run, pending } = useRun();
  const [companyId, setCompanyId] = useState(initialCompany || deals.find((d) => d.id === initialDeal)?.companyId || "");
  const [dealId, setDealId] = useState(initialDeal);
  const [title, setTitle] = useState("");
  const dealOptions = deals.filter((d) => !companyId || d.companyId === companyId);
  return (
    <Dialog open={open} onClose={onClose} title="Nova proposta">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const co = companies.find((c) => c.id === companyId); run(() => createProposalAction({ companyId, dealId: dealId || null, title: title.trim() || `Proposta — ${co?.name ?? ""}`, items: [] }), { onOk: (p) => router.push(`/propostas/${p.id}`), refresh: false }); }}>
        <Field label="Cliente / empresa"><select required className="input" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setDealId(""); }}><option value="">Escolha…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Oportunidade (opcional)"><select className="input" value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">—</option>{dealOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Site institucional — Studio Aurora" /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !companyId}>Criar rascunho</button></div>
      </form>
    </Dialog>
  );
}

function ServiceDialog({ svc, onClose }: { svc: S | "novo" | null; onClose: () => void }) {
  const { run, pending } = useRun();
  const s = svc && svc !== "novo" ? svc : null;
  const [f, setF] = useState({ name: s?.name ?? "", description: s?.description ?? "", defaultScope: s?.defaultScope ?? "", price: centsToInput(s?.basePriceCents), days: s?.estimatedDays?.toString() ?? "", recurring: s?.recurring ?? false, active: s?.active ?? true });
  return (
    <Dialog open={svc !== null} onClose={onClose} title={s ? "Editar serviço" : "Novo serviço"} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => saveServiceAction(s?.id ?? null, { name: f.name, description: f.description || null, defaultScope: f.defaultScope || null, basePriceCents: parseMoney(f.price), estimatedDays: f.days ? Number(f.days) : null, recurring: f.recurring, active: f.active }), { ok: "Serviço salvo.", onOk: onClose }); }}>
        <Field label="Nome *" className="sm:col-span-2"><input required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Preço de referência (opcional)"><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Prazo estimado (dias)"><input type="number" min={0} className="input" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
        <Field label="Escopo padrão" className="sm:col-span-2"><textarea className="input" rows={4} value={f.defaultScope} onChange={(e) => setF({ ...f, defaultScope: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} /> Cobrança recorrente</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo</label>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !f.name.trim()}>Salvar</button></div>
      </form>
    </Dialog>
  );
}

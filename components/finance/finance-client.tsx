"use client";

import { Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge, EmptyState, Field } from "@/components/ui/kit";
import { ConfirmButton, Dialog, useRun } from "@/components/ui/overlays";
import { MoneyInput } from "@/components/ui/money-input";
import { cancelReceivableAction, createReceivablesAction, deletePaymentAction, registerPaymentAction } from "@/lib/actions/business";
import { PAYMENT_METHODS, labelOf } from "@/lib/config/crm";
import { fmtYmd, ymdSP } from "@/lib/dates";
import { brl, centsToInput, parseMoney, type ReceivableState } from "@/lib/money";
import { useNow } from "@/lib/use-now";
import type { ReceivableItem } from "@/lib/services/finance";

const STATE_LABEL: Record<ReceivableState, string> = { paga: "Paga", parcial: "Parcial", vencida: "Vencida", a_vencer: "A vencer", cancelada: "Cancelada" };
const STATE_TONE: Record<ReceivableState, "ok" | "warn" | "danger" | "neutral" | "info"> = { paga: "ok", parcial: "warn", vencida: "danger", a_vencer: "info", cancelada: "neutral" };

export function FinanceClient({ receivables, state, companies, projects }: { receivables: ReceivableItem[]; state: string; companies: { id: string; name: string }[]; projects: { id: string; name: string; companyId: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { run } = useRun();
  const [newOpen, setNewOpen] = useState(sp.get("novo") === "1");
  const [paying, setPaying] = useState<ReceivableItem | null>(null);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={state} onChange={(e) => router.push(`/financeiro${e.target.value ? `?estado=${e.target.value}` : ""}`)} aria-label="Estado">
          <option value="">Todas as cobranças</option>{(Object.keys(STATE_LABEL) as ReceivableState[]).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
        </select>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Nova cobrança</button>
      </div>
      {receivables.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma cobrança" description="Cobranças nascem ao fechar um negócio (criadas a partir da proposta aprovada) ou manualmente aqui. Pagamentos são registrados à mão — não há gateway nesta versão." action={<button className="btn btn-primary" onClick={() => setNewOpen(true)}>Nova cobrança</button>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{["Vencimento", "Cobrança", "Cliente", "Valor", "Recebido", "Estado", ""].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {receivables.map((r) => (
                <tr key={r.id} className={`border-b border-line/60 last:border-0 ${r.state === "cancelada" ? "opacity-50" : ""}`}>
                  <td className={`px-4 py-2.5 tabular-nums ${r.state === "vencida" ? "font-medium text-danger" : ""}`}>{fmtYmd(r.dueDate)}</td>
                  <td className="px-4 py-2.5"><div className="max-w-[260px] truncate">{r.description}</div>{r.projectId && <Link href={`/projetos/${r.projectId}`} className="text-xs text-muted hover:text-brand hover:underline">{r.projectName}</Link>}</td>
                  <td className="px-4 py-2.5"><Link href={`/empresas/${r.companyId}`} className="hover:text-brand hover:underline">{r.companyName}</Link></td>
                  <td className="px-4 py-2.5 tabular-nums">{brl(r.amountCents)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{brl(r.paidCents)}{r.payments.length > 0 && <details className="text-xs text-muted"><summary className="cursor-pointer">{r.payments.length} pagamento(s)</summary><ul className="mt-1 space-y-1">{r.payments.map((p) => <li key={p.id} className="flex items-center gap-2">{fmtYmd(p.paidAt)} · {brl(p.amountCents)}{p.method ? ` · ${labelOf(PAYMENT_METHODS, p.method)}` : ""}<ConfirmButton className="text-danger hover:underline" label="Remover?" onConfirm={() => run(() => deletePaymentAction(p.id), { ok: "Pagamento removido." })}>remover</ConfirmButton></li>)}</ul></details>}</td>
                  <td className="px-4 py-2.5"><Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{r.state !== "paga" && r.state !== "cancelada" && <button className="btn btn-ghost btn-sm" onClick={() => setPaying(r)}>Registrar pagamento</button>}{r.state !== "cancelada" && r.paidCents === 0 && <ConfirmButton className="ml-1 rounded p-1.5 text-xs text-muted hover:text-danger" label="Cancelar?" onConfirm={() => run(() => cancelReceivableAction(r.id), { ok: "Cobrança cancelada." })}>cancelar</ConfirmButton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewReceivable open={newOpen} onClose={() => setNewOpen(false)} companies={companies} projects={projects} />
      <PaymentDialog r={paying} onClose={() => setPaying(null)} />
    </>
  );
}

function NewReceivable({ open, onClose, companies, projects }: { open: boolean; onClose: () => void; companies: { id: string; name: string }[]; projects: { id: string; name: string; companyId: string }[] }) {
  const { run, pending } = useRun();
  const now = useNow();
  const [f, setF] = useState({ companyId: "", projectId: "", description: "", amount: "", due: ymdSP(new Date(now + 7 * 86_400_000)), installments: "1" });
  return (
    <Dialog open={open} onClose={onClose} title="Nova cobrança">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => createReceivablesAction({ companyId: f.companyId, projectId: f.projectId || null, description: f.description, amountCents: parseMoney(f.amount) ?? 0, dueDate: f.due, installments: Number(f.installments) || 1 }), { ok: "Cobrança criada.", onOk: onClose }); }}>
        <Field label="Cliente *" className="sm:col-span-2"><select required className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value, projectId: "" })}><option value="">Escolha…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Projeto (opcional)" className="sm:col-span-2"><select className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">—</option>{projects.filter((p) => p.companyId === f.companyId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Descrição *" className="sm:col-span-2"><input required className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: Entrada — site institucional" /></Field>
        <Field label="Valor total *"><MoneyInput required value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Parcelas"><input type="number" min={1} max={60} className="input" value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></Field>
        <Field label="Primeiro vencimento *"><input required type="date" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        {Number(f.installments) > 1 && parseMoney(f.amount) && <p className="self-end text-xs text-muted">{f.installments} parcelas mensais de ~{brl(Math.round((parseMoney(f.amount) ?? 0) / Number(f.installments)))}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !f.companyId || !f.description.trim() || !parseMoney(f.amount)}>Criar</button></div>
      </form>
    </Dialog>
  );
}

function PaymentDialog({ r, onClose }: { r: ReceivableItem | null; onClose: () => void; pending?: boolean }) {
  return (
    <Dialog open={!!r} onClose={onClose} title="Registrar pagamento">
      {r && <PaymentForm key={r.id} r={r} onClose={onClose} />}
    </Dialog>
  );
}

function PaymentForm({ r, onClose }: { r: ReceivableItem; onClose: () => void }) {
  const { run, pending } = useRun();
  const balance = r.amountCents - r.paidCents;
  const [f, setF] = useState({ amount: centsToInput(balance), date: ymdSP(), method: "pix", notes: "" });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => registerPaymentAction({ receivableId: r.id, amountCents: parseMoney(f.amount) ?? 0, paidAt: f.date, method: f.method as "pix", notes: f.notes || null }), { ok: "Pagamento registrado.", onOk: onClose }); }}>
      <p className="text-sm sm:col-span-2"><strong>{r.description}</strong><br /><span className="text-muted">Saldo em aberto: {brl(balance)}</span></p>
      <Field label="Valor recebido"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
      <Field label="Data"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Forma"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
      <Field label="Observação"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !parseMoney(f.amount)}>Registrar</button></div>
    </form>
  );
}

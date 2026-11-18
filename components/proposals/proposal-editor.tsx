"use client";

import { Check, Copy, Plus, Printer, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge, Field, SectionCard } from "@/components/ui/kit";
import { ConfirmButton, useRun } from "@/components/ui/overlays";
import { MoneyInput } from "@/components/ui/money-input";
import { deleteProposalAction, newProposalVersionAction, proposalStatusAction, updateProposalAction } from "@/lib/actions/business";
import { PROPOSAL_STATUS, labelOf } from "@/lib/config/crm";
import { fmtDate, fmtDateTime, fmtYmd } from "@/lib/dates";
import { brl, centsToInput, parseMoney, proposalTotals } from "@/lib/money";

type Item = { serviceId: string | null; description: string; quantity: number; price: string };
type Props = {
  proposal: { id: string; title: string; status: string; version: number; companyId: string; dealId: string | null; contactId: string | null; diagnosis: string | null; scope: string | null; deliverables: string | null; timeline: string | null; revisionsIncluded: number | null; paymentTerms: string | null; installments: number; discountCents: number; validUntil: string | null; notes: string | null; sentAt: Date | null };
  items: { serviceId: string | null; description: string; quantity: number; unitPriceCents: number }[];
  events: { id: string; kind: string; note: string | null; createdAt: Date }[];
  services: { id: string; name: string; basePriceCents: number | null; defaultScope: string | null }[];
  companyName: string;
  dealTitle: string | null;
  sender: string;
};

export function ProposalEditor({ proposal: p, items: initialItems, events, services, companyName, dealTitle, sender }: Props) {
  const router = useRouter();
  const { run, pending } = useRun();
  const editable = p.status === "rascunho";
  const [f, setF] = useState({ title: p.title, diagnosis: p.diagnosis ?? "", scope: p.scope ?? "", deliverables: p.deliverables ?? "", timeline: p.timeline ?? "", revisions: p.revisionsIncluded?.toString() ?? "", paymentTerms: p.paymentTerms ?? "", installments: String(p.installments), discount: centsToInput(p.discountCents || null), validUntil: p.validUntil ?? "", notes: p.notes ?? "" });
  const [items, setItems] = useState<Item[]>(initialItems.map((i) => ({ serviceId: i.serviceId, description: i.description, quantity: i.quantity, price: centsToInput(i.unitPriceCents) })));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const totals = useMemo(() => proposalTotals(items.map((i) => ({ quantity: i.quantity, unitPriceCents: parseMoney(i.price) ?? 0 })), parseMoney(f.discount) ?? 0), [items, f.discount]);
  const n = Math.max(1, Number(f.installments) || 1);

  const payload = () => ({
    companyId: p.companyId, dealId: p.dealId, contactId: p.contactId, title: f.title, diagnosis: f.diagnosis || null, scope: f.scope || null, deliverables: f.deliverables || null, timeline: f.timeline || null,
    revisionsIncluded: f.revisions === "" ? null : Number(f.revisions), paymentTerms: f.paymentTerms || null, installments: n, discountCents: totals.discountCents, validUntil: f.validUntil || null, notes: f.notes || null,
    items: items.filter((i) => i.description.trim()).map((i) => ({ serviceId: i.serviceId, description: i.description, quantity: i.quantity, unitPriceCents: parseMoney(i.price) ?? 0 })),
  });
  const save = (after?: () => void) => run(() => updateProposalAction(p.id, payload()), { ok: after ? undefined : "Rascunho salvo.", onOk: after, refresh: !after });
  const status = (s: string, ok: string) => run(() => proposalStatusAction(p.id, s), { ok });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4 print:hidden">
        <SectionCard title="Status e ações">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={p.status === "aprovada" ? "ok" : p.status === "recusada" || p.status === "expirada" ? "danger" : "info"}>{labelOf(PROPOSAL_STATUS, p.status)}</Badge>
            <span className="text-xs text-muted">v{p.version}{p.sentAt ? ` · enviada em ${fmtDate(p.sentAt)}` : ""}</span>
            <span className="ml-auto flex flex-wrap gap-2">
              {editable && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => save(() => status("enviada", "Marcada como enviada. A proposta agora está congelada."))}><Send className="h-4 w-4" /> Marcar como enviada</button>}
              {(p.status === "enviada" || p.status === "visualizada") && <>
                {p.status === "enviada" && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => status("visualizada", "Registrada como visualizada.")}>Visualizada</button>}
                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => status("aprovada", "Proposta aprovada.")}><Check className="h-4 w-4" /> Aprovada</button>
                <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => status("recusada", "Registrada como recusada.")}><X className="h-4 w-4" /> Recusada</button>
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => status("expirada", "Marcada como expirada.")}>Expirada</button>
              </>}
              {!editable && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => newProposalVersionAction(p.id), { ok: "Nova versão criada.", onOk: (v) => router.push(`/propostas/${v.id}`), refresh: false })}><Copy className="h-4 w-4" /> Nova versão</button>}
              {editable && <ConfirmButton onConfirm={() => run(() => deleteProposalAction(p.id), { ok: "Rascunho excluído.", onOk: () => router.push("/propostas"), refresh: false })}>Excluir</ConfirmButton>}
            </span>
          </div>
          {p.status === "aprovada" && p.dealId && <p className="mt-3 text-sm text-muted">Proposta aprovada. Para fechar o negócio e criar projeto e cobranças, use <Link href={`/crm?deal=${p.dealId}`} className="text-brand hover:underline">“Fechar e criar projeto” na oportunidade</Link>.</p>}
          {!editable && <p className="mt-3 text-xs text-muted">Esta versão está congelada para preservar o que foi combinado. Edições entram numa nova versão.</p>}
        </SectionCard>

        <SectionCard title="Conteúdo">
          <fieldset disabled={!editable || pending} className="grid gap-3 sm:grid-cols-2">
            <Field label="Título" className="sm:col-span-2"><input className="input" value={f.title} onChange={set("title")} /></Field>
            <Field label="Diagnóstico do negócio" className="sm:col-span-2" hint="Só fatos que você confirmou — hipóteses não entram como fato."><textarea className="input" rows={3} value={f.diagnosis} onChange={set("diagnosis")} /></Field>
            <Field label="Escopo" className="sm:col-span-2"><textarea className="input" rows={4} value={f.scope} onChange={set("scope")} /></Field>
            <Field label="Entregáveis" className="sm:col-span-2"><textarea className="input" rows={3} value={f.deliverables} onChange={set("deliverables")} /></Field>
            <Field label="Prazos"><textarea className="input" rows={2} value={f.timeline} onChange={set("timeline")} /></Field>
            <Field label="Rodadas de revisão incluídas"><input type="number" min={0} className="input" value={f.revisions} onChange={set("revisions")} /></Field>
            <Field label="Validade da proposta"><input type="date" className="input" value={f.validUntil} onChange={set("validUntil")} /></Field>
            <Field label="Observações"><input className="input" value={f.notes} onChange={set("notes")} /></Field>
          </fieldset>
        </SectionCard>

        <SectionCard title="Itens e investimento" action={editable && <select className="input w-auto py-1 text-xs" value="" onChange={(e) => { const s = services.find((x) => x.id === e.target.value); if (s) setItems((xs) => [...xs, { serviceId: s.id, description: s.name, quantity: 1, price: centsToInput(s.basePriceCents) }]); if (s?.defaultScope && !f.scope) setF((x) => ({ ...x, scope: s.defaultScope! })); }} aria-label="Adicionar do catálogo"><option value="">+ Do catálogo…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}>
          <fieldset disabled={!editable || pending} className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_120px_auto] items-center gap-2">
                <input className="input" value={it.description} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Descrição do item" aria-label="Descrição" />
                <input type="number" min={1} className="input" value={it.quantity} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} aria-label="Quantidade" />
                <MoneyInput value={it.price} onChange={(v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
                <button type="button" className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Remover item"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems((xs) => [...xs, { serviceId: null, description: "", quantity: 1, price: "" }])}><Plus className="h-4 w-4" /> Item livre</button>
            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
              <Field label="Desconto"><MoneyInput value={f.discount} onChange={(v) => setF((s) => ({ ...s, discount: v }))} /></Field>
              <Field label="Parcelas"><input type="number" min={1} max={60} className="input" value={f.installments} onChange={set("installments")} /></Field>
              <Field label="Condições de pagamento"><input className="input" value={f.paymentTerms} onChange={set("paymentTerms")} placeholder="Ex.: 50% na aprovação, 50% na entrega" /></Field>
            </div>
          </fieldset>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{brl(totals.subtotalCents)}</dd></div>
            {totals.discountCents > 0 && <div className="flex justify-between"><dt className="text-muted">Desconto</dt><dd className="tabular-nums">− {brl(totals.discountCents)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{brl(totals.totalCents)}</dd></div>
            {n > 1 && <div className="flex justify-between text-xs text-muted"><dt>{n} parcelas de aproximadamente</dt><dd className="tabular-nums">{brl(Math.round(totals.totalCents / n))}</dd></div>}
          </dl>
          {editable && <div className="mt-4 flex justify-end"><button className="btn btn-primary" disabled={pending} onClick={() => save()}>{pending ? "Salvando…" : "Salvar rascunho"}</button></div>}
        </SectionCard>

        <SectionCard title="Histórico da proposta">
          <ul className="space-y-1.5 text-sm">{events.map((e) => <li key={e.id} className="flex justify-between gap-3"><span>{e.kind}{e.note ? ` — ${e.note}` : ""}</span><span className="shrink-0 text-xs text-muted">{fmtDateTime(e.createdAt)}</span></li>)}</ul>
        </SectionCard>
      </div>

      {/* Pré-visualização / impressão */}
      <div>
        <div className="mb-2 flex items-center justify-between print:hidden"><h2 className="text-sm font-semibold">Pré-visualização</h2><button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / salvar PDF</button></div>
        <article className="rounded-xl border border-line bg-white p-8 text-[#18181b] shadow-sm print:border-0 print:shadow-none">
          <header className="flex items-start justify-between border-b border-zinc-200 pb-4">
            <div><p className="font-heading text-xl font-bold">mglabs<span className="text-[#064e3b]">.</span></p><p className="text-xs text-zinc-500">Design e desenvolvimento · Goiânia/GO</p></div>
            <div className="text-right text-xs text-zinc-500"><p>Proposta v{p.version}</p>{f.validUntil && <p>Válida até {fmtYmd(f.validUntil)}</p>}</div>
          </header>
          <h1 className="mt-5 font-heading text-2xl font-semibold">{f.title}</h1>
          <p className="mt-1 text-sm text-zinc-600">Para {companyName}{dealTitle ? ` · ${dealTitle}` : ""}</p>
          {([["Diagnóstico", f.diagnosis], ["Escopo", f.scope], ["Entregáveis", f.deliverables], ["Prazos", f.timeline]] as const).map(([h, t]) => t ? <section key={h} className="mt-5"><h3 className="text-sm font-semibold text-[#064e3b]">{h}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{t}</p></section> : null)}
          {f.revisions !== "" && <p className="mt-3 text-sm">Rodadas de revisão incluídas: {f.revisions}</p>}
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-[#064e3b]">Investimento</h3>
            <table className="mt-2 w-full text-sm"><tbody>
              {items.filter((i) => i.description.trim()).map((i, k) => <tr key={k} className="border-b border-zinc-100"><td className="py-1.5">{i.description}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</td><td className="py-1.5 text-right tabular-nums">{brl((parseMoney(i.price) ?? 0) * i.quantity)}</td></tr>)}
              {totals.discountCents > 0 && <tr><td className="py-1.5 text-zinc-500">Desconto</td><td className="py-1.5 text-right tabular-nums">− {brl(totals.discountCents)}</td></tr>}
              <tr className="font-semibold"><td className="pt-2">Total</td><td className="pt-2 text-right tabular-nums">{brl(totals.totalCents)}</td></tr>
            </tbody></table>
            {(n > 1 || f.paymentTerms) && <p className="mt-2 text-sm text-zinc-600">{n > 1 ? `Em ${n} parcelas. ` : ""}{f.paymentTerms}</p>}
          </section>
          {f.notes && <p className="mt-5 text-xs text-zinc-500">{f.notes}</p>}
          <footer className="mt-8 border-t border-zinc-200 pt-3 text-xs text-zinc-500">{sender} · MGLABS</footer>
        </article>
      </div>
    </div>
  );
}

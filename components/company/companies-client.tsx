"use client";

import { Building2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { CompanyForm } from "@/components/company/company-form";
import { Badge, EmptyState } from "@/components/ui/kit";
import { Dialog } from "@/components/ui/overlays";
import { sourceLabel } from "@/lib/config/crm";
import { fmtDate } from "@/lib/dates";
import type { CompanyListItem } from "@/lib/services/companies";

type ContactItem = { id: string; name: string; role: string | null; email: string | null; phone: string | null; whatsapp: string | null; companyId: string | null; companyName: string | null; optedOut: boolean; lastContactAt: Date | null };

export function CompaniesClient({ tab, status, q, companies, contacts }: { tab: "empresas" | "contatos"; status: string; q: string; companies: CompanyListItem[]; contacts: ContactItem[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(sp.get("novo") === "1");
  const [term, setTerm] = useState(q);
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ aba: tab, ...(status ? { status } : {}), ...(term ? { q: term } : {}), ...patch });
    for (const [k, v] of [...next]) if (!v) next.delete(k);
    router.push(`/empresas?${next}`);
  };
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-lg border border-line p-0.5 text-sm">
          {(["empresas", "contatos"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => go({ aba: t })} className={`rounded-md px-3 py-1.5 capitalize ${tab === t ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>{t}</button>
          ))}
        </div>
        <form className="relative min-w-[220px] flex-1 sm:max-w-sm" onSubmit={(e) => { e.preventDefault(); go({ q: term }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nome, cidade, e-mail ou telefone" aria-label="Buscar" />
        </form>
        {tab === "empresas" && (
          <select className="input w-auto" value={status} onChange={(e) => go({ status: e.target.value })} aria-label="Situação">
            <option value="">Todas as situações</option><option value="lead">Leads</option><option value="cliente">Clientes</option><option value="inativo">Inativas</option>
          </select>
        )}
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova empresa</button>
      </div>

      {tab === "empresas" ? (
        companies.length === 0 ? (
          <EmptyState icon={Building2} title={q || status ? "Nada encontrado" : "Nenhuma empresa cadastrada"} description={q || status ? "Ajuste a busca ou os filtros." : "Cadastre uma empresa manualmente ou envie negócios do Radar para o CRM."} action={<button className="btn btn-primary" onClick={() => setOpen(true)}>Cadastrar empresa</button>} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted"><tr>{["Empresa", "Situação", "Contato", "Origem", "Negócios", "Última atividade"].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-fg/5">
                    <td className="px-4 py-2.5"><Link href={`/empresas/${c.id}`} className="font-medium hover:text-brand hover:underline">{c.name}</Link><div className="text-xs text-muted">{[c.category, c.city].filter(Boolean).join(" · ")}</div></td>
                    <td className="px-4 py-2.5"><Badge tone={c.status === "cliente" ? "ok" : c.status === "inativo" ? "neutral" : "brand"}>{c.status === "cliente" ? "Cliente" : c.status === "inativo" ? "Inativa" : "Lead"}</Badge></td>
                    <td className="px-4 py-2.5 text-muted"><div>{c.phone ?? "—"}</div><div className="text-xs">{c.email ?? ""}</div></td>
                    <td className="px-4 py-2.5 text-muted">{sourceLabel(c.source)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{c.openDeals}</td>
                    <td className="px-4 py-2.5 text-muted">{fmtDate(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : contacts.length === 0 ? (
        <EmptyState title="Nenhum contato" description="Adicione contatos na ficha de cada empresa (nome, cargo, WhatsApp e e-mail)." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{["Contato", "Empresa", "Canais", "Último contato"].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {contacts.map((k) => (
                <tr key={k.id} className="border-b border-line/60 last:border-0 hover:bg-fg/5">
                  <td className="px-4 py-2.5"><span className="font-medium">{k.name}</span>{k.role && <span className="text-muted"> · {k.role}</span>} {k.optedOut && <Badge tone="danger">não contatar</Badge>}</td>
                  <td className="px-4 py-2.5">{k.companyId ? <Link href={`/empresas/${k.companyId}`} className="hover:text-brand hover:underline">{k.companyName}</Link> : "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{k.optedOut ? "—" : [k.whatsapp ?? k.phone, k.email].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{fmtDate(k.lastContactAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Nova empresa" wide>
        <CompanyForm onDone={() => setOpen(false)} onCreated={(c) => { setOpen(false); router.push(`/empresas/${c.id}`); }} />
      </Dialog>
    </>
  );
}

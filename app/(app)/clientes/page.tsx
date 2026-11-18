import { Users } from "lucide-react";
import Link from "next/link";

import { Gate } from "@/components/shell/gate";
import { Badge, EmptyState, Page, PageHeader } from "@/components/ui/kit";
import { fmtDate } from "@/lib/dates";
import { brl } from "@/lib/money";
import { canModule } from "@/lib/services/ctx";
import { listCompanies } from "@/lib/services/companies";
import { listProjects } from "@/lib/services/projects";
import { listReceivables } from "@/lib/services/finance";

export const metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <Gate>
      {async (ctx) => {
        const [clients, projects, recs] = await Promise.all([listCompanies(ctx, { status: "cliente", limit: 200 }), listProjects(ctx), canModule(ctx, "financeiro") ? listReceivables(ctx) : Promise.resolve(null)]);
        return (
          <>
            <PageHeader title="Clientes" description="Empresas com negócio fechado. Um negócio ganho vira cliente e projeto pelo botão “Fechar e criar projeto” no CRM." />
            <Page>
              {clients.length === 0 ? (
                <EmptyState icon={Users} title="Ainda não há clientes" description="Quando você fechar um negócio no CRM e criar o projeto, a empresa passa a aparecer aqui com seus projetos e cobranças." action={<Link href="/crm" className="btn btn-primary">Abrir o CRM</Link>} />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {clients.map((c) => {
                    const ps = projects.filter((p) => p.companyId === c.id);
                    const rs = recs?.filter((r) => r.companyId === c.id && r.state !== "cancelada") ?? [];
                    const toReceive = rs.reduce((s, r) => s + (r.amountCents - Math.min(r.amountCents, r.paidCents)), 0);
                    const received = rs.reduce((s, r) => s + Math.min(r.amountCents, r.paidCents), 0);
                    return (
                      <article key={c.id} className="card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><Link href={`/empresas/${c.id}`} className="block truncate font-heading text-base font-semibold hover:text-brand hover:underline">{c.name}</Link><p className="text-xs text-muted">{[c.category, c.city].filter(Boolean).join(" · ")} · cliente desde {fmtDate(c.createdAt)}</p></div>
                          <Badge tone="ok">Cliente</Badge>
                        </div>
                        <ul className="mt-3 space-y-1 text-sm">
                          {ps.length === 0 && <li className="text-muted">Nenhum projeto.</li>}
                          {ps.map((p) => <li key={p.id}><Link href={`/projetos/${p.id}`} className="flex justify-between gap-2 hover:text-brand"><span className="truncate">{p.name}</span><span className="shrink-0 text-xs text-muted">{p.status.replace("_", " ")}</span></Link></li>)}
                        </ul>
                        {recs && <p className="mt-3 border-t border-line pt-2 text-xs text-muted">Recebido {brl(received, { compact: true })} · A receber {brl(toReceive, { compact: true })}</p>}
                      </article>
                    );
                  })}
                </div>
              )}
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

import { Users } from "lucide-react";
import Link from "next/link";

import { CompaniesClient } from "@/components/company/companies-client";
import { CrmClient } from "@/components/crm/crm-client";
import { ProposalsClient } from "@/components/proposals/proposals-client";
import { Gate } from "@/components/shell/gate";
import { Badge, EmptyState, Page, PageHeader } from "@/components/ui/kit";
import { aiStatusAction } from "@/lib/actions/ai";
import { fmtDate } from "@/lib/dates";
import { brl } from "@/lib/money";
import { listCompanies, listContacts } from "@/lib/services/companies";
import { assertModule, canModule } from "@/lib/services/ctx";
import { listDeals, listStages } from "@/lib/services/deals";
import { listReceivables } from "@/lib/services/finance";
import { listProjects } from "@/lib/services/projects";
import { listProposals, listServices } from "@/lib/services/proposals";

export const metadata = { title: "CRM" };

type CrmTab = "funil" | "empresas" | "clientes" | "propostas";

const TABS: { id: CrmTab; label: string; href: string }[] = [
  { id: "funil", label: "Funil", href: "/crm" },
  { id: "empresas", label: "Empresas e contatos", href: "/crm?aba=empresas" },
  { id: "clientes", label: "Clientes", href: "/crm?aba=clientes" },
  { id: "propostas", label: "Propostas", href: "/crm?aba=propostas" },
];

function CrmTabs({ current }: { current: CrmTab }) {
  return (
    <nav aria-label="Visões do CRM" className="flex flex-wrap gap-1 border-b border-line bg-background px-4 pt-2 sm:px-8">
      {TABS.map((t) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${active ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function CrmPage({ searchParams }: PageProps<"/crm">) {
  return (
    <Gate>
      {async (ctx) => {
        assertModule(ctx, "comercial");
        const sp = await searchParams;
        const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
        const rawAba = one("aba");
        const aba: CrmTab = rawAba === "empresas" || rawAba === "clientes" || rawAba === "propostas" ? rawAba : "funil";

        if (aba === "empresas") {
          const sub = one("sub") === "contatos" ? "contatos" : "empresas";
          const status = ["lead", "cliente", "inativo"].includes(one("status")) ? one("status") : "";
          const q = one("q").slice(0, 80);
          const [companies, contacts] = await Promise.all([
            sub === "empresas" ? listCompanies(ctx, { q, status, limit: 200 }) : Promise.resolve([]),
            sub === "contatos" ? listContacts(ctx, { q, limit: 300 }) : Promise.resolve([]),
          ]);
          return (
            <div className="flex h-full flex-col">
              <CrmTabs current="empresas" />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PageHeader title="Empresas e contatos" description="Cadastro mestre do CRM. Clique em uma empresa para abrir a ficha 360° completa." />
                <Page><CompaniesClient tab={sub} status={status} q={q} companies={companies} contacts={contacts} basePath="/crm?aba=empresas" /></Page>
              </div>
            </div>
          );
        }

        if (aba === "clientes") {
          const [clients, projects, recs] = await Promise.all([
            listCompanies(ctx, { status: "cliente", limit: 200 }),
            listProjects(ctx),
            canModule(ctx, "financeiro") ? listReceivables(ctx) : Promise.resolve(null),
          ]);
          return (
            <div className="flex h-full flex-col">
              <CrmTabs current="clientes" />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PageHeader title="Clientes" description="Empresas com negócio fechado, projetos vinculados e recebíveis." />
                <Page>
                  {clients.length === 0 ? (
                    <EmptyState icon={Users} title="Ainda não há clientes" description="Quando você fechar um negócio no funil e criar o projeto, a empresa passa a aparecer aqui." action={<Link href="/crm" className="btn btn-primary">Abrir o funil</Link>} />
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
                              <div className="min-w-0">
                                <Link href={`/empresas/${c.id}`} className="block truncate font-heading text-base font-semibold hover:text-brand hover:underline">{c.name}</Link>
                                <p className="text-xs text-muted">{[c.category, c.city].filter(Boolean).join(" · ")} · cliente desde {fmtDate(c.createdAt)}</p>
                              </div>
                              <Badge tone="ok">Cliente</Badge>
                            </div>
                            <ul className="mt-3 space-y-1 text-sm">
                              {ps.length === 0 && <li className="text-muted">Nenhum projeto.</li>}
                              {ps.map((p) => (
                                <li key={p.id}>
                                  <Link href={`/projetos/${p.id}`} className="flex justify-between gap-2 hover:text-brand">
                                    <span className="truncate">{p.name}</span>
                                    <span className="shrink-0 text-xs text-muted">{p.status.replace("_", " ")}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                            {recs && <p className="mt-3 border-t border-line pt-2 text-xs text-muted">Recebido {brl(received, { compact: true })} · A receber {brl(toReceive, { compact: true })}</p>}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </Page>
              </div>
            </div>
          );
        }

        if (aba === "propostas") {
          const sub = one("sub") === "catalogo" ? "catalogo" : "propostas";
          const status = one("status");
          const [proposals, services, companies, deals] = await Promise.all([
            listProposals(ctx, { status: status || undefined }),
            listServices(ctx, { includeInactive: true }),
            listCompanies(ctx, { limit: 300 }),
            listDeals(ctx, { open: true, limit: 300 }),
          ]);
          const names = new Map(companies.map((c) => [c.id, c.name]));
          return (
            <div className="flex h-full flex-col">
              <CrmTabs current="propostas" />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PageHeader title="Propostas" description="Rascunhos, versões e status. Você também cria propostas direto dentro de cada oportunidade." />
                <Page>
                  <ProposalsClient
                    tab={sub}
                    status={status}
                    proposals={proposals.map((p) => ({ id: p.id, title: p.title, status: p.status, version: p.version, totalCents: p.totalCents, companyName: names.get(p.companyId) ?? "—", updatedAt: p.updatedAt }))}
                    services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, defaultScope: s.defaultScope, basePriceCents: s.basePriceCents, estimatedDays: s.estimatedDays, recurring: s.recurring, active: s.active }))}
                    companies={companies.map((c) => ({ id: c.id, name: c.name }))}
                    deals={deals.map((d) => ({ id: d.id, companyId: d.companyId, label: `${d.title}` }))}
                    basePath="/crm?aba=propostas"
                  />
                </Page>
              </div>
            </div>
          );
        }

        const [deals, stages, companies, services, ai] = await Promise.all([
          listDeals(ctx, { limit: 1000 }),
          listStages(ctx),
          listCompanies(ctx, { limit: 200 }),
          listServices(ctx),
          aiStatusAction(),
        ]);
        return (
          <div className="flex h-full flex-col">
            <CrmTabs current="funil" />
            <div className="min-h-0 flex-1">
              <CrmClient
                aiEnabled={ai.enabled}
                deals={deals}
                stages={stages.map((s) => ({ key: s.key, label: s.label, kind: s.kind, probability: s.probability }))}
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
                services={[...new Set([...services.map((s) => s.name), ...deals.map((d) => d.serviceType).filter((x): x is string => !!x)])]}
              />
            </div>
          </div>
        );
      }}
    </Gate>
  );
}

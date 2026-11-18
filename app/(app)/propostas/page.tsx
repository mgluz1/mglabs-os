import { ProposalsClient } from "@/components/proposals/proposals-client";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader, PendingNote } from "@/components/ui/kit";
import { listCompanies } from "@/lib/services/companies";
import { listDeals } from "@/lib/services/deals";
import { listProposals, listServices } from "@/lib/services/proposals";

export const metadata = { title: "Propostas" };

export default function PropostasPage({ searchParams }: PageProps<"/propostas">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const tab = sp.aba === "catalogo" ? "catalogo" : "propostas";
        const status = typeof sp.status === "string" ? sp.status : "";
        const [proposals, services, companies, deals] = await Promise.all([listProposals(ctx, { status: status || undefined }), listServices(ctx, { includeInactive: true }), listCompanies(ctx, { limit: 300 }), listDeals(ctx, { open: true, limit: 300 })]);
        const names = new Map(companies.map((c) => [c.id, c.name]));
        return (
          <>
            <PageHeader title="Propostas" description="Rascunhos, versões e status. Propostas enviadas ficam congeladas; para mudar, crie uma nova versão." />
            <Page>
              <ProposalsClient
                tab={tab}
                status={status}
                proposals={proposals.map((p) => ({ id: p.id, title: p.title, status: p.status, version: p.version, totalCents: p.totalCents, companyName: names.get(p.companyId) ?? "—", updatedAt: p.updatedAt }))}
                services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, defaultScope: s.defaultScope, basePriceCents: s.basePriceCents, estimatedDays: s.estimatedDays, recurring: s.recurring, active: s.active }))}
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
                deals={deals.map((d) => ({ id: d.id, companyId: d.companyId, label: `${d.title}` }))}
              />
              <PendingNote items={["Link compartilhável com validade, registro de visualização e exportação em PDF ainda não existem (use “Imprimir / salvar PDF” na pré-visualização).", "Assinatura eletrônica: não há validade jurídica de aceite dentro do app; o status “aprovada” é um registro seu."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

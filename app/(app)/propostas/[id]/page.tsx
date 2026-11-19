import { ProposalEditor } from "@/components/proposals/proposal-editor";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader } from "@/components/ui/kit";
import { db } from "@/lib/db";
import { crmCompanies, crmDeals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@/lib/services/ctx";
import { getProposal, listServices } from "@/lib/services/proposals";

export default function ProposalPage({ params }: PageProps<"/propostas/[id]">) {
  return (
    <Gate>
      {async (ctx) => {
        const { id } = await params;
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Proposta");
        const [{ proposal, items, events }, services] = await Promise.all([getProposal(ctx, id), listServices(ctx)]);
        const [[company], deal] = await Promise.all([db.select({ name: crmCompanies.name }).from(crmCompanies).where(eq(crmCompanies.id, proposal.companyId)), proposal.dealId ? db.select({ title: crmDeals.title }).from(crmDeals).where(eq(crmDeals.id, proposal.dealId)) : Promise.resolve([])]);
        return (
          <>
            <PageHeader back={proposal.dealId ? { href: `/crm?deal=${proposal.dealId}`, label: "Oportunidade" } : { href: "/crm?aba=propostas", label: "CRM · Propostas" }} title={proposal.title} description={`${company?.name ?? ""} · versão ${proposal.version}`} />
            <Page wide>
              <ProposalEditor
                key={proposal.id + proposal.updatedAt.getTime()}
                proposal={{ ...proposal }}
                items={items.map((i) => ({ serviceId: i.serviceId, description: i.description, quantity: i.quantity, unitPriceCents: i.unitPriceCents }))}
                events={events.map((e) => ({ id: e.id, kind: e.kind, note: e.note, createdAt: e.createdAt }))}
                services={services.map((s) => ({ id: s.id, name: s.name, basePriceCents: s.basePriceCents, defaultScope: s.defaultScope }))}
                companyName={company?.name ?? ""}
                dealTitle={deal[0]?.title ?? null}
                sender={process.env.MEU_NOME || "Miguel"}
              />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

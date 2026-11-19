import { Company360 } from "@/components/company/company-360";
import { Gate } from "@/components/shell/gate";
import { Badge, Page, PageHeader } from "@/components/ui/kit";
import { getCompany360 } from "@/lib/services/companies";
import { canModule, NotFoundError } from "@/lib/services/ctx";
import { contactBlock } from "@/lib/services/optout";

export default function CompanyPage({ params }: PageProps<"/empresas/[id]">) {
  return (
    <Gate>
      {async (ctx) => {
        const { id } = await params;
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Empresa");
        const [data, block] = await Promise.all([getCompany360(ctx, id), contactBlock(ctx, { companyId: id })]);
        const c = data.company;
        return (
          <>
            <PageHeader back={{ href: "/crm?aba=empresas", label: "CRM · Empresas" }} title={c.name} description={<span className="inline-flex items-center gap-2"><Badge tone={c.status === "cliente" ? "ok" : "brand"}>{c.status === "cliente" ? "Cliente" : c.status === "inativo" ? "Inativa" : "Lead"}</Badge>{[c.category, c.city].filter(Boolean).join(" · ")}</span>} />
            <Page wide><Company360 data={data} blocked={block.blocked} blockedReason={block.reason} canFinance={canModule(ctx, "financeiro")} /></Page>
          </>
        );
      }}
    </Gate>
  );
}

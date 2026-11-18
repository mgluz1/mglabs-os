import { CrmClient } from "@/components/crm/crm-client";
import { Gate } from "@/components/shell/gate";
import { aiStatusAction } from "@/lib/actions/ai";
import { listCompanies } from "@/lib/services/companies";
import { listDeals, listStages } from "@/lib/services/deals";
import { listServices } from "@/lib/services/proposals";

export const metadata = { title: "CRM" };

export default function CrmPage() {
  return (
    <Gate>
      {async (ctx) => {
        const [deals, stages, companies, services, ai] = await Promise.all([listDeals(ctx, { limit: 1000 }), listStages(ctx), listCompanies(ctx, { limit: 200 }), listServices(ctx), aiStatusAction()]);
        return (
          <CrmClient
            aiEnabled={ai.enabled}
            deals={deals}
            stages={stages.map((s) => ({ key: s.key, label: s.label, kind: s.kind, probability: s.probability }))}
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
            services={[...new Set([...services.map((s) => s.name), ...deals.map((d) => d.serviceType).filter((x): x is string => !!x)])]}
          />
        );
      }}
    </Gate>
  );
}

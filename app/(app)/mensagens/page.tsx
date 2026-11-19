import { MessageStudio } from "@/components/messages/message-studio";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader } from "@/components/ui/kit";
import { aiStatusAction } from "@/lib/actions/ai";
import { resolveOfferService } from "@/lib/config/crm";
import { listCompanies } from "@/lib/services/companies";
import { listDeals } from "@/lib/services/deals";
import { listDrafts, listTemplates, messageContext } from "@/lib/services/messages";
import { outreachQueue } from "@/lib/services/outreach";
import { listServices } from "@/lib/services/proposals";

export const metadata = { title: "Estúdio de Mensagens" };

export default function MensagensPage({ searchParams }: PageProps<"/mensagens">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const one = (k: string) => (typeof sp[k] === "string" && /^[0-9a-f-]{36}$/i.test(sp[k] as string) ? (sp[k] as string) : "");
        const [companies, deals, templates, drafts, services, ai, queue] = await Promise.all([
          listCompanies(ctx, { limit: 300 }),
          listDeals(ctx, { open: true, limit: 300 }),
          listTemplates(ctx),
          listDrafts(ctx, { limit: 20 }),
          listServices(ctx),
          aiStatusAction(),
          outreachQueue(ctx).catch(() => []),
        ]);
        const initial = one("oportunidade") ? `d:${one("oportunidade")}` : one("empresa") ? `c:${one("empresa")}` : "";
        const initialContext = initial ? await messageContext(ctx, initial.startsWith("d:") ? { dealId: initial.slice(2) } : { companyId: initial.slice(2) }).catch(() => null) : null;
        const catalogNames = services.map((s) => s.name);
        const serviceNames = [...new Set(["Site profissional", "Serviços MGLABS", ...catalogNames])];
        const paramService = typeof sp.servico === "string" ? (resolveOfferService(sp.servico) ?? (serviceNames.includes(sp.servico) ? sp.servico : sp.servico)) : "";
        const initialService = initialContext?.serviceType || paramService || "";
        const options = [
          ...deals.map((d) => ({ value: `d:${d.id}`, label: `${d.companyName} — ${d.title}` })),
          ...companies.map((c) => ({ value: `c:${c.id}`, label: `${c.name} (empresa)` })),
        ];
        return (
          <>
            <PageHeader title="Estúdio de Mensagens" description="Mensagens humanizadas com contexto do Radar e CRM, fila de abordagem, assistente de resposta e refino por IA (Gemini, opcional) e abertura direta no WhatsApp." />
            <Page wide>
              <MessageStudio
                options={options}
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  objective: t.objective,
                  service: t.service,
                  tone: t.tone,
                  channel: t.channel,
                  body: t.body,
                  version: t.version,
                  favorite: t.favorite,
                }))}
                drafts={drafts.map((d) => ({
                  id: d.id,
                  dealId: d.dealId,
                  companyId: d.companyId,
                  companyName: d.companyName,
                  objective: d.objective,
                  service: d.service,
                  channel: d.channel,
                  body: d.body,
                  status: d.status,
                  origin: d.origin,
                  createdAt: d.createdAt,
                  sentAt: d.sentAt,
                }))}
                services={serviceNames}
                sender={process.env.MEU_NOME || "Miguel"}
                ai={ai}
                initial={initialContext ? initial : ""}
                initialContext={initialContext}
                initialService={initialService}
                queue={queue}
              />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

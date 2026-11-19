import { FinanceClient } from "@/components/finance/finance-client";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Gate } from "@/components/shell/gate";
import { Kpi, Page, PageHeader, PendingNote, SectionCard } from "@/components/ui/kit";
import { brl } from "@/lib/money";
import type { ReceivableState } from "@/lib/money";
import { assertModule, canModule } from "@/lib/services/ctx";
import { listCompanies } from "@/lib/services/companies";
import { financeSummary, listReceivables } from "@/lib/services/finance";
import { listProjects } from "@/lib/services/projects";

export const metadata = { title: "Financeiro" };
const STATES = ["paga", "parcial", "vencida", "a_vencer", "cancelada"];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${y.slice(2)}`;
}

export default function FinanceiroPage({ searchParams }: PageProps<"/financeiro">) {
  return (
    <Gate>
      {async (ctx) => {
        assertModule(ctx, "financeiro");
        const sp = await searchParams;
        const state = typeof sp.estado === "string" && STATES.includes(sp.estado) ? (sp.estado as ReceivableState) : "";
        const [sum, recs, companies, projects] = await Promise.all([financeSummary(ctx, { months: 6 }), listReceivables(ctx, { state: state || undefined }), listCompanies(ctx, { limit: 300 }), listProjects(ctx)]);
        const max = Math.max(1, ...sum.monthly.map((m) => m.receivedCents));
        return (
          <>
            <PageHeader title="Financeiro" description="Contas a receber e pagamentos registrados à mão. Previsto, contratado, a receber e recebido são números separados." />
            <SettingsNav current="financeiro" canFinance canConfig={canModule(ctx, "config")} />
            <Page>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Kpi label="Pipeline previsto" value={brl(sum.pipelineCents, { compact: true })} hint={`Ponderado ${brl(sum.pipelineWeightedCents, { compact: true })}`} href="/crm" />
                <Kpi label="Contratado" value={brl(sum.contractedCents, { compact: true })} hint={`${sum.wonCount} negócio(s) ganho(s)`} />
                <Kpi label="A receber" value={brl(sum.toReceiveCents, { compact: true })} hint={`Cobrado ${brl(sum.billedCents, { compact: true })}`} />
                <Kpi label="Vencido" value={brl(sum.overdueCents, { compact: true })} tone={sum.overdueCents ? "danger" : undefined} hint="Parcelas atrasadas em aberto" />
                <Kpi label="Recebido" value={brl(sum.receivedCents, { compact: true })} tone={sum.receivedCents ? "ok" : undefined} hint={`Este mês ${brl(sum.receivedThisMonthCents, { compact: true })}`} />
              </div>
              {sum.monthly.length > 0 && (
                <SectionCard title="Recebido por mês" className="mb-4">
                  <ul className="flex h-36 items-end gap-3" aria-label="Recebido por mês">
                    {sum.monthly.map((m) => (
                      <li key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-xs tabular-nums text-muted">{brl(m.receivedCents, { compact: true })}</span>
                        <span className="w-full max-w-14 rounded-t bg-brand" style={{ height: `${Math.max(4, (m.receivedCents / max) * 100)}%` }} aria-hidden />
                        <span className="text-xs text-muted">{monthLabel(m.ym)}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              <FinanceClient receivables={recs} state={state} companies={companies.map((c) => ({ id: c.id, name: c.name }))} projects={projects.map((p) => ({ id: p.id, name: p.name, companyId: p.companyId }))} />
              <PendingNote items={["Despesas, comprovantes anexados, emissão de nota fiscal e conciliação automática (gateway/webhook) ainda não existem.", "Reembolso e recebimento em moeda diferente de BRL não são tratados."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

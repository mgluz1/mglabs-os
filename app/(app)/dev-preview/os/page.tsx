import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { CrmClient } from "@/components/crm/crm-client";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { STAGE_DEFS } from "@/lib/config/crm";
import type { DashboardData } from "@/lib/services/dashboard";
import type { DealCard } from "@/lib/services/deals";

// Só em desenvolvimento com UI_PREVIEW=1: telas do MGLABS OS com dados FICTÍCIOS, para revisar o visual
// sem login nem banco. ?tela=dashboard | vazio | crm  ·  ?dias=7|30|90
export default function OsPreview(props: PageProps<"/dev-preview/os">) {
  return (
    <Suspense>
      <Preview {...props} />
    </Suspense>
  );
}

const now = Date.now();
const day = 86_400_000;

const DASH: DashboardData = {
  periodDays: 30, leads: 14, newLeads: 6, openDeals: 9, pipelineCents: 3_250_000, weightedCents: 1_180_000, wonTotal: 3, wonPeriod: 2, wonValuePeriodCents: 1_050_000, lostPeriod: 1,
  openTasks: 7, overdueTasks: 2, todayTasks: 3, companies: 21, projectsActive: 2,
  funnel: STAGE_DEFS.map((s, i) => ({ key: s.key, label: s.label, kind: s.kind, count: [5, 3, 4, 2, 1, 2, 1, 3, 2][i], valueCents: [600, 450, 900, 300, 200, 700, 350, 1050, 400][i] * 1000 })),
  followups: [
    { kind: "tarefa", id: "t1", title: "Ligar para Studio Aurora", companyName: "Studio Aurora", dueAt: new Date(now - day), dealId: "d1", overdue: true },
    { kind: "negocio", id: "d2", title: "Enviar proposta revisada", companyName: "Clínica Vida Plena", dueAt: new Date(now + day), dealId: "d2", overdue: false },
    { kind: "tarefa", id: "t3", title: "Reunião de briefing", companyName: "Moraes Advocacia", dueAt: new Date(now + 3 * day), dealId: null, overdue: false },
  ],
  recent: [
    { id: "a1", kind: "etapa", content: "Movido de Conversa para Proposta", occurredAt: new Date(now - 3_600_000), companyName: "Studio Aurora", companyId: "c1", dealId: "d1", dealTitle: null },
    { id: "a2", kind: "mensagem_enviada", content: "Mensagem registrada via WhatsApp", occurredAt: new Date(now - 7_200_000), companyName: "Clínica Vida Plena", companyId: "c2", dealId: "d2", dealTitle: null },
    { id: "a3", kind: "pagamento", content: "Pagamento registrado: Entrada — site institucional", occurredAt: new Date(now - day), companyName: "Moraes Advocacia", companyId: "c3", dealId: null, dealTitle: null },
  ],
  finance: { pipelineCents: 3_250_000, pipelineWeightedCents: 1_180_000, contractedCents: 1_650_000, wonCount: 3, billedCents: 1_650_000, toReceiveCents: 900_000, overdueCents: 150_000, receivedCents: 750_000, receivedThisMonthCents: 500_000, monthly: [], byClient: [], receivedPeriodCents: 750_000 },
};
const EMPTY: DashboardData = { ...DASH, leads: 0, newLeads: 0, openDeals: 0, pipelineCents: 0, wonTotal: 0, companies: 0, funnel: [], followups: [], recent: [], finance: null };

const deal = (i: number, p: Partial<DealCard>): DealCard => ({
  id: `d${i}`, title: "Site institucional", companyId: `c${i}`, companyName: "Empresa", category: null, city: "Goiânia", stageId: "s", stageKey: "novo", stageKind: "open", valueCents: 300_000, probability: 20, source: "manual", serviceType: null,
  nextStep: null, nextStepAt: null, expectedCloseAt: null, lostReason: null, tags: [], score: null, placeId: null, contactName: null, openTasks: 0, lastActivityAt: null, createdAt: new Date(now - 5 * day), updatedAt: new Date(now - day), ...p,
});
const DEALS: DealCard[] = [
  deal(1, { companyName: "Studio Aurora", title: "Site institucional — Studio Aurora", stageKey: "proposta", valueCents: 450_000, source: "indicacao", nextStep: "Ligar", nextStepAt: new Date(now - day), openTasks: 2 }),
  deal(2, { companyName: "Clínica Vida Plena", title: "Landing page", stageKey: "conversa", valueCents: 180_000, score: 82, source: "radar", nextStep: "Enviar proposta", nextStepAt: new Date(now + 2 * day) }),
  deal(3, { companyName: "Barbearia Navalha de Ouro", title: "Site + agendamento", stageKey: "qualificado", valueCents: 320_000, score: 91, source: "radar" }),
  deal(4, { companyName: "Academia Forte Goiânia", title: "Landing page", stageKey: "novo", valueCents: null, score: 58, source: "radar" }),
  deal(5, { companyName: "Restaurante Sabor do Cerrado", title: "Cardápio digital", stageKey: "perdido", stageKind: "lost", lostReason: "Sem orçamento", source: "instagram" }),
  deal(6, { companyName: "Moraes Advocacia", title: "Site institucional", stageKey: "ganho", stageKind: "won", valueCents: 600_000, source: "indicacao" }),
];

async function Preview({ searchParams }: PageProps<"/dev-preview/os">) {
  await connection();
  if (process.env.NODE_ENV !== "development" || process.env.UI_PREVIEW !== "1") notFound();
  const sp = await searchParams;
  const tela = typeof sp.tela === "string" ? sp.tela : "dashboard";
  return (
    <>
      <p className="bg-warn/15 px-4 py-1 text-center text-xs text-warn">Pré-visualização com dados fictícios (apenas desenvolvimento)</p>
      {tela === "crm" ? (
        <CrmClient deals={DEALS} stages={STAGE_DEFS.map((s) => ({ key: s.key, label: s.label, kind: s.kind, probability: s.probability }))} companies={[]} services={["Landing page", "Site institucional"]} />
      ) : (
        <DashboardView data={tela === "vazio" ? EMPTY : DASH} days={30} basePath="/dev-preview/os" />
      )}
    </>
  );
}

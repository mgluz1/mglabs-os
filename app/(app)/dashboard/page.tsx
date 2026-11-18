import { ArrowRight, CalendarClock, CheckSquare, Kanban, Plus, Radar, Sparkles } from "lucide-react";
import Link from "next/link";

import { Gate } from "@/components/shell/gate";
import { Badge, EmptyState, Kpi, Page, PageHeader, SectionCard } from "@/components/ui/kit";
import { fmtDateTime, relativeDays } from "@/lib/dates";
import { brl } from "@/lib/money";
import { dashboardData } from "@/lib/services/dashboard";

export const metadata = { title: "Dashboard" };

const PERIODS = [7, 30, 90];
const KIND_LABEL: Record<string, string> = { nota: "Nota", etapa: "Etapa", mensagem_enviada: "Mensagem registrada", ligacao: "Ligação", resposta: "Resposta", reuniao: "Reunião", tarefa: "Tarefa", proposta: "Proposta", projeto: "Projeto", pagamento: "Financeiro", optout: "Não contatar", sistema: "Sistema" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const d = Number(typeof sp.dias === "string" ? sp.dias : 30);
        const days = PERIODS.includes(d) ? d : 30;
        const data = await dashboardData(ctx, days);
        const empty = data.companies === 0 && data.openDeals === 0 && data.wonTotal === 0;
        const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));
        return (
          <>
            <PageHeader
              title="Visão geral"
              description="Números calculados direto do banco. Previsões nunca são somadas como receita recebida."
              actions={
                <>
                  <nav aria-label="Período" className="flex rounded-lg border border-line p-0.5 text-xs">
                    {PERIODS.map((p) => (
                      <Link key={p} href={`/dashboard?dias=${p}`} aria-current={p === days ? "true" : undefined} className={`rounded-md px-2.5 py-1 ${p === days ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>
                        {p} dias
                      </Link>
                    ))}
                  </nav>
                  <Link href="/radar" className="btn btn-ghost btn-sm"><Radar className="h-4 w-4" /> Radar</Link>
                  <Link href="/crm?novo=1" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Nova oportunidade</Link>
                </>
              }
            />
            <Page>
              {empty ? (
                <EmptyState
                  icon={Sparkles}
                  title="Seu MGLABS OS está pronto para começar"
                  description="Ainda não há empresas nem oportunidades. Descubra negócios no Radar ou cadastre uma empresa manualmente — o dashboard passa a mostrar números reais assim que houver dados."
                  action={
                    <>
                      <Link href="/radar" className="btn btn-primary"><Radar className="h-4 w-4" /> Buscar no Radar</Link>
                      <Link href="/empresas?novo=1" className="btn btn-ghost">Cadastrar empresa</Link>
                    </>
                  }
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <Kpi label="Leads" value={data.leads} hint={`${data.newLeads} novos em ${days} dias`} href="/empresas?status=lead" />
                    <Kpi label="Oportunidades ativas" value={data.openDeals} hint={`Funil previsto ${brl(data.pipelineCents, { compact: true })}`} href="/crm" />
                    <Kpi label="Tarefas pendentes" value={data.openTasks} tone={data.overdueTasks ? "danger" : undefined} hint={data.overdueTasks ? `${data.overdueTasks} atrasada(s) · ${data.todayTasks} hoje` : `${data.todayTasks} para hoje`} href="/tarefas" />
                    <Kpi label="Negócios fechados" value={data.wonTotal} hint={`${data.wonPeriod} em ${days} dias${data.wonPeriod ? ` · ${brl(data.wonValuePeriodCents, { compact: true })}` : ""}`} href="/crm" />
                    {data.finance ? (
                      <Kpi label={`Recebido (${days} dias)`} value={brl(data.finance.receivedPeriodCents, { compact: true })} hint={data.finance.receivedCents === 0 ? "Nenhum pagamento registrado ainda" : `Neste mês ${brl(data.finance.receivedThisMonthCents, { compact: true })}`} href="/financeiro" tone={data.finance.receivedPeriodCents ? "ok" : undefined} />
                    ) : (
                      <Kpi label="Projetos ativos" value={data.projectsActive} href="/projetos" />
                    )}
                  </div>

                  {data.finance && (
                    <SectionCard title="Dinheiro — quatro números que não se misturam" action={<Link href="/financeiro" className="text-xs text-brand hover:underline">Abrir financeiro</Link>}>
                      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Pipeline (previsto)", data.finance.pipelineCents, `Ponderado ${brl(data.finance.pipelineWeightedCents, { compact: true })} · negociações abertas`],
                          ["Contratado", data.finance.contractedCents, `${data.finance.wonCount} negócio(s) ganho(s)`],
                          ["A receber", data.finance.toReceiveCents, data.finance.overdueCents ? `${brl(data.finance.overdueCents, { compact: true })} vencido` : "Cobranças em aberto"],
                          ["Recebido", data.finance.receivedCents, "Pagamentos registrados"],
                        ].map(([l, v, h]) => (
                          <div key={l as string}>
                            <dt className="text-xs text-muted">{l}</dt>
                            <dd className="font-heading text-xl font-semibold tabular-nums">{brl(v as number, { compact: true })}</dd>
                            <dd className="text-xs text-muted">{h}</dd>
                          </div>
                        ))}
                      </dl>
                    </SectionCard>
                  )}

                  <div className="grid gap-4 lg:grid-cols-5">
                    <SectionCard title="Funil por etapa" className="lg:col-span-3" action={<Link href="/crm" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">Abrir CRM <ArrowRight className="h-3 w-3" /></Link>}>
                      <ul className="space-y-2.5">
                        {data.funnel.map((f) => (
                          <li key={f.key} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm">
                            <span className="truncate text-fg/85">{f.label}</span>
                            <span className="h-2 overflow-hidden rounded-full bg-fg/8" aria-hidden>
                              <span className={`block h-full rounded-full ${f.kind === "won" ? "bg-ok" : f.kind === "lost" ? "bg-muted" : "bg-brand"}`} style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                            </span>
                            <span className="w-28 text-right text-xs tabular-nums text-muted">{f.count} · {brl(f.valueCents, { compact: true })}</span>
                          </li>
                        ))}
                      </ul>
                    </SectionCard>

                    <SectionCard title="Próximos follow-ups" className="lg:col-span-2" action={<Link href="/tarefas" className="text-xs text-brand hover:underline">Ver tarefas</Link>}>
                      {data.followups.length === 0 ? (
                        <p className="text-sm text-muted">Nada agendado para os próximos 7 dias.</p>
                      ) : (
                        <ul className="space-y-2">
                          {data.followups.map((f) => {
                            const late = f.dueAt.getTime() < Date.now();
                            return (
                              <li key={`${f.kind}${f.id}`}>
                                <Link href={f.kind === "negocio" ? `/crm?deal=${f.id}` : f.dealId ? `/crm?deal=${f.dealId}` : "/tarefas"} className="flex items-start gap-2.5 rounded-lg p-1.5 hover:bg-fg/6">
                                  {f.kind === "tarefa" ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> : <Kanban className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm">{f.title}</span>
                                    <span className="block truncate text-xs text-muted">{f.companyName ?? "—"}</span>
                                  </span>
                                  <span className={`shrink-0 text-xs ${late ? "text-danger" : "text-muted"}`}>{late ? "Atrasado · " : ""}{relativeDays(f.dueAt)}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </SectionCard>
                  </div>

                  <SectionCard title="Atividades recentes">
                    {data.recent.length === 0 ? (
                      <p className="text-sm text-muted">O histórico aparece aqui conforme você usa o CRM.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {data.recent.map((a) => (
                          <li key={a.id} className="flex items-start gap-3 py-2 text-sm first:pt-0 last:pb-0">
                            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{a.content ?? KIND_LABEL[a.kind] ?? a.kind}</span>
                              <span className="block truncate text-xs text-muted">
                                {a.companyId ? <Link href={`/empresas/${a.companyId}`} className="hover:text-fg hover:underline">{a.companyName}</Link> : "—"} · {fmtDateTime(a.occurredAt)}
                              </span>
                            </span>
                            <Badge>{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionCard>
                </div>
              )}
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

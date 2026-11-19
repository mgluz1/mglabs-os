import { ArrowRight, CalendarClock, CheckSquare, Download, Kanban, Plus, Radar, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge, EmptyState, Kpi, Page, PageHeader, SectionCard } from "@/components/ui/kit";
import { sourceLabel } from "@/lib/config/crm";
import { fmtDateTime, relativeDays } from "@/lib/dates";
import { brl } from "@/lib/money";
import type { DashboardData } from "@/lib/services/dashboard";
import type { reportsData } from "@/lib/services/reports";

type ReportsData = Awaited<ReturnType<typeof reportsData>>;

const GENERAL_PERIODS = [7, 30, 90];
const REPORT_PERIODS = [30, 90, 180, 365];
const KIND_LABEL: Record<string, string> = { nota: "Nota", etapa: "Etapa", mensagem_enviada: "Mensagem registrada", ligacao: "Ligação", resposta: "Resposta", reuniao: "Reunião", tarefa: "Tarefa", proposta: "Proposta", projeto: "Projeto", pagamento: "Financeiro", optout: "Não contatar", sistema: "Sistema" };
const ATTENTION_LABEL: Record<string, string> = {
  proposta_sem_retorno: "Proposta sem retorno",
  aguardando_resposta: "Aguardando resposta",
  interesse_sem_passo: "Respondeu sem próximo passo",
  parada: "Oportunidade parada",
};

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-fg/8" aria-hidden>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${(value / Math.max(1, max)) * 100}%` }} />
    </span>
  );
}

export function DashboardView({
  data,
  days,
  basePath = "/dashboard",
  visao = "geral",
  reports = null,
  canReports = false,
}: {
  data: DashboardData;
  days: number;
  basePath?: string;
  visao?: "geral" | "relatorios";
  reports?: ReportsData | null;
  canReports?: boolean;
}) {
  const empty = data.companies === 0 && data.openDeals === 0 && data.wonTotal === 0;
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));
  const periods = visao === "relatorios" ? REPORT_PERIODS : GENERAL_PERIODS;

  return (
    <>
      <PageHeader
        title="Início"
        description={
          visao === "relatorios"
            ? "Métricas comerciais por SQL no período escolhido. Nenhum valor é estimado por IA."
            : "Números calculados direto do banco. Previsões nunca são somadas como receita recebida."
        }
        actions={
          <>
            <nav aria-label="Período" className="flex rounded-lg border border-line p-0.5 text-xs">
              {periods.map((p) => (
                <Link
                  key={p}
                  href={`${basePath}?${visao === "relatorios" ? `visao=relatorios&dias=${p}` : `dias=${p}`}`}
                  aria-current={p === days ? "true" : undefined}
                  className={`rounded-md px-2.5 py-1 ${p === days ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}
                >
                  {p} dias
                </Link>
              ))}
            </nav>
            {visao === "relatorios" ? (
              <a href="/api/crm/export" className="btn btn-ghost btn-sm"><Download className="h-4 w-4" /> Exportar CSV</a>
            ) : (
              <>
                <Link href="/radar" className="btn btn-ghost btn-sm"><Radar className="h-4 w-4" /> Radar</Link>
                <Link href="/crm?novo=1" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Nova oportunidade</Link>
              </>
            )}
          </>
        }
      />

      {canReports && (
        <nav aria-label="Visões do Início" className="flex gap-1 border-b border-line bg-background px-4 sm:px-8">
          <Link href={`${basePath}?dias=${GENERAL_PERIODS.includes(days) ? days : 30}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${visao === "geral" ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>
            Visão geral
          </Link>
          <Link href={`${basePath}?visao=relatorios&dias=${REPORT_PERIODS.includes(days) ? days : 90}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${visao === "relatorios" ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>
            Relatórios
          </Link>
        </nav>
      )}

      <Page>
        {visao === "relatorios" && reports ? (
          reports.bySource.length === 0 && reports.byStage.every((s) => s.count === 0) ? (
            <EmptyState title="Ainda não há dados no período" description="Os relatórios aparecem quando houver oportunidades criadas nos últimos dias." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Taxa de ganho" value={reports.winRate == null ? "—" : `${Math.round(reports.winRate * 100)}%`} hint="Ganhos ÷ (ganhos + perdidos) entre as oportunidades criadas no período" />
                <Kpi label="Negócios ganhos" value={reports.wonCount} hint={`no período de ${days} dias`} />
                <Kpi label="Ticket médio (ganhos)" value={reports.avgTicketCents == null ? "—" : brl(reports.avgTicketCents, { compact: true })} hint="Média do valor previsto dos ganhos" />
                <Kpi label="Tempo até fechar" value={reports.avgDaysToClose == null ? "—" : `${reports.avgDaysToClose} dias`} hint="Da criação ao fechamento (ganhos)" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Cobertura de contatos" value={reports.contactCoverage.rate == null ? "—" : `${Math.round(reports.contactCoverage.rate * 100)}%`} hint={`${reports.contactCoverage.withContact} de ${reports.contactCoverage.total} empresas com canal utilizável`} />
                <Kpi label="Mensagens enviadas" value={reports.outreach.sentMessages} hint={`${reports.outreach.contactedDeals} oportunidade(s) abordada(s) no período`} />
                <Kpi label="Taxa de resposta" value={reports.outreach.replyRate == null ? "—" : `${Math.round(reports.outreach.replyRate * 100)}%`} hint={`${reports.outreach.repliedDeals} oportunidade(s) com resposta registrada`} />
                <Kpi label="Propostas aprovadas" value={reports.outreach.proposalApprovalRate == null ? "—" : `${Math.round(reports.outreach.proposalApprovalRate * 100)}%`} hint={`${reports.outreach.proposalsApproved} aprovada(s) de ${reports.outreach.proposalsSent} enviada(s)`} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Oportunidades por origem">
                  {reports.bySource.length === 0 ? (
                    <p className="text-sm text-muted">Sem dados.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {reports.bySource.map((s) => (
                        <li key={s.source} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-sm">
                          <span className="truncate">{sourceLabel(s.source)}</span>
                          <Bar value={s.count} max={reports.bySource[0].count} />
                          <span className="text-xs tabular-nums text-muted">{s.count} · {s.won} ganho(s) · {brl(s.valueCents, { compact: true })}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
                <SectionCard title="Funil: onde estão as oportunidades criadas no período">
                  <ul className="space-y-2.5">
                    {reports.byStage.map((s) => (
                      <li key={s.label} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm">
                        <span className="truncate">{s.label}</span>
                        <Bar value={s.count} max={Math.max(...reports.byStage.map((x) => x.count))} />
                        <span className="text-xs tabular-nums text-muted">{s.count} · {brl(s.valueCents, { compact: true })}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted">Distribuição atual por etapa — não é conversão histórica entre etapas.</p>
                </SectionCard>
                <SectionCard title="Motivos de perda">
                  {reports.lost.length === 0 ? (
                    <p className="text-sm text-muted">Nenhuma perda no período.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {reports.lost.map((l) => (
                        <li key={l.reason} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                          <span className="truncate">{l.reason}</span>
                          <span className="text-xs tabular-nums text-muted">{l.count} · {brl(l.valueCents, { compact: true })}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
                {reports.receivedByMonth.length > 0 && (
                  <SectionCard title="Recebido por mês">
                    <ul className="space-y-1.5 text-sm">
                      {reports.receivedByMonth.map((m) => (
                        <li key={m.ym} className="flex justify-between">
                          <span>{m.ym.split("-").reverse().join("/")}</span>
                          <span className="tabular-nums">{brl(m.totalCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                )}
              </div>
            </div>
          )
        ) : empty ? (
          <EmptyState
            icon={Sparkles}
            title="Seu MGLABS OS está pronto para começar"
            description="Ainda não há empresas nem oportunidades. Descubra negócios no Radar ou cadastre uma empresa manualmente — o painel passa a mostrar números reais assim que houver dados."
            action={
              <>
                <Link href="/radar" className="btn btn-primary"><Radar className="h-4 w-4" /> Buscar no Radar</Link>
                <Link href="/crm?aba=empresas&novo=1" className="btn btn-ghost">Cadastrar empresa</Link>
              </>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Kpi label="Leads" value={data.leads} hint={`${data.newLeads} novos em ${days} dias`} href="/crm?aba=empresas&status=lead" />
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
                      <dd className="font-heading text-[22px] tabular-nums">{brl(v as number, { compact: true })}</dd>
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

              <SectionCard title="Próximos follow-ups" className="lg:col-span-2" action={<Link href="/tarefas" className="text-xs text-brand hover:underline">Ver agenda</Link>}>
                {data.followups.length === 0 ? (
                  <p className="text-sm text-muted">Nada agendado para os próximos 7 dias.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.followups.map((f) => {
                      const late = f.overdue;
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

            {data.attentionQueue.length > 0 && (
              <SectionCard title="Follow-ups orientados pelo histórico" action={<Link href="/crm" className="text-xs text-brand hover:underline">Ver funil</Link>}>
                <ul className="divide-y divide-line">
                  {data.attentionQueue.map((item) => {
                    const href = item.proposalId
                      ? `/propostas/${item.proposalId}`
                      : item.reason === "aguardando_resposta" && item.dealId
                        ? `/mensagens?oportunidade=${item.dealId}`
                        : item.dealId
                          ? `/crm?deal=${item.dealId}`
                          : "/crm";
                    return (
                      <li key={`${item.reason}:${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <Link href={href} className="block truncate font-medium hover:text-brand hover:underline">
                            {item.title}
                          </Link>
                          <p className="truncate text-xs text-muted">
                            {item.companyName ?? "—"} · há {item.days} dia(s)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={item.reason === "proposta_sem_retorno" || item.reason === "interesse_sem_passo" ? "warn" : "neutral"}>
                            {ATTENTION_LABEL[item.reason] ?? item.reason}
                          </Badge>
                          <Link href={href} className="btn btn-ghost btn-sm">
                            {item.reason === "aguardando_resposta" ? "Preparar follow-up" : "Revisar"}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            )}

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
}

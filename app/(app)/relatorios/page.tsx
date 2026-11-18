import Link from "next/link";

import { Gate } from "@/components/shell/gate";
import { EmptyState, Kpi, Page, PageHeader, PendingNote, SectionCard } from "@/components/ui/kit";
import { sourceLabel } from "@/lib/config/crm";
import { brl } from "@/lib/money";
import { reportsData } from "@/lib/services/reports";

export const metadata = { title: "Relatórios" };
const PERIODS = [30, 90, 180, 365];

function Bar({ value, max }: { value: number; max: number }) {
  return <span className="block h-2 overflow-hidden rounded-full bg-fg/8" aria-hidden><span className="block h-full rounded-full bg-brand" style={{ width: `${(value / Math.max(1, max)) * 100}%` }} /></span>;
}

export default function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const d = Number(typeof sp.dias === "string" ? sp.dias : 90);
        const days = PERIODS.includes(d) ? d : 90;
        const r = await reportsData(ctx, days);
        const empty = r.bySource.length === 0 && r.byStage.every((s) => s.count === 0);
        return (
          <>
            <PageHeader title="Relatórios" description="Cada número vem de consulta SQL no banco, no período escolhido. Nenhum valor é estimado por IA." actions={<><nav aria-label="Período" className="flex rounded-lg border border-line p-0.5 text-xs">{PERIODS.map((p) => <Link key={p} href={`/relatorios?dias=${p}`} className={`rounded-md px-2.5 py-1 ${p === days ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>{p} dias</Link>)}</nav><a href="/api/crm/export" className="btn btn-ghost btn-sm">Exportar oportunidades (CSV)</a></>} />
            <Page>
              {empty ? <EmptyState title="Ainda não há dados no período" description="Os relatórios aparecem quando houver oportunidades criadas nos últimos dias." /> : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Kpi label="Taxa de ganho" value={r.winRate == null ? "—" : `${Math.round(r.winRate * 100)}%`} hint="Ganhos ÷ (ganhos + perdidos) entre as oportunidades criadas no período" />
                    <Kpi label="Negócios ganhos" value={r.wonCount} hint={`no período de ${days} dias`} />
                    <Kpi label="Ticket médio (ganhos)" value={r.avgTicketCents == null ? "—" : brl(r.avgTicketCents, { compact: true })} hint="Média do valor previsto dos ganhos" />
                    <Kpi label="Tempo até fechar" value={r.avgDaysToClose == null ? "—" : `${r.avgDaysToClose} dias`} hint="Da criação ao fechamento (ganhos)" />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <SectionCard title="Oportunidades por origem">
                      {r.bySource.length === 0 ? <p className="text-sm text-muted">Sem dados.</p> : <ul className="space-y-2.5">{r.bySource.map((s) => <li key={s.source} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-sm"><span className="truncate">{sourceLabel(s.source)}</span><Bar value={s.count} max={r.bySource[0].count} /><span className="text-xs tabular-nums text-muted">{s.count} · {s.won} ganho(s) · {brl(s.valueCents, { compact: true })}</span></li>)}</ul>}
                    </SectionCard>
                    <SectionCard title="Funil: onde estão as oportunidades criadas no período">
                      <ul className="space-y-2.5">{r.byStage.map((s) => <li key={s.label} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm"><span className="truncate">{s.label}</span><Bar value={s.count} max={Math.max(...r.byStage.map((x) => x.count))} /><span className="text-xs tabular-nums text-muted">{s.count} · {brl(s.valueCents, { compact: true })}</span></li>)}</ul>
                      <p className="mt-3 text-xs text-muted">Distribuição atual por etapa — não é conversão histórica entre etapas.</p>
                    </SectionCard>
                    <SectionCard title="Motivos de perda">
                      {r.lost.length === 0 ? <p className="text-sm text-muted">Nenhuma perda no período.</p> : <ul className="space-y-2.5">{r.lost.map((l) => <li key={l.reason} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm"><span className="truncate">{l.reason}</span><span className="text-xs tabular-nums text-muted">{l.count} · {brl(l.valueCents, { compact: true })}</span></li>)}</ul>}
                    </SectionCard>
                    <SectionCard title="Recebido por mês">
                      {r.receivedByMonth.length === 0 ? <p className="text-sm text-muted">Nenhum pagamento registrado no período.</p> : <ul className="space-y-1.5 text-sm">{r.receivedByMonth.map((m) => <li key={m.ym} className="flex justify-between"><span>{m.ym.split("-").reverse().join("/")}</span><span className="tabular-nums">{brl(m.totalCents)}</span></li>)}</ul>}
                    </SectionCard>
                  </div>
                </div>
              )}
              <PendingNote items={["Cobertura de contatos, taxa de resposta e conversão histórica entre etapas exigem registrar as transições com datas — o histórico já guarda as mudanças de etapa; os relatórios sobre elas entram na próxima lapidação.", "Exportação em CSV existe só para oportunidades."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

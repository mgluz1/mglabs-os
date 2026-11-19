import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Gate } from "@/components/shell/gate";
import { canModule } from "@/lib/services/ctx";
import { dashboardData } from "@/lib/services/dashboard";
import { reportsData } from "@/lib/services/reports";

export const metadata = { title: "Início" };

const PERIODS = [7, 30, 90, 180, 365];

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const visao = sp.visao === "relatorios" ? "relatorios" : "geral";
        const rawDays = Number(typeof sp.dias === "string" ? sp.dias : visao === "relatorios" ? 90 : 30);
        const days = PERIODS.includes(rawDays) ? rawDays : visao === "relatorios" ? 90 : 30;
        const canReports = canModule(ctx, "comercial");
        const [data, reports] = await Promise.all([
          dashboardData(ctx, days),
          visao === "relatorios" && canReports ? reportsData(ctx, days) : Promise.resolve(null),
        ]);
        return <DashboardView data={data} reports={reports} visao={visao} canReports={canReports} days={days} />;
      }}
    </Gate>
  );
}

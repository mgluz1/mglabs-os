import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Gate } from "@/components/shell/gate";
import { dashboardData } from "@/lib/services/dashboard";

export const metadata = { title: "Dashboard" };

const PERIODS = [7, 30, 90];

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const d = Number(typeof sp.dias === "string" ? sp.dias : 30);
        const days = PERIODS.includes(d) ? d : 30;
        return <DashboardView data={await dashboardData(ctx, days)} days={days} />;
      }}
    </Gate>
  );
}

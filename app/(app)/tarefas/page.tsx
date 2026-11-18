import { Gate } from "@/components/shell/gate";
import { TasksClient } from "@/components/tasks/tasks-client";
import { Page, PageHeader, PendingNote } from "@/components/ui/kit";
import { listCompanies } from "@/lib/services/companies";
import { listDeals } from "@/lib/services/deals";
import { listTasks, taskCounts, type TaskView } from "@/lib/services/tasks";

export const metadata = { title: "Tarefas e agenda" };
const VIEWS: TaskView[] = ["hoje", "atrasadas", "semana", "abertas", "sem_data", "concluidas"];

export default function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const requested = typeof sp.v === "string" ? sp.v : "";
        const view = (VIEWS as string[]).includes(requested) ? (requested as TaskView) : "abertas";
        const [tasks, counts, deals, companies] = await Promise.all([listTasks(ctx, { view, limit: 200 }), taskCounts(ctx), listDeals(ctx, { open: true, limit: 300 }), listCompanies(ctx, { limit: 200 })]);
        return (
          <>
            <PageHeader title="Tarefas e agenda" description="Lembretes ligados a oportunidades, clientes e projetos. Concluir mantém o histórico." />
            <Page>
              <TasksClient view={view} tasks={tasks} counts={counts} deals={deals.map((d) => ({ id: d.id, label: `${d.companyName} — ${d.title}` }))} companies={companies.map((c) => ({ id: c.id, label: c.name }))} />
              <PendingNote items={["Cadências automáticas (ex.: follow-up após proposta) e notificações fora do app ainda não existem — hoje só o follow-up de 3 dias ao registrar uma mensagem enviada é criado automaticamente.", "Visão de calendário mensal e recorrência de tarefas."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

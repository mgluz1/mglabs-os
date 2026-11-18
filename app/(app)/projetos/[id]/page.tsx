import { ProjectDetail } from "@/components/projects/project-detail";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader } from "@/components/ui/kit";
import { canModule, NotFoundError } from "@/lib/services/ctx";
import { listReceivables } from "@/lib/services/finance";
import { getProject } from "@/lib/services/projects";
import { listTasks } from "@/lib/services/tasks";

export default function ProjectPage({ params }: PageProps<"/projetos/[id]">) {
  return (
    <Gate>
      {async (ctx) => {
        const { id } = await params;
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError("Projeto");
        const [data, tasks, open, done, receivables] = await Promise.all([getProject(ctx, id), listTasks(ctx, { projectId: id, view: "abertas" }), Promise.resolve(null), listTasks(ctx, { projectId: id, view: "concluidas" }), canModule(ctx, "financeiro") ? listReceivables(ctx, { projectId: id }) : Promise.resolve(null)]);
        void open;
        return (
          <>
            <PageHeader back={{ href: "/projetos", label: "Projetos" }} title={data.project.name} />
            <Page wide><ProjectDetail data={data} tasks={[...tasks, ...done]} receivables={receivables} /></Page>
          </>
        );
      }}
    </Gate>
  );
}

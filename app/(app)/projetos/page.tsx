import { ProjectsClient } from "@/components/projects/projects-client";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader } from "@/components/ui/kit";
import { listCompanies } from "@/lib/services/companies";
import { listProjects } from "@/lib/services/projects";

export const metadata = { title: "Projetos" };

export default function ProjetosPage() {
  return (
    <Gate>
      {async (ctx) => {
        const [projects, companies] = await Promise.all([listProjects(ctx), listCompanies(ctx, { limit: 300 })]);
        return (
          <>
            <PageHeader title="Projetos" description="Do negócio fechado à entrega: briefing, materiais, direção criativa, desenvolvimento e entrega, com tarefas, links e documentos." />
            <Page><ProjectsClient projects={projects} companies={companies.map((c) => ({ id: c.id, name: c.name }))} /></Page>
          </>
        );
      }}
    </Gate>
  );
}

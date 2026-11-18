import { KnowledgeClient } from "@/components/knowledge/knowledge-client";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader, PendingNote } from "@/components/ui/kit";
import { KNOWLEDGE_KINDS } from "@/lib/config/crm";
import { listCompanies } from "@/lib/services/companies";
import { listKnowledge } from "@/lib/services/knowledge";

export const metadata = { title: "Conhecimento" };

export default function ConhecimentoPage({ searchParams }: PageProps<"/conhecimento">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const kind = typeof sp.tipo === "string" && KNOWLEDGE_KINDS.some((k) => k.id === sp.tipo) ? sp.tipo : "";
        const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
        const [items, companies] = await Promise.all([listKnowledge(ctx, { kind: kind || undefined, q }), listCompanies(ctx, { limit: 300 })]);
        const names = new Map(companies.map((c) => [c.id, c.name]));
        return (
          <>
            <PageHeader title="Conhecimento" description="Processos internos, templates, referências de design e documentação de projetos — a base que o Second Brain vai alimentar." />
            <Page>
              <KnowledgeClient items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, body: i.body, url: i.url, tags: i.tags, companyId: i.companyId, companyName: i.companyId ? names.get(i.companyId) ?? null : null, source: i.source, updatedAt: i.updatedAt }))} kind={kind} q={q} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
              <PendingNote title="Preparado para o Second Brain (Obsidian)" items={["Hoje o conteúdo é manual: cada item aceita texto, link (inclusive obsidian://), tags e relação com um cliente.", "A sincronização com o vault do Obsidian ainda não existe. O modelo de dados já guarda origem (manual/obsidian) e caminho externo; o MCP do Claude Code poderá ler e gravar estes itens numa etapa futura."]} />
            </Page>
          </>
        );
      }}
    </Gate>
  );
}

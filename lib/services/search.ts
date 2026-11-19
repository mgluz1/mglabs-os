import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { canModule, type Ctx } from "@/lib/services/ctx";

export type SearchHit = { kind: "empresa" | "contato" | "oportunidade" | "projeto" | "proposta" | "tarefa"; id: string; title: string; subtitle: string | null; href: string };

/** Busca global (Ctrl/Cmd+K): empresas, contatos, oportunidades, projetos, propostas e tarefas. (Conhecimento oculto até integração Second Brain.) */
export async function globalSearch(ctx: Ctx, query: string, perKind = 5): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = "%" + q.replace(/[%_\\]/g, (m) => "\\" + m) + "%";
  const ws = ctx.workspaceId;
  const allowComercial = canModule(ctx, "comercial");
  const allowOperacao = canModule(ctx, "operacao");
  const { rows } = await db.execute<{ kind: SearchHit["kind"]; id: string; title: string; subtitle: string | null }>(sql`
    (select 'empresa' as kind, id::text, name as title, coalesce(city, category) as subtitle from crm_companies where workspace_id = ${ws} and archived_at is null and name ilike ${like} order by name limit ${perKind})
    union all
    (select 'contato', k.id::text, k.name, c.name from crm_contacts k left join crm_companies c on c.id = k.company_id where ${allowComercial} and k.workspace_id = ${ws} and (k.name ilike ${like} or k.email ilike ${like} or k.phone ilike ${like}) order by k.name limit ${perKind})
    union all
    (select 'oportunidade', d.id::text, d.title, s.label from crm_deals d join crm_stages s on s.id = d.stage_id where ${allowComercial} and d.workspace_id = ${ws} and d.title ilike ${like} order by d.updated_at desc limit ${perKind})
    union all
    (select 'projeto', id::text, name, status from crm_projects where ${allowOperacao} and workspace_id = ${ws} and name ilike ${like} order by updated_at desc limit ${perKind})
    union all
    (select 'proposta', id::text, title, status from crm_proposals where ${allowComercial} and workspace_id = ${ws} and title ilike ${like} order by updated_at desc limit ${perKind})
    union all
    (select 'tarefa', id::text, title, status from crm_tasks where ${allowComercial || allowOperacao} and workspace_id = ${ws} and title ilike ${like} order by updated_at desc limit ${perKind})`);
  return rows.map((r) => ({
    ...r,
    href:
      r.kind === "empresa" ? `/empresas/${r.id}`
      : r.kind === "contato" ? `/crm?aba=empresas&sub=contatos&q=${encodeURIComponent(r.title)}`
      : r.kind === "oportunidade" ? `/crm?deal=${r.id}`
      : r.kind === "projeto" ? `/projetos/${r.id}`
      : r.kind === "proposta" ? `/propostas/${r.id}`
      : `/tarefas`,
  }));
}

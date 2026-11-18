import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { assertWrite, audit, ForbiddenError, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";
import { getCompany360, listCompanies } from "@/lib/services/companies";
import { addNote, getDeal, listDeals, listStages, moveDeal } from "@/lib/services/deals";
import { saveDraft } from "@/lib/services/messages";
import { projectBriefing, listProjects } from "@/lib/services/projects";
import { globalSearch } from "@/lib/services/search";
import { createTask, listTasks } from "@/lib/services/tasks";
import { contactBlock } from "@/lib/services/optout";
import { MESSAGE_OBJECTIVES } from "@/lib/config/crm";

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string) => ({ isError: true, content: [{ type: "text" as const, text: msg }] });

/** Erros de negócio viram mensagem legível; o resto vira erro genérico (sem vazar SQL). */
async function safe(ctx: Ctx, tool: string, fn: () => Promise<unknown>) {
  try {
    await audit(ctx, "mcp_call", "tool", tool);
    return text(await fn());
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError) return fail(e.message);
    console.error("mcp", tool, e instanceof Error ? e.message.slice(0, 200) : "erro");
    return fail("Erro interno ao executar a ferramenta.");
  }
}

const limit = z.number().int().min(1).max(50).default(20).describe("Máximo de itens (até 50)");
const uuid = z.string().uuid();
const objectiveIds = MESSAGE_OBJECTIVES.map((o) => o.id) as [string, ...string[]];

/**
 * Servidor MCP do MGLABS OS: adaptador fino sobre os MESMOS serviços usados pela interface
 * (autorização por workspace, validação, auditoria e opt-out). Sem SQL livre e sem dados financeiros.
 */
export function buildMcpServer(ctx: Ctx) {
  const server = new McpServer({ name: "mglabs-os", version: "0.1.0" });
  const ro = { readOnlyHint: true, openWorldHint: false };

  // ---------- leitura ----------
  server.registerTool("search", { title: "Busca global", description: "Busca empresas, contatos, oportunidades, projetos, propostas e tarefas pelo nome.", inputSchema: { query: z.string().min(2).max(80) }, annotations: ro }, ({ query }) => safe(ctx, "search", () => globalSearch(ctx, query, 5)));

  server.registerTool("list_leads", { title: "Listar oportunidades", description: "Lista oportunidades do CRM (etapa, valor previsto, próximo passo, prazo). Filtros opcionais.", inputSchema: { query: z.string().max(80).optional(), stage: z.string().max(40).optional().describe("Chave da etapa: novo, qualificado, primeiro_contato, conversa, reuniao, proposta, negociacao, ganho, perdido"), only_open: z.boolean().optional(), overdue: z.boolean().optional().describe("Só as com próximo passo atrasado"), limit }, annotations: ro },
    ({ query, stage, only_open, overdue, limit }) => safe(ctx, "list_leads", async () => (await listDeals(ctx, { q: query, stage, open: only_open, overdue, limit })).map((d) => ({ id: d.id, titulo: d.title, empresa: d.companyName, empresaId: d.companyId, etapa: d.stageKey, valorPrevistoReais: d.valueCents == null ? null : d.valueCents / 100, probabilidade: d.probability, origem: d.source, proximoPasso: d.nextStep, prazo: d.nextStepAt, leadScore: d.score, tarefasAbertas: d.openTasks, motivoPerda: d.lostReason }))));

  server.registerTool("get_lead", { title: "Detalhar oportunidade", description: "Ficha de uma oportunidade: dados, empresa, tarefas, propostas e as últimas atividades do histórico.", inputSchema: { id: uuid }, annotations: ro },
    ({ id }) => safe(ctx, "get_lead", async () => {
      const d = await getDeal(ctx, id);
      return { id: d.card.id, titulo: d.card.title, etapa: d.card.stageKey, empresa: { id: d.company.id, nome: d.company.name, cidade: d.company.city, categoria: d.company.category }, valorPrevistoReais: d.card.valueCents == null ? null : d.card.valueCents / 100, proximoPasso: d.card.nextStep, prazo: d.card.nextStepAt, notas: d.deal.notes, tarefas: d.tasks, propostas: d.proposals.map((p) => ({ id: p.id, titulo: p.title, versao: p.version, status: p.status, totalReais: p.totalCents / 100 })), projeto: d.project, historico: d.timeline.slice(0, 15).map((t) => ({ tipo: t.kind, canal: t.channel, texto: t.content, quando: t.occurredAt })) };
    }));

  server.registerTool("list_companies", { title: "Listar empresas", description: "Lista empresas do CRM (leads e clientes).", inputSchema: { query: z.string().max(80).optional(), status: z.enum(["lead", "cliente", "inativo"]).optional(), limit }, annotations: ro },
    ({ query, status, limit }) => safe(ctx, "list_companies", async () => (await listCompanies(ctx, { q: query, status, limit })).map((c) => ({ id: c.id, nome: c.name, situacao: c.status, categoria: c.category, cidade: c.city, origem: c.source, oportunidadesAbertas: c.openDeals, contatos: c.contacts }))));

  server.registerTool("get_company", { title: "Ficha da empresa", description: "Ficha 360° (contatos, oportunidades, tarefas, propostas, projetos). Canais de contato de quem pediu para não ser contatado são omitidos.", inputSchema: { id: uuid }, annotations: ro },
    ({ id }) => safe(ctx, "get_company", async () => {
      const [d, block] = await Promise.all([getCompany360(ctx, id), contactBlock(ctx, { companyId: id })]);
      return { id: d.company.id, nome: d.company.name, situacao: d.company.status, categoria: d.company.category, cidade: d.company.city, origem: d.company.source, naoContatar: block.blocked, contatos: d.contacts.map((k) => ({ id: k.id, nome: k.name, cargo: k.role, naoContatar: k.optedOut, ...(k.optedOut || block.blocked ? {} : { whatsapp: k.whatsapp, telefone: k.phone, email: k.email }) })), oportunidades: d.deals, tarefas: d.tasks, propostas: d.proposals, projetos: d.projects, historico: d.timeline.slice(0, 15).map((t) => ({ tipo: t.kind, texto: t.content, quando: t.occurredAt })) };
    }));

  server.registerTool("get_pipeline", { title: "Funil", description: "Resumo do funil: etapas, quantidade e valor previsto por etapa. Útil para sugerir organização do funil.", inputSchema: {}, annotations: ro },
    () => safe(ctx, "get_pipeline", async () => {
      const [stages, deals] = await Promise.all([listStages(ctx), listDeals(ctx, { limit: 1000 })]);
      return stages.map((s) => { const ds = deals.filter((d) => d.stageKey === s.key); return { etapa: s.key, nome: s.label, tipo: s.kind, quantidade: ds.length, valorPrevistoReais: ds.reduce((a, d) => a + (d.valueCents ?? 0), 0) / 100, atrasadas: ds.filter((d) => d.nextStepAt && d.nextStepAt.getTime() < Date.now() && s.kind === "open").length, paradasHaMaisDe14Dias: ds.filter((d) => s.kind === "open" && d.updatedAt.getTime() < Date.now() - 14 * 86_400_000).map((d) => ({ id: d.id, titulo: d.title })).slice(0, 10) }; });
    }));

  server.registerTool("list_due_tasks", { title: "Tarefas pendentes", description: "Lista tarefas por visão: hoje, atrasadas, semana ou abertas.", inputSchema: { view: z.enum(["hoje", "atrasadas", "semana", "abertas"]).default("hoje"), limit }, annotations: ro },
    ({ view, limit }) => safe(ctx, "list_due_tasks", async () => (await listTasks(ctx, { view, limit })).map((t) => ({ id: t.id, titulo: t.title, prioridade: t.priority, vencimento: t.dueAt, empresa: t.companyName, oportunidadeId: t.dealId, projeto: t.projectName }))));

  server.registerTool("list_projects", { title: "Listar projetos", description: "Lista projetos (status, fase, prazo).", inputSchema: { status: z.string().max(30).optional() }, annotations: ro },
    ({ status }) => safe(ctx, "list_projects", () => listProjects(ctx, { status })));

  server.registerTool("get_project_briefing", { title: "Briefing do projeto", description: "Escopo, seções (briefing, materiais, direção criativa, desenvolvimento, entrega), links e documentos de um projeto.", inputSchema: { id: uuid }, annotations: ro },
    ({ id }) => safe(ctx, "get_project_briefing", () => projectBriefing(ctx, id)));

  // ---------- escrita controlada (exige token com escopo de escrita) ----------
  const rw = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

  server.registerTool("create_message_draft", { title: "Criar rascunho de mensagem", description: "Salva um RASCUNHO de mensagem para revisão no Estúdio de Mensagens. Nunca envia nada. Falha se o contato pediu para não ser contatado.", inputSchema: { company_id: uuid, deal_id: uuid.optional(), objective: z.enum(objectiveIds), body: z.string().min(5).max(3000), channel: z.enum(["whatsapp", "email", "instagram"]).default("whatsapp") }, annotations: rw },
    ({ company_id, deal_id, objective, body, channel }) => safe(ctx, "create_message_draft", async () => { assertWrite(ctx); const d = await saveDraft(ctx, { companyId: company_id, dealId: deal_id ?? null, objective: objective as "primeiro_contato", body, channel, origin: "mcp" }); return { id: d.id, status: "rascunho", aviso: "Rascunho criado. Revise e envie manualmente em /mensagens." }; }));

  server.registerTool("create_task", { title: "Criar tarefa", description: "Cria uma tarefa (opcionalmente ligada a uma oportunidade ou empresa).", inputSchema: { title: z.string().min(2).max(200), description: z.string().max(1000).optional(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD"), priority: z.enum(["baixa", "media", "alta"]).default("media"), deal_id: uuid.optional(), company_id: uuid.optional() }, annotations: rw },
    ({ title, description, due_date, priority, deal_id, company_id }) => safe(ctx, "create_task", async () => { const t = await createTask(ctx, { title, description: description ?? null, dueAt: due_date ? `${due_date}T09:00:00-03:00` : null, priority, dealId: deal_id ?? null, companyId: company_id ?? null, source: "mcp" }); return { id: t?.id }; }));

  server.registerTool("append_activity", { title: "Registrar nota", description: "Adiciona uma nota ao histórico de uma oportunidade.", inputSchema: { deal_id: uuid, content: z.string().min(2).max(2000) }, annotations: rw },
    ({ deal_id, content }) => safe(ctx, "append_activity", async () => { const a = await addNote(ctx, { dealId: deal_id, kind: "nota", content }); return { id: a.id }; }));

  server.registerTool("update_deal_stage", { title: "Mover oportunidade de etapa", description: "Move uma oportunidade entre etapas ABERTAS do funil. Fechar como ganho/perdido (que gera projeto, cobranças e motivos) só pode ser feito na interface.", inputSchema: { deal_id: uuid, stage: z.enum(["novo", "qualificado", "primeiro_contato", "conversa", "reuniao", "proposta", "negociacao"]) }, annotations: { ...rw, idempotentHint: true } },
    ({ deal_id, stage }) => safe(ctx, "update_deal_stage", async () => { assertWrite(ctx); const d = await moveDeal(ctx, deal_id, stage); return { id: d.id, etapa: d.stageKey }; }));

  return server;
}

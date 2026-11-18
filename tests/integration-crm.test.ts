// Teste de integração do CRM contra um Postgres real. Rode com:
//   TEST_DATABASE_URL=postgres://... npx vitest run tests/integration-crm.test.ts
// O banco precisa ter as migrations aplicadas (inclusive a 0005). Os dados são criados num workspace próprio.
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: () => {} }));

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

// opt-outs são globais (por telefone): cada execução usa números novos para ser repetível
const rnd = () => String(Math.floor(1000 + Math.random() * 8999));
const phone = () => `(62) 9${rnd()}-${rnd()}`;

run("CRM de ponta a ponta (Postgres real)", () => {
  afterAll(async () => {
    process.env.DATABASE_URL = url;
    const { pool } = await import("@/lib/db");
    await pool.end();
  });

  it("empresa → oportunidade → funil → tarefa → proposta → projeto → financeiro", async () => {
    process.env.DATABASE_URL = url;
    const { db } = await import("@/lib/db");
    const { workspaces, workspaceMembers } = await import("@/db/schema");
    const ctxm = await import("@/lib/services/ctx");
    const [ws] = await db.insert(workspaces).values({ name: "teste-" + randomUUID().slice(0, 6) }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: "u-test", email: "t@t.com", role: "owner" });
    await ctxm.seedWorkspaceDefaults(ws.id);
    const ctx: import("@/lib/services/ctx").Ctx = { workspaceId: ws.id, userId: "u-test", email: "t@t.com", role: "owner", actor: "user", scope: "write" };
    const ro: import("@/lib/services/ctx").Ctx = { ...ctx, scope: "read", actor: "mcp" };

    const companies = await import("@/lib/services/companies");
    const deals = await import("@/lib/services/deals");
    const tasks = await import("@/lib/services/tasks");
    const proposals = await import("@/lib/services/proposals");
    const projects = await import("@/lib/services/projects");
    const finance = await import("@/lib/services/finance");
    const dash = await import("@/lib/services/dashboard");
    const optout = await import("@/lib/services/optout");
    const messages = await import("@/lib/services/messages");

    // cadastro manual, sem Radar
    const deal = await deals.createDealWithCompany(ctx, { company: { name: "Studio Aurora", city: "Goiânia", phone: phone(), source: "indicacao" }, deal: { title: "Site institucional", estimatedValueCents: 450000, source: "indicacao", serviceType: "Site institucional" } });
    expect(deal.stageKey).toBe("novo");
    expect(deal.placeId).toBeNull();

    // somente leitura não grava
    await expect(deals.moveDeal(ro, deal.id, "qualificado")).rejects.toThrow(/somente leitura/);

    // funil: perdido exige motivo; avançar não volta
    await expect(deals.moveDeal(ctx, deal.id, "perdido")).rejects.toThrow(/motivo/i);
    await deals.moveDeal(ctx, deal.id, "reuniao");
    expect((await deals.advanceDeal(ctx, deal.id, "primeiro_contato")).stageKey).toBe("reuniao");
    const full = await deals.getDeal(ctx, deal.id);
    expect(full.timeline.some((t) => t.kind === "etapa")).toBe(true);

    // tarefa idempotente
    const t1 = await tasks.createTask(ctx, { title: "Ligar", dealId: deal.id, dueAt: new Date(Date.now() - 86_400_000), dedupeKey: "k1" });
    const t2 = await tasks.createTask(ctx, { title: "Ligar", dealId: deal.id, dedupeKey: "k1" });
    expect(t1).not.toBeNull();
    expect(t2).toBeNull();
    expect((await tasks.taskCounts(ctx)).atrasadas).toBe(1);
    await tasks.completeTask(ctx, t1!.id);
    expect((await tasks.listTasks(ctx, { view: "concluidas" })).length).toBe(1);

    // mensagem: contexto verificado, sem inventar origem
    const mc = await messages.messageContext(ctx, { dealId: deal.id });
    expect(mc.origin).toBeNull();
    expect(mc.recipients.some((r) => r.kind === "whatsapp")).toBe(true);

    // proposta: edita rascunho, envia, congela, nova versão, aprova
    const p = await proposals.createProposal(ctx, { companyId: deal.companyId, dealId: deal.id, title: "Proposta Aurora", installments: 3, items: [{ description: "Site", quantity: 1, unitPriceCents: 450000 }, { description: "Domínio", quantity: 2, unitPriceCents: 5000 }], discountCents: 10000 });
    expect(p.totalCents).toBe(450000 + 10000 - 10000);
    await proposals.setProposalStatus(ctx, p.id, "enviada");
    await expect(proposals.updateProposal(ctx, p.id, { companyId: deal.companyId, title: "x", items: [] })).rejects.toThrow(/nova versão/);
    const v2 = await proposals.newProposalVersion(ctx, p.id);
    expect(v2.version).toBe(2);
    await proposals.setProposalStatus(ctx, p.id, "aprovada");

    // conversão idempotente em projeto + cobranças
    const a = await projects.convertDealToProject(ctx, deal.id, { createReceivables: true, dueDate: "2026-12-10" });
    const b = await projects.convertDealToProject(ctx, deal.id, { createReceivables: true, dueDate: "2026-12-10" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.projectId).toBe(a.projectId);
    const recs = await finance.listReceivables(ctx, { projectId: a.projectId });
    expect(recs.length).toBe(3);
    expect(recs.reduce((s, r) => s + r.amountCents, 0)).toBe(460000 - 10000);
    expect((await projects.getProject(ctx, a.projectId)).company?.status).toBe("cliente");

    // pagamento: não excede saldo; recebido ≠ contratado ≠ a receber
    await expect(finance.registerPayment(ctx, { receivableId: recs[0].id, amountCents: recs[0].amountCents + 1, paidAt: "2026-11-18" })).rejects.toThrow(/saldo/);
    await finance.registerPayment(ctx, { receivableId: recs[0].id, amountCents: recs[0].amountCents, paidAt: "2026-11-18", method: "pix" });
    const sum = await finance.financeSummary(ctx);
    expect(sum.receivedCents).toBe(recs[0].amountCents);
    expect(sum.billedCents).toBe(450000);
    expect(sum.toReceiveCents).toBe(450000 - recs[0].amountCents);
    expect(sum.contractedCents).toBe(450000);

    // dashboard reflete os dados reais
    const d = await dash.dashboardData(ctx, 30);
    expect(d.wonTotal).toBe(1);
    expect(d.openDeals).toBe(0);
    expect(d.finance?.receivedCents).toBe(recs[0].amountCents);

    // opt-out bloqueia mensagem
    await optout.registerOptOut(ctx, { companyId: deal.companyId, reason: "pediu" });
    const mc2 = await messages.messageContext(ctx, { companyId: deal.companyId });
    expect(mc2.blocked).toBe(true);
    expect(mc2.recipients).toHaveLength(0);
    await expect(messages.saveDraft(ctx, { companyId: deal.companyId, objective: "primeiro_contato", body: "oi" })).rejects.toThrow();

    // isolamento entre workspaces
    const [ws2] = await db.insert(workspaces).values({ name: "outro" }).returning();
    const other = { ...ctx, workspaceId: ws2.id };
    expect(await companies.listCompanies(other)).toHaveLength(0);
    await expect(companies.getCompany(other, deal.companyId)).rejects.toThrow(/não encontrad/);
  });

  it("MCP: token escopado, mesmas regras da interface, leitura × escrita", async () => {
    process.env.DATABASE_URL = url;
    const { db } = await import("@/lib/db");
    const { workspaces, workspaceMembers } = await import("@/db/schema");
    const ctxm = await import("@/lib/services/ctx");
    const [ws] = await db.insert(workspaces).values({ name: "mcp-" + randomUUID().slice(0, 6) }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: "u-mcp", email: "m@t.com", role: "owner" });
    await ctxm.seedWorkspaceDefaults(ws.id);
    const ctx: import("@/lib/services/ctx").Ctx = { workspaceId: ws.id, userId: "u-mcp", email: "m@t.com", role: "owner", actor: "user", scope: "write" };
    const deals = await import("@/lib/services/deals");
    const tokens = await import("@/lib/services/tokens");
    const deal = await deals.createDealWithCompany(ctx, { company: { name: "Clínica Vida", phone: phone() }, deal: { title: "Landing page — Clínica Vida", estimatedValueCents: 90000 } });
    const read = await tokens.createApiToken(ctx, { name: "leitura", scope: "read" });
    const write = await tokens.createApiToken(ctx, { name: "escrita", scope: "write" });
    expect(read.token.startsWith("mglabs_")).toBe(true);
    const { POST } = await import("@/app/api/mcp/route");

    const rpc = async (token: string | null, method: string, params?: unknown) => {
      const res = await POST(new Request("http://x/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
      return { status: res.status, body: await res.json() };
    };
    const init = { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "teste", version: "1" } };

    expect((await rpc(null, "initialize", init)).status).toBe(401);
    expect((await rpc("mglabs_inventado", "initialize", init)).status).toBe(401);
    expect((await rpc(read.token, "initialize", init)).body.result.serverInfo.name).toBe("mglabs-os");
    const list = await rpc(read.token, "tools/list");
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_leads", "get_lead", "get_pipeline", "list_due_tasks", "create_message_draft", "create_task"]));
    expect(names).not.toContain("execute_sql");

    const leads = await rpc(read.token, "tools/call", { name: "list_leads", arguments: { limit: 5 } });
    expect(JSON.parse(leads.body.result.content[0].text)[0].titulo).toContain("Clínica Vida");
    const one = await rpc(read.token, "tools/call", { name: "get_lead", arguments: { id: deal.id } });
    expect(JSON.parse(one.body.result.content[0].text).empresa.nome).toBe("Clínica Vida");

    // token de leitura não grava
    const denied = await rpc(read.token, "tools/call", { name: "create_task", arguments: { title: "Ligar amanhã", deal_id: deal.id } });
    expect(denied.body.result.isError).toBe(true);
    expect(denied.body.result.content[0].text).toMatch(/somente leitura/);

    // token de escrita cria tarefa e rascunho (nunca envia), mas não fecha negócio
    const ok = await rpc(write.token, "tools/call", { name: "create_task", arguments: { title: "Ligar amanhã", deal_id: deal.id, due_date: "2026-11-20" } });
    expect(ok.body.result.isError).toBeUndefined();
    const draft = await rpc(write.token, "tools/call", { name: "create_message_draft", arguments: { company_id: deal.companyId, deal_id: deal.id, objective: "follow_up", body: "Oi! Passando para saber se viu minha mensagem." } });
    expect(JSON.parse(draft.body.result.content[0].text).status).toBe("rascunho");
    const stage = await rpc(write.token, "tools/call", { name: "update_deal_stage", arguments: { deal_id: deal.id, stage: "ganho" } });
    expect(stage.body.error ?? stage.body.result.isError).toBeTruthy();
    const moved = await rpc(write.token, "tools/call", { name: "update_deal_stage", arguments: { deal_id: deal.id, stage: "conversa" } });
    expect(JSON.parse(moved.body.result.content[0].text).etapa).toBe("conversa");
    const tl = (await deals.getDeal(ctx, deal.id)).timeline;
    expect(tl.find((t) => t.kind === "etapa")?.authorKind).toBe("mcp");

    // opt-out vale também no MCP
    const optout = await import("@/lib/services/optout");
    await optout.registerOptOut(ctx, { companyId: deal.companyId });
    const blocked = await rpc(write.token, "tools/call", { name: "create_message_draft", arguments: { company_id: deal.companyId, objective: "follow_up", body: "Oi, tudo bem por aí?" } });
    expect(blocked.body.result.isError).toBe(true);
    const company = await rpc(read.token, "tools/call", { name: "get_company", arguments: { id: deal.companyId } });
    expect(company.body.result.content[0].text).not.toMatch(/\+55629\d{8}/);

    // revogado = sem acesso
    await tokens.revokeApiToken(ctx, write.id);
    expect((await rpc(write.token, "tools/list")).status).toBe(401);
    // GET não é aceito (sem sessão)
    const { GET } = await import("@/app/api/mcp/route");
    expect((await GET()).status).toBe(405);
  });
});

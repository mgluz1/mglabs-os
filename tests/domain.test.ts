import { describe, expect, it } from "vitest";

import { riskWarnings, sanitizeForAi } from "@/lib/ai/sanitize";
import { addMonthsYmd, relativeDays, ymdSP } from "@/lib/dates";
import { brl, centsToInput, parseMoney, proposalTotals, receivableState, splitInstallments } from "@/lib/money";
import { buildTemplateText, extractVariables, renderTemplate, withOptOut, OPT_OUT_LINE, DEFAULT_TEMPLATES } from "@/lib/messages";
import { LEGACY_STAGE_MAP, STAGE_DEFS } from "@/lib/config/crm";

describe("dinheiro (centavos)", () => {
  it("converte entradas brasileiras e internacionais", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 1.200")).toBe(120000);
    expect(parseMoney("1200.5")).toBe(120050);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(10.1)).toBe(1010);
    expect(centsToInput(123456)).toBe("1234,56");
    expect(brl(123456)).toMatch(/1\.234,56/);
    expect(brl(null)).toBe("—");
  });
  it("totais da proposta e desconto limitado ao subtotal", () => {
    expect(proposalTotals([{ quantity: 2, unitPriceCents: 5000 }, { quantity: 1, unitPriceCents: 450000 }], 10000)).toEqual({ subtotalCents: 460000, discountCents: 10000, totalCents: 450000 });
    expect(proposalTotals([{ quantity: 1, unitPriceCents: 1000 }], 99999).totalCents).toBe(0);
    expect(proposalTotals([], 0).totalCents).toBe(0);
  });
  it("divide parcelas sem perder centavo", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(splitInstallments(5, 1)).toEqual([5]);
  });
  it("estado da cobrança é derivado dos pagamentos", () => {
    const r = { status: "aberta", amountCents: 1000, paidCents: 0, dueDate: "2026-11-20" };
    expect(receivableState(r, "2026-11-18")).toBe("a_vencer");
    expect(receivableState(r, "2026-11-21")).toBe("vencida");
    expect(receivableState({ ...r, paidCents: 400 }, "2026-11-18")).toBe("parcial");
    expect(receivableState({ ...r, paidCents: 1000 }, "2026-12-01")).toBe("paga");
    expect(receivableState({ ...r, status: "cancelada" }, "2026-12-01")).toBe("cancelada");
  });
});

describe("datas", () => {
  it("soma meses respeitando fim de mês", () => {
    expect(addMonthsYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsYmd("2026-11-10", 3)).toBe("2027-02-10");
  });
  it("usa o fuso de São Paulo", () => {
    expect(ymdSP(new Date("2026-11-19T01:30:00Z"))).toBe("2026-11-18");
    expect(relativeDays(new Date("2026-11-19T12:00:00Z"), new Date("2026-11-18T12:00:00Z"))).toBe("amanhã");
  });
});

describe("mensagens", () => {
  it("omite linhas com variável vazia e nunca deixa lacunas", () => {
    const out = renderTemplate("Olá{{contato}}! Aqui é {{remetente}}.\n{{origem}}.\n{{observacao}}\nPosso ajudar a {{empresa}}?", { empresa: "Barbearia X", remetente: "Miguel" });
    expect(out).toBe("Olá! Aqui é Miguel.\nPosso ajudar a Barbearia X?");
  });
  it("aplica opt-out só em abordagem a frio e sem duplicar", () => {
    const body = "Oi{{contato}}, tudo bem?";
    const cold = buildTemplateText(body, { empresa: "X", contatoNome: "Ana Souza", remetente: "M" }, "primeiro_contato", true);
    expect(cold).toContain("Oi, Ana, tudo bem?");
    expect(cold.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(withOptOut(cold)).toBe(cold);
    expect(buildTemplateText(body, { empresa: "X", remetente: "M" }, "pos_venda", true)).not.toContain(OPT_OUT_LINE);
  });
  it("modelos iniciais só usam variáveis conhecidas e não prometem nada", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(extractVariables(t.body).every((v) => ["empresa", "contato", "remetente", "servico", "cidade", "observacao", "origem"].includes(v))).toBe(true);
      expect(riskWarnings(t.body)).toEqual([]);
    }
  });
});

describe("IA: minimização", () => {
  it("remove dados pessoais antes de enviar ao Gemini", () => {
    const s = sanitizeForAi("Falar com maria@exemplo.com ou (62) 99999-1234, CPF 123.456.789-09, @barbearia_x, https://instagram.com/x, orçamento R$ 3.500");
    expect(s).not.toMatch(/maria@|99999|123\.456|barbearia_x|instagram\.com|3\.500/);
    expect(s).toContain("[e-mail]");
    expect(s).toContain("[telefone]");
    expect(s).toContain("[valor]");
  });
  it("limita o tamanho e aceita vazio", () => {
    expect(sanitizeForAi("a".repeat(900)).length).toBe(400);
    expect(sanitizeForAi(null)).toBe("");
  });
  it("alerta promessas, descontos, urgência e a frase proibida", () => {
    expect(riskWarnings("Só hoje: 30% de desconto, garantimos aumentar suas vendas")).toEqual(expect.arrayContaining(["usa urgência", "cita porcentagem", "cita desconto/gratuidade", "promete garantia"]));
    expect(riskWarnings("Encontrei vocês no Google")).toContain("afirma ter achado no Google");
    expect(riskWarnings("Oi! Vi que vocês atendem por agendamento. Posso mostrar uma ideia?")).toEqual([]);
  });
});

describe("funil", () => {
  it("mapeia as etapas antigas para as novas sem perder nenhuma", () => {
    const keys = new Set(STAGE_DEFS.map((s) => s.key as string));
    for (const [, v] of Object.entries(LEGACY_STAGE_MAP)) expect(keys.has(v)).toBe(true);
    expect(Object.keys(LEGACY_STAGE_MAP).sort()).toEqual(["abordado", "fechado", "novo", "perdido", "proposta", "respondeu", "reuniao"]);
  });
  it("tem exatamente um tipo ganho e um perdido, no fim", () => {
    expect(STAGE_DEFS.filter((s) => s.kind === "won")).toHaveLength(1);
    expect(STAGE_DEFS.filter((s) => s.kind === "lost")).toHaveLength(1);
    expect(STAGE_DEFS.slice(-2).map((s) => s.kind)).toEqual(["won", "lost"]);
  });
});

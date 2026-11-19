import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: () => {} }));

const { mockGenerateContent, mockList } = vi.hoisted(() => ({ mockGenerateContent: vi.fn(), mockList: vi.fn() }));

vi.mock("@/lib/db", () => {
  const tx = {
    // reserveAiQuota: 1º execute = soma do dia (0 chamadas), 2º = upsert
    execute: async (q: SQL) => {
      void q;
      return { rows: [{ n: 0 }] };
    },
  };
  return { db: { ...tx, transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) }, pool: {} };
});

vi.mock("@google/genai", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(opts: { message: string; status: number }) {
      super(opts.message);
      this.status = opts.status;
    }
  },
  GoogleGenAI: class GoogleGenAI {
    models = { generateContent: mockGenerateContent, list: mockList, get: async () => ({}) };
  },
}));

import { ApiError } from "@google/genai";

import { maskReversible } from "@/lib/ai/mask";
import { refineMessage } from "@/lib/ai/features";
import { discoverModel, testGemini } from "@/lib/ai/gemini";
import { planMessage, queueRank } from "@/lib/message-plan";
import { OPT_OUT_LINE } from "@/lib/messages";
import { detectStopRequest, quickIntent, suggestedStageForIntent } from "@/lib/reply-intel";
import type { Ctx } from "@/lib/services/ctx";

const CTX: Ctx = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "u", email: "o@x.com", role: "owner", actor: "user", scope: "write" };
const DAY = 86_400_000;
const now = new Date("2026-06-10T15:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);

describe("máscara reversível", () => {
  it("troca e-mail, telefone, link, perfil e nome por marcadores e restaura", () => {
    const src = "Oi Carla, me chama no (62) 99999-1234 ou carla@loja.com.br, veja https://loja.com.br/x e @lojadacarla";
    const m = maskReversible(src, { names: ["Carla"] });
    expect(m.masked).not.toMatch(/99999|carla@|loja\.com\.br|@lojadacarla|Carla/);
    expect(m.masked).toContain("{{TEL_1}}");
    expect(m.masked).toContain("{{EMAIL_1}}");
    expect(m.masked).toContain("{{LINK_1}}");
    expect(m.masked).toContain("{{NOME_1}}");
    expect(m.restore(m.masked)).toBe(src);
  });
  it("detecta marcador perdido pelo modelo", () => {
    const m = maskReversible("Veja https://a.com e fale no 62 98888-7777");
    expect(m.missing("Veja {{LINK_1}}")).toEqual(["{{TEL_1}}"]);
    expect(m.missing(m.masked)).toEqual([]);
  });
});

describe("leitura de resposta sem IA", () => {
  it.each([
    "não quero mais receber mensagens",
    "Por favor, pare de me mandar mensagem",
    "me tira da lista",
    "Isso é spam, vou denunciar",
    "Nunca mais me chame",
    "Não tenho interesse. Pode parar de enviar",
  ])("detecta pedido de parada: %s", (t) => {
    expect(detectStopRequest(t)).toBe(true);
    expect(quickIntent(t)).toBe("parar_contato");
  });
  it("não confunde conversa normal com pedido de parada", () => {
    for (const t of ["Quanto custa um site?", "pode me mandar exemplos", "Vamos conversar amanhã às 10", "não preciso agora, me chama mês que vem", "me chama para mandar os exemplos?", "pode enviar para este e-mail"]) {
      expect(detectStopRequest(t)).toBe(false);
    }
  });
  it("classifica intenções comuns", () => {
    expect(quickIntent("Quanto custa?")).toBe("pedido_orcamento");
    expect(quickIntent("achei meio caro, tem desconto?")).toBe("objecao_preco");
    expect(quickIntent("Agora não, me chama semana que vem")).toBe("adiar");
    expect(quickIntent("tenho interesse, como funciona?")).toBe("interesse");
    expect(quickIntent("vamos marcar uma reunião")).toBe("agendar_reuniao");
    expect(quickIntent("já tenho agência, obrigado")).toBe("sem_interesse");
  });
  it("etapa sugerida nunca fecha negócio como ganho e parada vira perdido sem tarefa", () => {
    expect(suggestedStageForIntent("interesse").stage).toBe("conversa");
    expect(suggestedStageForIntent("parar_contato")).toEqual({ stage: "perdido", followUpDays: 0 });
    for (const i of ["interesse", "duvida", "pedido_orcamento", "agendar_reuniao", "objecao_preco", "adiar", "sem_interesse", "parar_contato", "outro"] as const) {
      expect(suggestedStageForIntent(i).stage).not.toBe("ganho");
    }
  });
});

describe("plano da próxima mensagem", () => {
  it("sem histórico: primeiro contato", () => {
    expect(planMessage({ stageKey: "novo", history: [], now }).objective).toBe("primeiro_contato");
  });
  it("cliente respondeu e ficou sem retorno: resposta, prioridade máxima", () => {
    const p = planMessage({ stageKey: "conversa", history: [{ kind: "mensagem_enviada", occurredAt: ago(3) }, { kind: "resposta", occurredAt: ago(1) }], now });
    expect(p).toMatchObject({ objective: "resposta_interesse", awaitingReply: true, priority: 0 });
  });
  it("respondemos depois da resposta e passaram 2+ dias: follow-up", () => {
    const p = planMessage({ stageKey: "conversa", history: [{ kind: "resposta", occurredAt: ago(6) }, { kind: "mensagem_enviada", occurredAt: ago(3) }], now });
    expect(p).toMatchObject({ objective: "follow_up", awaitingReply: false, waitingDays: 3, priority: 1 });
  });
  it("enviado há pouco: baixa prioridade; 30+ dias: reativação", () => {
    expect(planMessage({ stageKey: "primeiro_contato", history: [{ kind: "mensagem_enviada", occurredAt: ago(0) }], now }).priority).toBe(3);
    expect(planMessage({ stageKey: "primeiro_contato", history: [{ kind: "mensagem_enviada", occurredAt: ago(40) }], now }).objective).toBe("reativacao");
  });
  it("etapas especiais", () => {
    expect(planMessage({ stageKey: "ganho", history: [], now }).objective).toBe("pos_venda");
    expect(planMessage({ stageKey: "perdido", history: [], now }).objective).toBe("reativacao");
    expect(planMessage({ stageKey: "negociacao", history: [], now }).objective).toBe("negociacao");
    expect(planMessage({ stageKey: "proposta", history: [], now }).objective).toBe("apresentacao_proposta");
  });
  it("ordena fila: resposta > follow-up > novo; nota desempata", () => {
    const reply = planMessage({ stageKey: "conversa", history: [{ kind: "resposta", occurredAt: ago(1) }], now });
    const fu = planMessage({ stageKey: "primeiro_contato", history: [{ kind: "mensagem_enviada", occurredAt: ago(5) }], now });
    const fresh = planMessage({ stageKey: "novo", history: [], now });
    expect(queueRank(reply, 10)).toBeLessThan(queueRank(fu, 90));
    expect(queueRank(fu, 10)).toBeLessThan(queueRank(fresh, 90));
    expect(queueRank(fresh, 80)).toBeLessThan(queueRank(fresh, 20));
  });
});

describe("Gemini: refino, descoberta de modelo e teste", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockList.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_ENABLED;
  });

  it("refino: envia texto mascarado, restaura link/telefone e mantém a linha de opt-out", async () => {
    mockGenerateContent.mockImplementation(async ({ contents }: { contents: string }) => {
      expect(contents).not.toMatch(/https:\/\/mglabs|99999/);
      expect(contents).not.toContain(OPT_OUT_LINE);
      return { text: JSON.stringify({ text: "Oi! Veja {{LINK_1}} ou chame em {{TEL_1}}. Faz sentido?" }) };
    });
    const out = await refineMessage(CTX, { text: `Olá! Preparei algo: https://mglabs.com.br/exemplo — me liga (62) 99999-1234.\n\n${OPT_OUT_LINE}`, action: "encurtar", consent: true });
    expect(out.text).toContain("https://mglabs.com.br/exemplo");
    expect(out.text).toContain("(62) 99999-1234");
    expect(out.text.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(out.original).toContain("Preparei");
  });

  it("refino: recusa resposta que perdeu um link e exige consentimento", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ text: "Oi! Quer ver um exemplo?" }) });
    await expect(refineMessage(CTX, { text: "Oi! Veja https://mglabs.com.br/x quando puder.", action: "direta", consent: true })).rejects.toThrow(/removeu um link/);
    await expect(refineMessage(CTX, { text: "Oi! Tudo certo por aí?", action: "direta", consent: false })).rejects.toThrow(/Autorize/);
  });

  it("refino: exige IA configurada", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(refineMessage(CTX, { text: "Oi! Tudo certo por aí?", action: "corrigir", consent: true })).rejects.toThrow(/não está configurada/);
  });

  it("descoberta: escolhe o Flash estável mais novo que gera conteúdo, ignora preview/tts/embedding", async () => {
    mockList.mockResolvedValue(
      (async function* () {
        yield { name: "models/gemini-9-pro", supportedActions: ["generateContent"] };
        yield { name: "models/gemini-3.7-flash-preview", supportedActions: ["generateContent"] };
        yield { name: "models/gemini-3.6-flash-tts", supportedActions: ["generateContent"] };
        yield { name: "models/gemini-2.5-flash", supportedActions: ["generateContent"] };
        yield { name: "models/gemini-3.6-flash", supportedActions: ["generateContent"] };
        yield { name: "models/gemini-3.6-flash-lite", supportedActions: ["generateContent"] };
        yield { name: "models/gemini-4-flash-embed", supportedActions: ["embedContent"] };
      })(),
    );
    const ai = { models: { list: mockList } } as unknown as Parameters<typeof discoverModel>[0];
    expect(await discoverModel(ai, new Set(["gemini-2.5-flash"]))).toBe("gemini-3.6-flash-lite");
  });

  it("geração: se todos os candidatos derem 404, usa o modelo descoberto na conta", async () => {
    mockGenerateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model !== "gemini-7-flash") throw new ApiError({ message: "not found", status: 404 });
      return { text: JSON.stringify({ ok: true }) };
    });
    mockList.mockResolvedValue((async function* () { yield { name: "models/gemini-7-flash", supportedActions: ["generateContent"] }; })());
    const r = await testGemini(CTX);
    expect(r.ok).toBe(true);
    expect(r.keyConfigured).toBe(true);
  });

  it("teste de conexão: sem chave devolve orientação e não chama a API; chave inválida vira erro amigável", async () => {
    delete process.env.GEMINI_API_KEY;
    const none = await testGemini(CTX);
    expect(none).toMatchObject({ ok: false, keyConfigured: false });
    expect(mockGenerateContent).not.toHaveBeenCalled();

    process.env.GEMINI_API_KEY = "bad";
    mockGenerateContent.mockRejectedValue(new ApiError({ message: "API key not valid", status: 400 }));
    const bad = await testGemini(CTX);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/inválida/);
  });
});

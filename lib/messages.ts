// Regras puras do Estúdio de Mensagens (sem servidor): modelos, variáveis, opt-out.
import type { ObjectiveId } from "@/lib/config/crm";

export const OPT_OUT_LINE = "Se não fizer sentido, é só me avisar que não volto a mandar.";

/** Objetivos de abordagem "a frio": levam a linha de opt-out por padrão. */
export const COLD_OBJECTIVES: ObjectiveId[] = ["primeiro_contato", "follow_up", "reativacao"];

export function withOptOut(text: string): string {
  const t = text.trim();
  return t.includes(OPT_OUT_LINE) ? t : `${t}\n\n${OPT_OUT_LINE}`;
}

export type TemplateVars = {
  empresa?: string | null;
  contato?: string | null;
  remetente?: string | null;
  servico?: string | null;
  cidade?: string | null;
  /** Fato verificado sobre o negócio, escrito/confirmado por você. */
  observacao?: string | null;
  /** Como você chegou até o negócio (ex.: "Encontrei a X ao mapear negócios de Goiânia"). */
  origem?: string | null;
};

/** Variáveis que ficam vazias sem derrubar a linha ("Olá{{contato}}!" vira "Olá!"). */
const INLINE_OPTIONAL = new Set(["contato", "cidade"]);

/**
 * Substitui {{variavel}}. Linhas que ficariam com uma variável obrigatória vazia são removidas
 * (não deixa frases quebradas), e nunca inventa conteúdo.
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  const lines = body.split("\n").map((line) => {
    let empty = false;
    const out = line.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
      const v = (vars as Record<string, string | null | undefined>)[k];
      if (v == null || String(v).trim() === "") {
        if (!INLINE_OPTIONAL.has(k)) empty = true;
        return "";
      }
      return String(v).trim();
    });
    return empty ? null : out;
  });
  return lines
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
}

/** Quando nenhum serviço foi escolhido: genérico e verdadeiro, nunca um serviço inventado. */
export const DEFAULT_SERVICE = "sites e soluções digitais";

export const TEMPLATE_VARIABLES = ["empresa", "contato", "remetente", "servico", "cidade", "observacao", "origem"] as const;

/** Modelos iniciais (editáveis em Mensagens). Curtos, humanos, sem promessas nem números inventados. */
export const DEFAULT_TEMPLATES: { name: string; objective: ObjectiveId; service?: string | null; body: string }[] = [
  {
    name: "Primeiro contato — direto",
    objective: "primeiro_contato",
    service: null,
    body: "Olá{{contato}}! Aqui é {{remetente}}, da MGLABS, em Goiânia.\n{{origem}}.\n{{observacao}}\nTrabalho com {{servico}} para negócios locais.\nFaz sentido eu te mostrar como isso funcionaria na {{empresa}}?",
  },
  {
    name: "Primeiro contato — Site institucional",
    objective: "primeiro_contato",
    service: "Site institucional",
    body: "Olá{{contato}}! Aqui é {{remetente}}, da MGLABS, em Goiânia.\n{{origem}}.\n{{observacao}}\nAjudo negócios locais a ter um site claro, rápido no celular e fácil para o cliente pedir atendimento.\nPosso te enviar uma ideia rápida aplicada à {{empresa}}?",
  },
  {
    name: "Primeiro contato — Site + agendamento",
    objective: "primeiro_contato",
    service: "Site + agendamento",
    body: "Olá{{contato}}! Aqui é {{remetente}}, da MGLABS, em Goiânia.\n{{origem}}.\n{{observacao}}\nTrabalho com página profissional e agendamento online para reduzir idas e vindas no WhatsApp.\nFaz sentido eu te mostrar um exemplo rápido para a {{empresa}}?",
  },
  {
    name: "Primeiro contato — Landing page",
    objective: "primeiro_contato",
    service: "Landing page",
    body: "Olá{{contato}}! Aqui é {{remetente}}, da MGLABS, em Goiânia.\n{{origem}}.\n{{observacao}}\nCrio páginas diretas para apresentar seus serviços e transformar visitas do Instagram ou Google em conversas no WhatsApp.\nPosso te mostrar como ficaria para a {{empresa}}?",
  },
  {
    name: "Primeiro contato — Automação de WhatsApp",
    objective: "primeiro_contato",
    service: "Automação de WhatsApp",
    body: "Olá{{contato}}! Aqui é {{remetente}}, da MGLABS, em Goiânia.\n{{origem}}.\n{{observacao}}\nAjudo empresas locais a organizar o atendimento inicial no WhatsApp com respostas rápidas e lembretes para não perder contatos.\nFaz sentido conversar 5 minutos sobre a rotina da {{empresa}}?",
  },
  {
    name: "Follow-up leve",
    objective: "follow_up",
    service: null,
    body: "Oi{{contato}}, {{remetente}} da MGLABS aqui. Passando para saber se você chegou a ver minha mensagem sobre {{servico}} para a {{empresa}}. Posso te explicar em 5 minutos?",
  },
  {
    name: "Resposta a interessado",
    objective: "resposta_interesse",
    service: null,
    body: "Que bom saber do seu interesse{{contato}}! Para eu te passar algo que faça sentido para a {{empresa}}, posso te fazer duas ou três perguntas rápidas? Se preferir, marcamos uma conversa de 15 minutos.",
  },
  {
    name: "Envio de proposta",
    objective: "apresentacao_proposta",
    service: null,
    body: "Oi{{contato}}! Segue a proposta de {{servico}} para a {{empresa}}, com escopo, prazo e investimento. Qualquer ponto que queira ajustar, me avise e eu adapto. Posso te explicar por chamada?",
  },
  {
    name: "Negociação",
    objective: "negociacao",
    service: null,
    body: "Obrigado pelo retorno{{contato}}! Entendi seus pontos sobre a proposta. Consigo ajustar escopo ou forma de pagamento para caber melhor na {{empresa}}. Qual parte pesa mais para você hoje?",
  },
  {
    name: "Reativação",
    objective: "reativacao",
    service: null,
    body: "Oi{{contato}}, {{remetente}} da MGLABS. Conversamos há um tempo sobre {{servico}} para a {{empresa}}. Se ainda fizer sentido, posso retomar de onde paramos.",
  },
  {
    name: "Pós-venda",
    objective: "pos_venda",
    service: null,
    body: "Oi{{contato}}! Passando para saber como está sendo o uso do que entregamos para a {{empresa}}. Algum ajuste ou dúvida? Estou à disposição.",
  },
];

/** Escolhe o modelo mais adequado ao objetivo e à oferta/serviço selecionado. */
export function pickTemplateForOffer<T extends { objective: string; service: string | null }>(
  templates: T[],
  objective: string,
  service?: string | null,
): T | null {
  const byObjective = templates.filter((t) => t.objective === objective);
  if (!byObjective.length) return null;
  if (service) {
    const exact = byObjective.find((t) => t.service === service);
    if (exact) return exact;
  }
  return byObjective.find((t) => !t.service) ?? byObjective[0];
}

/** "{{contato}}" entra como ", Nome" para a saudação não ficar quebrada. */
export function greetingVars(contactName: string | null | undefined): string | null {
  const first = contactName?.trim().split(/\s+/)[0];
  return first ? `, ${first}` : null;
}

/** Monta o texto de um modelo para uma empresa (usado no navegador e no servidor). */
export function buildTemplateText(
  body: string,
  v: { empresa: string; contatoNome?: string | null; remetente: string; servico?: string | null; cidade?: string | null; observacao?: string | null; origem?: string | null },
  objective: string,
  optOut: boolean,
): string {
  const text = renderTemplate(body, { empresa: v.empresa, contato: greetingVars(v.contatoNome), remetente: v.remetente, servico: v.servico?.trim() || DEFAULT_SERVICE, cidade: v.cidade, observacao: v.observacao, origem: v.origem });
  return optOut && (COLD_OBJECTIVES as string[]).includes(objective) ? withOptOut(text) : text;
}

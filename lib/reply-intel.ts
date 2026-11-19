// Leitura rápida e DETERMINÍSTICA da resposta de um cliente (sem IA, sem custo).
// Serve de rede de segurança: pedido de parada é sempre detectado, com ou sem Gemini.

export const REPLY_INTENTS = [
  { id: "interesse", label: "Interessado" },
  { id: "pedido_orcamento", label: "Pediu valores/orçamento" },
  { id: "objecao_preco", label: "Achou caro" },
  { id: "duvida", label: "Tem dúvida" },
  { id: "agendar_reuniao", label: "Quer conversar/agendar" },
  { id: "adiar", label: "Pediu para falar depois" },
  { id: "sem_interesse", label: "Sem interesse" },
  { id: "parar_contato", label: "Pediu para parar de contatar" },
  { id: "outro", label: "Outro" },
] as const;
export type ReplyIntentId = (typeof REPLY_INTENTS)[number]["id"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// "não quero mais receber", "pare de mandar", "me tira da lista", "spam", "denunciar", "lgpd"…
const STOP: RegExp[] = [
  /\b(nao|n) (quero|desejo|preciso) (mais )?(receber|mensagens?|contato|ser contatad[oa])\b/,
  /\bnao (me )?(mande|manda|envie|envia|chame|chama|ligue|liga|procure)\b/,
  /\b(pare|parem|chega|cessem) (de )?(me )?(mandar|enviar|chamar|ligar|incomodar|contatar|escrever)\b/,
  /\b(para|parar) de (me )?(mandar|enviar|chamar|ligar|incomodar|contatar|escrever)\b/,
  /\b(me )?(tire|tira|retire|retira|remova|remove|exclua|exclui|apague|apaga) (meu|do|da|de) (numero|contato|cadastro|lista|banco)\b/,
  /\b(sair|saia|descadastr\w*|opt[ -]?out|cancelar (o )?(envio|contato))\b/,
  /\b(spam|perturba\w*|incomoda\w*|assedio|denunci\w*|lgpd|procon|bloque\w+ (voce|vcs|o numero))\b/,
  /\bnunca mais (me )?(mande|chame|procure|ligue|entre em contato)\b/,
];

export function detectStopRequest(text: string): boolean {
  const t = norm(text);
  return STOP.some((re) => re.test(t));
}

const RULES: [ReplyIntentId, RegExp][] = [
  ["objecao_preco", /\b(caro|careza|muito caro|nao cabe no (meu )?orcamento|sem (grana|verba|dinheiro)|fora (do|de) (meu )?(orcamento|alcance)|mais barato|desconto)\b/],
  ["pedido_orcamento", /\b(quanto (custa|fica|sai|e)|qual (o )?(valor|preco)|valores?|precos?|orcamento|investimento|me passa (os )?valores)\b/],
  ["agendar_reuniao", /\b(vamos conversar|podemos (conversar|marcar|falar)|marcar (uma )?(conversa|reuniao|call|ligacao)|reuniao|me liga|pode ligar|(amanha|hoje|segunda|terca|quarta|quinta|sexta) (as|a partir))\b/],
  ["adiar", /\b(depois|mais tarde|semana que vem|mes que vem|agora nao|no momento nao|outra hora|estou (ocupad|corrid)|retorno (depois|em)|te (aviso|chamo))\b/],
  ["sem_interesse", /\b(nao tenho interesse|sem interesse|nao me interessa|nao (preciso|quero)|ja tenho (site|agencia|alguem)|nao faz sentido|obrigad[oa],? mas nao)\b/],
  ["interesse", /\b(tenho interesse|me interessa|quero (saber|ver|conhecer)|pode (me )?(mostrar|explicar|mandar)|conta mais|como funciona|gostei|legal|show|vamos nessa|ok,? pode)\b/],
  ["duvida", /\?|\b(como|qual|quais|quando|onde|por que|porque|o que|quem)\b/],
];

/** Classificação por palavras-chave. Parada tem prioridade absoluta. */
export function quickIntent(text: string): ReplyIntentId {
  if (detectStopRequest(text)) return "parar_contato";
  const t = norm(text);
  for (const [id, re] of RULES) if (re.test(t)) return id;
  return "outro";
}

export const intentLabel = (id: string) => REPLY_INTENTS.find((i) => i.id === id)?.label ?? id;

/** Etapa sugerida (só entre abertas) para cada intenção, e prazo de retorno em dias. Quem decide é o usuário. */
export function suggestedStageForIntent(intent: ReplyIntentId): { stage: string | null; followUpDays: number } {
  switch (intent) {
    case "interesse":
    case "duvida":
      return { stage: "conversa", followUpDays: 1 };
    case "pedido_orcamento":
      return { stage: "conversa", followUpDays: 1 };
    case "agendar_reuniao":
      return { stage: "reuniao", followUpDays: 1 };
    case "objecao_preco":
      return { stage: "negociacao", followUpDays: 2 };
    case "adiar":
      return { stage: null, followUpDays: 7 };
    case "sem_interesse":
      return { stage: "perdido", followUpDays: 0 };
    case "parar_contato":
      return { stage: "perdido", followUpDays: 0 };
    default:
      return { stage: null, followUpDays: 2 };
  }
}

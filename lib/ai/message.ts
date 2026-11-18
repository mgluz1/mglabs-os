import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export const OFFERS = {
  site: "Site profissional",
  agendamento: "Agendamento online",
  landing: "Landing page",
  automacao_whatsapp: "Automação de atendimento no WhatsApp",
} as const;
export type OfferId = keyof typeof OFFERS;

export const TONES = { amigavel: "amigável", direto: "direto", formal: "formal" } as const;
export type ToneId = keyof typeof TONES;

export const OPT_OUT_LINE = "Se não fizer sentido, é só me avisar que não volto a mandar.";

export type MessageInput = {
  name: string;
  category: string;
  neighborhood: string | null;
  city: string | null;
  signals: string[];
  offer: OfferId;
  tone: ToneId;
  myName: string;
};

const SYSTEM = `Você escreve a primeira mensagem de prospecção de um desenvolvedor web freelancer de Goiânia para um pequeno negócio local, para ser enviada pelo WhatsApp.
Regras obrigatórias:
- Português do Brasil, natural, sem emoji em excesso (no máximo 1).
- No máximo 3 frases curtas, seguidas de 1 pergunta final simples.
- Cite exatamente 1 motivo concreto tirado da lista de sinais observados (não invente nada que não esteja na lista).
- Diga de onde veio o contato: "encontrei vocês no Google".
- Proibido: urgência falsa, desconto, preço, números ou resultados inventados, promessas de faturamento, elogios exagerados.
- Apresente-se pelo nome informado.
- Não inclua a linha de opt-out; ela é adicionada depois.
Responda apenas com o texto da mensagem, sem aspas e sem explicações.`;

export async function generateMessage(i: MessageInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
  const client = new Anthropic({ apiKey });
  const local = [i.neighborhood, i.city].filter(Boolean).join(", ");
  const user = [
    `Meu nome: ${i.myName}`,
    `Negócio: ${i.name} (${i.category}${local ? `, ${local}` : ""})`,
    `Oferta: ${OFFERS[i.offer]}`,
    `Tom: ${TONES[i.tone]}`,
    `Sinais observados (use 1): ${i.signals.length ? i.signals.map((s) => `\n- ${s}`).join("") : "\n- nenhum sinal específico"}`,
  ].join("\n");

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["“]|["”]$/g, "");
  return withOptOut(text);
}

export function withOptOut(text: string): string {
  const t = text.trim();
  return t.includes(OPT_OUT_LINE) ? t : `${t}\n\n${OPT_OUT_LINE}`;
}

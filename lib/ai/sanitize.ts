// Minimização de dados antes de qualquer envio ao Gemini (plano gratuito pode usar entradas para melhorar produtos
// e revisá-las por humanos). Funções puras, testadas em tests/ai.test.ts.

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// telefones BR com/sem DDI, parênteses, espaços e hífens
const PHONE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi;
const HANDLE = /(^|\s)@[\w.]{2,30}/g;
const MONEY = /R\$\s?\d[\d.,]*/gi;

/** Remove e-mails, telefones, documentos, links, @perfis e valores em reais de um texto livre. */
export function sanitizeForAi(text: string | null | undefined, opts: { maxLen?: number; keepMoney?: boolean } = {}): string {
  if (!text) return "";
  let t = text
    .replace(EMAIL, "[e-mail]")
    .replace(CNPJ, "[documento]")
    .replace(CPF, "[documento]")
    .replace(URL_RE, "[link]")
    .replace(PHONE, "[telefone]")
    .replace(HANDLE, "$1[perfil]");
  if (!opts.keepMoney) t = t.replace(MONEY, "[valor]");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, opts.maxLen ?? 400);
}

/** Frases/promessas que a mensagem comercial não pode conter (sugestões da IA são sempre revisadas). */
const RISKY: [RegExp, string][] = [
  [/R\$\s?\d/i, "cita valor em reais"],
  [/\b\d{1,3}\s?%/, "cita porcentagem"],
  [/\b(garant(imos|ido|ia)|100% garantido|sem risco)\b/i, "promete garantia"],
  [/\b(última chance|so hoje|só hoje|corra|imperdível|oferta limitada|urgente)\b/i, "usa urgência"],
  [/\b(desconto|promoção|gr[aá]tis)\b/i, "cita desconto/gratuidade"],
  [/\b(aumentar|dobrar|triplicar)\b[^.]{0,40}\b(vendas|faturamento|clientes|lucro)\b/i, "promete resultado"],
  [/encontrei (vocês|a \S+) no google/i, "afirma ter achado no Google"],
  [/\b(soluções inovadoras|transformação digital|alavancar (seus )?resultados|sinergia|ecossistema digital)\b/i, "jargão comercial robótico"],
  [/\b(espero que esteja (tudo )?bem|venho por meio desta|prezado|caro cliente)\b/i, "abertura formal/genérica"],
  [/\b(admiro muito|trabalho incrível|sucesso absoluto)\b/i, "elogio genérico não verificado"],
];
export function riskWarnings(text: string): string[] {
  return RISKY.filter(([re]) => re.test(text)).map(([, why]) => why);
}

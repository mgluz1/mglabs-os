// Mascaramento REVERSÍVEL para textos que voltam ao usuário (refino de mensagem e resposta do cliente).
// Diferente de sanitizeForAi (que apaga), aqui e-mails, telefones, links, @perfis e nomes de pessoas viram
// marcadores {{TIPO_n}} antes de ir ao Gemini e são restaurados na resposta. Assim o modelo nunca vê o dado
// pessoal, mas o texto final continua com o link/telefone/nome certo.

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi;
const PHONE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const HANDLE = /(^|\s)(@[\w.]{2,30})/g;
const DOC = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

export type Masked = {
  masked: string;
  /** Troca os marcadores pelos valores originais. */
  restore: (text: string) => string;
  /** Marcadores que existiam no texto enviado e sumiram da resposta (dado perdido pelo modelo). */
  missing: (text: string) => string[];
  tokens: { token: string; value: string; kind: string }[];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param names nomes de pessoas a esconder (ex.: primeiro nome do contato). Comparação sem acento e sem caixa.
 */
export function maskReversible(input: string, opts: { names?: (string | null | undefined)[]; maxLen?: number } = {}): Masked {
  const tokens: Masked["tokens"] = [];
  const counters: Record<string, number> = {};
  const put = (kind: string, value: string) => {
    const existing = tokens.find((t) => t.kind === kind && t.value === value);
    if (existing) return existing.token;
    counters[kind] = (counters[kind] ?? 0) + 1;
    const token = `{{${kind}_${counters[kind]}}}`;
    tokens.push({ token, value, kind });
    return token;
  };

  let t = input.slice(0, opts.maxLen ?? 2000);
  t = t.replace(EMAIL, (m) => put("EMAIL", m));
  t = t.replace(URL_RE, (m) => put("LINK", m));
  t = t.replace(DOC, (m) => put("DOC", m));
  t = t.replace(PHONE, (m) => put("TEL", m));
  t = t.replace(HANDLE, (_, sp: string, h: string) => `${sp}${put("PERFIL", h)}`);

  // nomes de pessoas (palavras com 3+ letras), sem acento e sem diferenciar caixa
  const names = [...new Set((opts.names ?? []).flatMap((n) => (n ?? "").split(/\s+/)).map((n) => n.trim()).filter((n) => n.length >= 3))];
  for (const n of names) {
    const re = new RegExp(`(?<![\\p{L}\\d])${escapeRe(n)}(?![\\p{L}\\d])`, "giu");
    t = t.replace(re, (m) => put("NOME", m));
  }

  const restore = (text: string) => {
    let out = text;
    for (const { token, value } of tokens) out = out.split(token).join(value);
    return out;
  };
  const missing = (text: string) => tokens.filter((x) => !text.includes(x.token)).map((x) => x.token);
  return { masked: t, restore, missing, tokens };
}

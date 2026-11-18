export type PhoneInfo = {
  /** E.164, ex.: +5562999998888 */
  e164: string;
  /** Só dígitos, para wa.me: 5562999998888 */
  digits: string;
  mobile: boolean;
  display: string;
};

/** Normaliza telefone brasileiro. Celular = 11 dígitos com 9 após o DDD. */
export function parseBrPhone(raw: string | null | undefined): PhoneInfo | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1); // 0 de operadora/longa distância
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (Number(ddd) < 11) return null;
  const local = d.slice(2);
  const mobile = local.length === 9 && local.startsWith("9");
  if (local.length === 9 && !mobile) return null;
  const display =
    local.length === 9 ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return { e164: `+55${d}`, digits: `55${d}`, mobile, display };
}

/** Extrai o número de um link wa.me / api.whatsapp.com. */
export function phoneFromWhatsappLink(href: string): PhoneInfo | null {
  try {
    const u = new URL(href, "https://x.invalid");
    const host = u.hostname.replace(/^www\./, "");
    if (host === "wa.me") return parseBrPhone(u.pathname.slice(1));
    if (host === "api.whatsapp.com" || host === "web.whatsapp.com" || host === "whatsapp.com")
      return parseBrPhone(u.searchParams.get("phone"));
  } catch {
    return null;
  }
  return null;
}

export function waLink(phone: PhoneInfo, text: string): string {
  return `https://wa.me/${phone.digits}?text=${encodeURIComponent(text)}`;
}

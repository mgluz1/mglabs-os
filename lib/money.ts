// Dinheiro sempre em centavos inteiros (BRL). Nunca ponto flutuante no banco.

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function brl(cents: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (cents == null) return "—";
  const v = cents / 100;
  return opts.compact && Number.isInteger(v) ? fmt0.format(v) : fmt.format(v);
}

/** "1.234,56" | "1234.56" | "R$ 1.200" → 123456 centavos. Retorna null se vazio/ inválido. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.replace(/[^\d.,-]/g, "").trim();
  if (!s || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // o último separador é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    // "1.200" (milhar) vs "12.5" (decimal): 3 dígitos após o único ponto = milhar
    const after = s.length - lastDot - 1;
    if (after === 3 && s.indexOf(".") === lastDot) s = s.replace(".", "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Valor em reais para preencher um campo de formulário ("1200,50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export type ProposalItemInput = { quantity: number; unitPriceCents: number };

export function proposalTotals(items: ProposalItemInput[], discountCents = 0) {
  const subtotal = items.reduce((s, i) => s + Math.max(0, Math.round(i.quantity)) * Math.max(0, Math.round(i.unitPriceCents)), 0);
  const discount = Math.min(Math.max(0, Math.round(discountCents)), subtotal);
  return { subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount };
}

/** Divide o total em parcelas sem perder centavos (o resto vai para as primeiras). */
export function splitInstallments(totalCents: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

export type ReceivableState = "paga" | "parcial" | "vencida" | "a_vencer" | "cancelada";

/** Estado derivado: nunca gravado, sempre calculado dos pagamentos. */
export function receivableState(r: { status: string; amountCents: number; paidCents: number; dueDate: string }, todayYmd: string): ReceivableState {
  if (r.status === "cancelada") return "cancelada";
  if (r.paidCents >= r.amountCents) return "paga";
  if (r.dueDate < todayYmd) return "vencida";
  return r.paidCents > 0 ? "parcial" : "a_vencer";
}

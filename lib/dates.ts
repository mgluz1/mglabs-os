// Armazenamos tudo em UTC; America/Sao_Paulo só na apresentação e nos limites de "hoje".
export const TZ = "America/Sao_Paulo";

/** "2026-11-18" no fuso de São Paulo. */
export function ymdSP(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function startOfDaySP(d: Date = new Date()): Date {
  return new Date(`${ymdSP(d)}T00:00:00-03:00`);
}
export function endOfDaySP(d: Date = new Date()): Date {
  return new Date(`${ymdSP(d)}T23:59:59.999-03:00`);
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
/** Converte "2026-11-20" (campo date) em instante às 09:00 de Brasília. */
export function ymdToInstantSP(ymd: string, time = "09:00"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T${time}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dfDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dfShort = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" });
const dfTime = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const fmtDate = (d: Date | string | null | undefined) => (d ? dfDate.format(new Date(d)) : "—");
export const fmtShort = (d: Date | string | null | undefined) => (d ? dfShort.format(new Date(d)).replace(".", "") : "—");
export const fmtDateTime = (d: Date | string | null | undefined) => (d ? dfTime.format(new Date(d)) : "—");
/** "2026-11-20" (coluna date) → "20/11/2026" sem deslocar de fuso. */
export const fmtYmd = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "—");

export function relativeDays(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "";
  const days = Math.round((startOfDaySP(new Date(d)).getTime() - startOfDaySP(now).getTime()) / 86_400_000);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

import "server-only";

import { z } from "zod";

import { parseBrPhone } from "@/lib/phone";
import { ValidationError } from "@/lib/services/ctx";

export const optStr = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const reqStr = (max = 200) => z.string().trim().min(1, "Campo obrigatório").max(max);

export const uuid = z.string().uuid();

export const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .default([])
  .transform((t) => [...new Set(t)]);

export function normPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return parseBrPhone(raw)?.e164 ?? raw.trim().slice(0, 40);
}

export function normUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function normInstagram(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://instagram.com/${s.replace(/^@/, "")}`;
}

/** Valida entrada desconhecida (Server Actions / MCP) e devolve mensagem legível em pt-BR. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ValidationError(`${where}${issue.message}`);
  }
  return r.data;
}

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .nullish()
  .transform((v) => v || null);

export const instant = z
  .union([z.string(), z.date()])
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data inválida" });
      return z.NEVER;
    }
    return d;
  });

export const cents = z.number().int().min(0).max(1_000_000_000_00).nullish().transform((v) => v ?? null);

export const limitOf = (n: number | undefined, def = 50, max = 200) => Math.min(Math.max(n ?? def, 1), max);

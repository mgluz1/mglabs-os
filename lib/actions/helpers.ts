import "server-only";

import { ForbiddenError, NoAccessError, NotFoundError, requireCtx, ValidationError, type Ctx } from "@/lib/services/ctx";

export type { Result } from "@/lib/result";
import type { Result } from "@/lib/result";

/** Erros "de negócio" têm mensagem própria para o usuário; o resto vira uma mensagem genérica (sem vazar SQL). */
export class UserError extends Error {}

export async function act<T>(fn: (ctx: Ctx) => Promise<T>): Promise<Result<T>> {
  try {
    const ctx = await requireCtx();
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError || e instanceof NoAccessError || e instanceof UserError) {
      return { ok: false, error: e.message };
    }
    console.error("action", e instanceof Error ? e.message.slice(0, 300) : "erro");
    return { ok: false, error: "Algo deu errado. Tente novamente em instantes." };
  }
}

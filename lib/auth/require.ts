import "server-only";

import { auth } from "@/lib/auth/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autenticado");
  }
}

/** Checagem de sessão dentro de Server Actions e Route Handlers (não confiar só no proxy). */
export async function requireUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user) throw new UnauthorizedError();
  return session.user;
}

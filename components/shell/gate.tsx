import { Lock } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageSkeleton } from "@/components/ui/kit";
import { ForbiddenError, NoAccessError, NotFoundError, requireCtx, type Ctx } from "@/lib/services/ctx";
import { Suspense } from "react";

function Denied({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-warn/12 text-warn">
        <Lock className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="font-heading text-xl font-semibold">Sem acesso</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </div>
  );
}

async function Inner({ children }: { children: (ctx: Ctx) => Promise<ReactNode> | ReactNode }) {
  await connection();
  let ctx: Ctx;
  try {
    ctx = await requireCtx();
  } catch (e) {
    if (e instanceof NoAccessError) return <Denied message="Esta conta ainda não faz parte do espaço de trabalho. Peça ao proprietário para liberar o acesso." />;
    throw e;
  }
  try {
    return await children(ctx);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (e instanceof ForbiddenError) return <Denied message={e.message} />;
    throw e;
  }
}

/**
 * Envolve o conteúdo de uma página: lê a sessão e o espaço de trabalho (dentro de <Suspense>, como exige o
 * Cache Components), trata "sem acesso" e entrega o contexto autorizado à página.
 */
export function Gate({ children, fallback }: { children: (ctx: Ctx) => Promise<ReactNode> | ReactNode; fallback?: ReactNode }) {
  return (
    <Suspense fallback={fallback ?? <PageSkeleton />}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}

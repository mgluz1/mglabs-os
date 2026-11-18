"use client";

import { TriangleAlert } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-danger/12 text-danger">
        <TriangleAlert className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="font-heading text-xl font-semibold">Não foi possível carregar esta tela</h1>
      <p className="mt-2 text-sm text-muted">Tente de novo. Se continuar, confira se o banco de dados está acessível em Status.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Código: {error.digest}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={reset} className="btn btn-primary">Tentar novamente</button>
        <a href="/status" className="btn btn-ghost">Ver status</a>
      </div>
    </div>
  );
}

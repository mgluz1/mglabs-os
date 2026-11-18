import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { auth } from "@/lib/auth/server";
import { checkDatabase } from "@/lib/health";

import { SignOutButton } from "./sign-out-button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">radarMGLABS</h1>
        <SignOutButton />
      </header>
      <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
        <Status />
      </Suspense>
      <p className="text-sm text-gray-500">Radar e CRM chegam nas próximas etapas (docs/PROMPT-v0.md).</p>
    </main>
  );
}

// Lê a sessão (cookies) e consulta o banco: parte dinâmica, dentro do Suspense.
async function Status() {
  await connection();
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  const db = await checkDatabase();

  return (
    <>
      <p>
        Conectado como <strong>{session.user.email}</strong>.
      </p>
      <section className="rounded border p-4">
        <h2 className="mb-2 font-semibold">Banco de dados (Neon)</h2>
        {db.ok ? (
          <ul className="text-sm">
            <li>Postgres {db.postgres}</li>
            <li>PostGIS {db.postgis ?? "não instalado"}</li>
            <li>pg_trgm {db.pgTrgm ? "ativo" : "não instalado"}</li>
            <li>Tabelas do radar: {db.tables} de 9</li>
            <li>Tempo da consulta: {db.ms} ms</li>
          </ul>
        ) : (
          <p className="text-sm text-red-600">Erro: {db.error}</p>
        )}
      </section>
    </>
  );
}

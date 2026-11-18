import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { auth } from "@/lib/auth/server";
import { ImportOvertureButton } from "@/components/import-overture-button";
import { checkDatabase } from "@/lib/health";
import { radarInfo } from "@/lib/places/search";


export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Status</h1>
      <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
        <Status />
      </Suspense>
      
    </main>
  );
}

// Lê a sessão (cookies) e consulta o banco: parte dinâmica, dentro do Suspense.
async function Status() {
  await connection();
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  const [db, ov] = await Promise.all([checkDatabase(), radarInfo()]);

  return (
    <>
      <p>
        Conectado como <strong>{session.user.email}</strong>.
      </p>
      <section className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
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
          <p className="text-sm text-red-300">Erro: {db.error}</p>
        )}
      </section>
      <section className="space-y-3 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
        <h2 className="font-semibold">Base aberta de negócios (Overture Maps)</h2>
        <ul className="text-sm text-white/80">
          <li>{ov.total.toLocaleString("pt-BR")} negócios na região de Goiânia</li>
          <li>Release: {ov.release ?? "—"}</li>
          <li>Última importação: {ov.loaded_at ? new Date(ov.loaded_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}</li>
        </ul>
        <p className="text-xs text-white/45">Atualiza sozinha todo mês (GitHub Action no dia 25 e importação no dia 26).</p>
        <ImportOvertureButton />
      </section>
    </>
  );
}

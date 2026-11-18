import { connection } from "next/server";
import { Suspense } from "react";

import { RadarApp } from "@/components/radar/radar-app";
import { requireUser } from "@/lib/auth/require";
import { recentSearches } from "@/lib/queries";

export default function RadarPage({ searchParams }: PageProps<"/radar">) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-white/50">Carregando o radar…</div>}>
      <Radar searchParams={searchParams} />
    </Suspense>
  );
}

async function Radar({ searchParams }: { searchParams: PageProps<"/radar">["searchParams"] }) {
  await connection();
  await requireUser();
  const sp = await searchParams;
  const busca = typeof sp.busca === "string" && /^[0-9a-f-]{36}$/i.test(sp.busca) ? sp.busca : null;
  const recent = await recentSearches();
  return <RadarApp key={busca ?? "novo"} recent={recent} initialSearchId={busca} />;
}

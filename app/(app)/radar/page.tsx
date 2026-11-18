import { RadarApp } from "@/components/radar/radar-app";
import { Gate } from "@/components/shell/gate";
import { recentSearches } from "@/lib/queries";

export const metadata = { title: "Radar" };

export default function RadarPage({ searchParams }: PageProps<"/radar">) {
  return (
    <Gate fallback={<div className="p-8 text-sm text-muted">Carregando o radar…</div>}>
      {async () => {
        const sp = await searchParams;
        const busca = typeof sp.busca === "string" && /^[0-9a-f-]{36}$/i.test(sp.busca) ? sp.busca : null;
        const recent = await recentSearches();
        return <RadarApp key={busca ?? "novo"} recent={recent} initialSearchId={busca} />;
      }}
    </Gate>
  );
}

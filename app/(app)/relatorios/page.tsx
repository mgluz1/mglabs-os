import { redirect } from "next/navigation";

export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ visao: "relatorios" });
  if (typeof sp.dias === "string" && sp.dias) qs.set("dias", sp.dias);
  redirect(`/dashboard?${qs.toString()}`);
}

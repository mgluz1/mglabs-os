import { redirect } from "next/navigation";

export const metadata = { title: "Propostas" };

export default async function PropostasPage({ searchParams }: PageProps<"/propostas">) {
  const sp = await searchParams;
  if (sp.aba === "catalogo") redirect("/configuracoes?aba=funil");
  const qs = new URLSearchParams({ aba: "propostas" });
  for (const k of ["status", "novo", "empresa", "oportunidade"] as const) {
    if (typeof sp[k] === "string" && sp[k]) qs.set(k, sp[k] as string);
  }
  redirect(`/crm?${qs.toString()}`);
}

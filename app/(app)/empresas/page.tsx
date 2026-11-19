import { redirect } from "next/navigation";

export const metadata = { title: "Empresas e contatos" };

export default async function EmpresasPage({ searchParams }: PageProps<"/empresas">) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ aba: "empresas" });
  if (sp.aba === "contatos") qs.set("sub", "contatos");
  for (const k of ["status", "q", "novo"] as const) {
    if (typeof sp[k] === "string" && sp[k]) qs.set(k, sp[k] as string);
  }
  redirect(`/crm?${qs.toString()}`);
}

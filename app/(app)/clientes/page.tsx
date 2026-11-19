import { redirect } from "next/navigation";

export const metadata = { title: "Clientes" };

export default function ClientesPage() {
  redirect("/crm?aba=clientes");
}

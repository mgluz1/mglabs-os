import { CompaniesClient } from "@/components/company/companies-client";
import { Gate } from "@/components/shell/gate";
import { Page, PageHeader } from "@/components/ui/kit";
import { listCompanies, listContacts } from "@/lib/services/companies";

export const metadata = { title: "Empresas e contatos" };

export default function EmpresasPage({ searchParams }: PageProps<"/empresas">) {
  return (
    <Gate>
      {async (ctx) => {
        const sp = await searchParams;
        const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
        const tab = one("aba") === "contatos" ? "contatos" : "empresas";
        const status = ["lead", "cliente", "inativo"].includes(one("status")) ? one("status") : "";
        const q = one("q").slice(0, 80);
        const [companies, contacts] = await Promise.all([tab === "empresas" ? listCompanies(ctx, { q, status, limit: 200 }) : Promise.resolve([]), tab === "contatos" ? listContacts(ctx, { q, limit: 300 }) : Promise.resolve([])]);
        return (
          <>
            <PageHeader title="Empresas e contatos" description="Cadastro mestre do CRM. Uma empresa pode existir sem o Radar e ter vários contatos, oportunidades, propostas e projetos." />
            <Page><CompaniesClient tab={tab} status={status} q={q} companies={companies} contacts={contacts} /></Page>
          </>
        );
      }}
    </Gate>
  );
}

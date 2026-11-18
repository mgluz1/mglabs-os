import { connection } from "next/server";
import { Suspense } from "react";

import { CrmBoard } from "@/components/crm/crm-board";
import { requireUser } from "@/lib/auth/require";
import { crmBoard } from "@/lib/queries";

export default function CrmPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-white/50">Carregando o CRM…</div>}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  await connection();
  await requireUser();
  const leads = await crmBoard();
  return <CrmBoard leads={leads} />;
}

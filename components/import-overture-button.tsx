"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { importOvertureAction } from "@/app/actions";

export function ImportOvertureButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await importOvertureAction();
            setMsg(r.ok ? `${r.data.rows.toLocaleString("pt-BR")} lugares importados (release ${r.data.release}, ${r.data.removed} removidos) em ${(r.data.ms / 1000).toFixed(1)} s.` : r.error);
            router.refresh();
          })
        }
        className="inline-flex items-center gap-2 rounded-xl bg-fg/[0.05] px-3 py-2 text-sm ring-1 ring-fg/10 hover:bg-fg/[0.09] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {pending ? "Importando…" : "Atualizar base agora"}
      </button>
      {msg && <p className="text-xs text-fg/60">{msg}</p>}
    </div>
  );
}

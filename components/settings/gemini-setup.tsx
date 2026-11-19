"use client";

import { CheckCircle2, ExternalLink, PlugZap, XCircle } from "lucide-react";
import { useState } from "react";

import { useRun } from "@/components/ui/overlays";
import { testGeminiAction } from "@/lib/actions/ai";
import type { GeminiTest } from "@/lib/ai/gemini";

/** Passo a passo para ativar o Gemini gratuito (a chave fica só na Vercel; nunca passa pelo app). */
export function GeminiSetupGuide({ compact }: { compact?: boolean }) {
  return (
    <ol className={`list-decimal space-y-1.5 pl-5 text-sm ${compact ? "text-muted" : ""}`}>
      <li>
        Crie uma chave gratuita em{" "}
        <a className="inline-flex items-center gap-0.5 text-brand underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">
          aistudio.google.com/apikey <ExternalLink className="size-3" aria-hidden />
        </a>{" "}
        (não precisa de cartão).
      </li>
      <li>
        Na Vercel: projeto → <b>Settings → Environment Variables</b> → adicione <code className="rounded bg-elevated px-1 font-mono text-xs">GEMINI_API_KEY</code> (Production) com a chave.
      </li>
      <li>
        Faça um novo deploy (<b>Deployments → ⋯ → Redeploy</b>) e volte aqui para <b>Testar conexão</b>.
      </li>
    </ol>
  );
}

export function GeminiTestButton() {
  const { run, pending } = useRun();
  const [res, setRes] = useState<GeminiTest | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => testGeminiAction(), { refresh: true, onOk: setRes })}>
        <PlugZap className="size-4" aria-hidden /> {pending ? "Testando…" : "Testar conexão"}
      </button>
      {res ? (
        <div role="status" className={`rounded-lg border p-3 text-sm ${res.ok ? "border-ok/40 bg-ok/10" : "border-danger/40 bg-danger/10"}`}>
          <p className="flex items-center gap-1.5 font-medium">
            {res.ok ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
            {res.ok ? "Gemini respondendo" : "Não foi possível usar o Gemini"}
            {res.latencyMs != null ? <span className="font-normal text-muted"> · {res.latencyMs} ms</span> : null}
          </p>
          {res.error ? <p className="mt-1 text-muted">{res.error}</p> : null}
          <p className="mt-1 text-xs text-muted">Modelo configurado: <span className="font-mono">{res.model}</span></p>
          {res.available?.length ? <p className="mt-1 text-xs text-muted">Modelos Flash disponíveis na sua conta: <span className="font-mono">{res.available.join(", ")}</span></p> : null}
          {!res.keyConfigured ? <div className="mt-2"><GeminiSetupGuide compact /></div> : null}
        </div>
      ) : null}
    </div>
  );
}

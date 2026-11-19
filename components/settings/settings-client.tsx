"use client";

import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge, Field } from "@/components/ui/kit";
import { ConfirmButton, useRun, useToast } from "@/components/ui/overlays";
import { createTokenAction, revokeTokenAction, updateStageAction } from "@/lib/actions/business";
import { fmtDateTime } from "@/lib/dates";

type Stage = { key: string; label: string; probability: number; kind: string };
type Token = { id: string; name: string; prefix: string; scope: string; expiresAt: Date | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date };

export function StagesEditor({ stages, canEdit }: { stages: Stage[]; canEdit: boolean }) {
  const { run, pending } = useRun();
  const [rows, setRows] = useState(stages.map((s) => ({ ...s, probability: String(s.probability) })));
  return (
    <ul className="space-y-2">
      {rows.map((s, i) => (
        <li key={s.key} className="grid grid-cols-[1fr_90px_auto] items-center gap-2">
          <input className="input" value={s.label} disabled={!canEdit} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Nome da etapa ${s.key}`} />
          <div className="relative"><input type="number" min={0} max={100} className="input pr-7" value={s.probability} disabled={!canEdit || s.kind !== "open"} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, probability: e.target.value } : x)))} aria-label={`Probabilidade de ${s.label}`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span></div>
          {canEdit ? <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => updateStageAction(s.key, { label: s.label, probability: Number(s.probability) }), { ok: "Etapa atualizada." })}>Salvar</button> : <span />}
        </li>
      ))}
      <li className="text-xs text-muted">A ordem e o tipo das etapas (aberta, ganho, perdido) são fixos nesta versão; o nome e a probabilidade padrão são editáveis.</li>
    </ul>
  );
}

export function TokensPanel({ tokens, mcpUrl }: { tokens: Token[]; mcpUrl: string }) {
  const { run, pending } = useRun();
  const toast = useToast();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [days, setDays] = useState("90");
  const [fresh, setFresh] = useState<string | null>(null);
  const cmd = (tok: string) => `claude mcp add --transport http mglabs ${mcpUrl} --header "Authorization: Bearer ${tok}"`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Conecte o Claude Code oficial (com a sua assinatura) ao CRM. O token é do próprio MGLABS OS, vale só para este espaço de trabalho e pode ser revogado a qualquer momento. Nenhuma credencial da assinatura Claude é guardada aqui.</p>
      <form className="grid gap-3 sm:grid-cols-[1fr_150px_120px_auto]" onSubmit={(e) => { e.preventDefault(); run(() => createTokenAction({ name, scope, expiresInDays: days ? Number(days) : null }), { onOk: (r) => { setFresh(r.token); setName(""); } }); }}>
        <Field label="Nome do token"><input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code — notebook" /></Field>
        <Field label="Permissão"><select className="input" value={scope} onChange={(e) => setScope(e.target.value as "read")}><option value="read">Somente leitura</option><option value="write">Leitura + rascunhos e tarefas</option></select></Field>
        <Field label="Validade (dias)"><input type="number" min={1} max={365} className="input" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <button className="btn btn-primary self-end" disabled={pending || !name.trim()}><KeyRound className="h-4 w-4" /> Gerar</button>
      </form>
      {fresh && (
        <div className="rounded-lg border border-brand/40 bg-brand/10 p-3 text-sm">
          <p className="font-medium">Copie agora — este token não será mostrado de novo.</p>
          <code className="mt-2 block break-all rounded bg-background p-2 text-xs">{fresh}</code>
          <p className="mt-2 text-xs text-muted">Comando para conectar no terminal:</p>
          <code className="mt-1 block break-all rounded bg-background p-2 text-xs">{cmd(fresh)}</code>
          <div className="mt-2 flex gap-2"><button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(cmd(fresh)).then(() => toast("Comando copiado."))}><Copy className="h-4 w-4" aria-hidden /> Copiar comando</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>Já copiei</button></div>
        </div>
      )}
      <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-left text-xs text-muted"><tr>{["Token", "Permissão", "Último uso", "Validade", ""].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}</tr></thead><tbody>
        {tokens.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Nenhum token criado.</td></tr>}
        {tokens.map((t) => <tr key={t.id} className={`border-b border-line/60 last:border-0 ${t.revokedAt ? "opacity-50" : ""}`}><td className="px-4 py-2.5"><div className="font-medium">{t.name}</div><div className="font-mono text-xs text-muted">{t.prefix}…</div></td><td className="px-4 py-2.5"><Badge tone={t.scope === "write" ? "warn" : "neutral"}>{t.scope === "write" ? "leitura + escrita" : "leitura"}</Badge></td><td className="px-4 py-2.5 text-muted">{t.lastUsedAt ? fmtDateTime(t.lastUsedAt) : "nunca"}</td><td className="px-4 py-2.5 text-muted">{t.revokedAt ? "revogado" : t.expiresAt ? fmtDateTime(t.expiresAt) : "sem validade"}</td><td className="px-4 py-2.5 text-right">{!t.revokedAt && <ConfirmButton onConfirm={() => run(() => revokeTokenAction(t.id), { ok: "Token revogado." })} label="Revogar?" ariaLabel={`Revogar token ${t.name}`}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}</td></tr>)}
      </tbody></table></div>
      <details className="text-sm text-muted"><summary className="cursor-pointer text-fg">Ferramentas disponíveis no MCP</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5"><li><b>Leitura:</b> search, list_leads, get_lead, list_companies, get_company, get_pipeline, list_due_tasks, list_projects, get_project_briefing.</li><li><b>Escrita (token com permissão de escrita):</b> create_message_draft (só rascunho, nunca envia), create_task, append_activity, update_deal_stage (só entre etapas abertas).</li><li>Fechar ganho/perdido, financeiro, propostas e envio de mensagens só pela interface. Contatos que pediram para não ser contatados são bloqueados também aqui.</li></ul></details>
    </div>
  );
}


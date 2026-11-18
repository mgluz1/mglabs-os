"use client";

import { BookOpen, ExternalLink, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, EmptyState, Field } from "@/components/ui/kit";
import { ConfirmButton, Dialog, useRun } from "@/components/ui/overlays";
import { deleteKnowledgeAction, saveKnowledgeAction } from "@/lib/actions/business";
import { KNOWLEDGE_KINDS, labelOf } from "@/lib/config/crm";
import { fmtDate } from "@/lib/dates";

type Item = { id: string; kind: string; title: string; body: string | null; url: string | null; tags: string[]; companyId: string | null; companyName: string | null; source: string; updatedAt: Date };

export function KnowledgeClient({ items, kind, q, companies }: { items: Item[]; kind: string; q: string; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const { run } = useRun();
  const [edit, setEdit] = useState<Item | "novo" | null>(null);
  const [term, setTerm] = useState(q);
  const go = (patch: Record<string, string>) => { const n = new URLSearchParams({ ...(kind ? { tipo: kind } : {}), ...(term ? { q: term } : {}), ...patch }); for (const [k, v] of [...n]) if (!v) n.delete(k); router.push(`/conhecimento?${n}`); };
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo">
          <button onClick={() => go({ tipo: "" })} className={`rounded-lg px-3 py-1.5 text-sm ${!kind ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>Tudo</button>
          {KNOWLEDGE_KINDS.map((k) => <button key={k.id} onClick={() => go({ tipo: k.id })} className={`rounded-lg px-3 py-1.5 text-sm ${kind === k.id ? "bg-brand/15 font-medium text-brand" : "text-muted hover:text-fg"}`}>{k.label}</button>)}
        </div>
        <form className="relative min-w-[200px] flex-1 sm:max-w-xs" onSubmit={(e) => { e.preventDefault(); go({ q: term }); }}><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><input className="input pl-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar título, texto ou tag" aria-label="Buscar" /></form>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setEdit("novo")}><Plus className="h-4 w-4" /> Novo item</button>
      </div>
      {items.length === 0 ? <EmptyState icon={BookOpen} title="Base de conhecimento vazia" description="Guarde processos internos, templates, referências de design e documentação de projetos. Quando o Second Brain (Obsidian) for conectado, as notas entram aqui." action={<button className="btn btn-primary" onClick={() => setEdit("novo")}>Criar o primeiro item</button>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <article key={i.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{i.title}</h3><Badge>{labelOf(KNOWLEDGE_KINDS, i.kind)}</Badge></div>
              {i.body && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{i.body}</p>}
              <div className="mt-2 flex flex-wrap gap-1">{i.tags.map((t) => <Badge key={t} tone="brand">{t}</Badge>)}{i.companyName && <Badge tone="info">{i.companyName}</Badge>}</div>
              <div className="mt-auto flex items-center gap-1 pt-3 text-xs text-muted">
                <span>{fmtDate(i.updatedAt)}{i.source === "obsidian" ? " · Obsidian" : ""}</span>
                {i.url && <a href={i.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand hover:underline">Abrir <ExternalLink className="h-3 w-3" /></a>}
                <button className={`${i.url ? "" : "ml-auto"} rounded p-1.5 hover:bg-fg/8 hover:text-fg`} onClick={() => setEdit(i)} aria-label={`Editar ${i.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                <ConfirmButton className="rounded p-1.5 hover:text-danger" label="Excluir?" onConfirm={() => run(() => deleteKnowledgeAction(i.id), { ok: "Item excluído." })}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>
              </div>
            </article>
          ))}
        </div>
      )}
      <KnowledgeDialog key={edit === "novo" ? "novo" : edit?.id ?? "x"} edit={edit} onClose={() => setEdit(null)} companies={companies} />
    </>
  );
}

function KnowledgeDialog({ edit, onClose, companies }: { edit: Item | "novo" | null; onClose: () => void; companies: { id: string; name: string }[] }) {
  const { run, pending } = useRun();
  const i = edit && edit !== "novo" ? edit : null;
  const [f, setF] = useState({ kind: i?.kind ?? "processo", title: i?.title ?? "", body: i?.body ?? "", url: i?.url ?? "", tags: (i?.tags ?? []).join(", "), companyId: i?.companyId ?? "" });
  return (
    <Dialog open={edit !== null} onClose={onClose} title={i ? "Editar item" : "Novo item"} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => saveKnowledgeAction(i?.id ?? null, { kind: f.kind as "processo", title: f.title, body: f.body || null, url: f.url || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), companyId: f.companyId || null }), { ok: "Salvo.", onOk: onClose }); }}>
        <Field label="Título *" className="sm:col-span-2"><input required className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Tipo"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KNOWLEDGE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
        <Field label="Cliente relacionado"><select className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Link (Obsidian, Notion, Drive…)" className="sm:col-span-2"><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… ou obsidian://…" /></Field>
        <Field label="Texto" className="sm:col-span-2"><textarea className="input" rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Tags (vírgula)" className="sm:col-span-2"><input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !f.title.trim()}>Salvar</button></div>
      </form>
    </Dialog>
  );
}

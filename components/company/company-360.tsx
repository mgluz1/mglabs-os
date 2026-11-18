"use client";

import { Archive, ExternalLink, FileText, FolderKanban, Mail, MessageSquareText, Pencil, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CompanyForm } from "@/components/company/company-form";
import { Timeline } from "@/components/crm/deal-drawer";
import { NewDealDialog } from "@/components/crm/new-deal-dialog";
import { Badge, Field, SectionCard, priorityTone } from "@/components/ui/kit";
import { ConfirmButton, Dialog, useRun } from "@/components/ui/overlays";
import { addNoteAction, archiveCompanyAction, createContactAction, deleteContactAction, optOutCompanyAction, updateContactAction } from "@/lib/actions/crm";
import { PRIORITIES, PROPOSAL_STATUS, labelOf, sourceLabel } from "@/lib/config/crm";
import { fmtDate, fmtShort } from "@/lib/dates";
import { brl } from "@/lib/money";
import { parseBrPhone, waLink } from "@/lib/phone";
import type { getCompany360 } from "@/lib/services/companies";

type Data = Awaited<ReturnType<typeof getCompany360>>;

export function Company360({ data, blocked, blockedReason, canFinance }: { data: Data; blocked: boolean; blockedReason: string | null; canFinance: boolean }) {
  const router = useRouter();
  const { run, pending } = useRun();
  const c = data.company;
  const [edit, setEdit] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState<null | "novo" | string>(null);
  const [optOpen, setOptOpen] = useState(false);
  const [note, setNote] = useState("");
  const phone = parseBrPhone(c.phone);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <SectionCard title="Histórico" pad>
          <form className="mb-4 space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => addNoteAction({ companyId: c.id, content: note }), { ok: "Registrado.", onOk: () => setNote("") }); }}>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anotação sobre a empresa…" aria-label="Nova anotação" />
            <div className="flex justify-end"><button className="btn btn-primary btn-sm" disabled={pending || !note.trim()}>Registrar nota</button></div>
          </form>
          <Timeline items={data.timeline} />
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard title="Dados" action={<button className="rounded p-1 text-muted hover:bg-fg/8 hover:text-fg" onClick={() => setEdit(true)} aria-label="Editar empresa"><Pencil className="h-4 w-4" /></button>}>
          <dl className="space-y-2 text-sm">
            {[["Categoria", c.category], ["Cidade", [c.neighborhood, c.city].filter(Boolean).join(" · ")], ["Endereço", c.address], ["Origem", sourceLabel(c.source)]].map(([l, v]) => v ? <div key={l as string} className="flex justify-between gap-3"><dt className="text-muted">{l}</dt><dd className="text-right">{v}</dd></div> : null)}
            {c.website && <div className="flex justify-between gap-3"><dt className="text-muted">Site</dt><dd className="truncate text-right"><a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">{c.website.replace(/^https?:\/\/(www\.)?/, "")}<ExternalLink className="h-3 w-3" /></a></dd></div>}
            {c.instagram && !blocked && <div className="flex justify-between gap-3"><dt className="text-muted">Instagram</dt><dd className="truncate text-right"><a href={c.instagram} target="_blank" rel="noreferrer" className="text-brand hover:underline">{c.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@")}</a></dd></div>}
          </dl>
          {c.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
          {c.notes && <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-muted">{c.notes}</p>}
          {blocked ? (
            <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{blockedReason} Botões de contato desativados.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {phone?.mobile && <a href={waLink(phone, "")} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><MessageSquareText className="h-4 w-4" /> WhatsApp</a>}
              {phone && <a href={`tel:${phone.e164}`} className="btn btn-ghost btn-sm"><Phone className="h-4 w-4" /> {phone.display}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="btn btn-ghost btn-sm"><Mail className="h-4 w-4" /> E-mail</a>}
              <Link href={`/mensagens?empresa=${c.id}`} className="btn btn-primary btn-sm"><MessageSquareText className="h-4 w-4" /> Escrever</Link>
            </div>
          )}
          {phone?.mobile && !blocked && <p className="mt-2 text-[11px] text-muted">Celular: provável WhatsApp, ainda não confirmado.</p>}
          <div className="mt-3 flex gap-3 border-t border-line pt-3 text-xs">
            {!blocked && <button className="text-danger hover:underline" onClick={() => setOptOpen(true)}>Não contatar mais</button>}
            <button className="inline-flex items-center gap-1 text-muted hover:text-fg" onClick={() => run(() => archiveCompanyAction(c.id, true), { ok: "Empresa arquivada.", onOk: () => router.push("/empresas") })}><Archive className="h-3 w-3" /> Arquivar</button>
          </div>
        </SectionCard>

        <SectionCard title={`Contatos (${data.contacts.length})`} action={<button className="btn btn-ghost btn-sm" onClick={() => setContactOpen("novo")}><UserPlus className="h-4 w-4" /> Novo</button>}>
          {data.contacts.length === 0 ? <p className="text-sm text-muted">Nenhum contato cadastrado.</p> : (
            <ul className="space-y-2">
              {data.contacts.map((k) => (
                <li key={k.id} className="rounded-lg border border-line bg-elevated px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0"><span className="block truncate font-medium">{k.name}</span><span className="block truncate text-xs text-muted">{[k.role, k.preferredChannel && `prefere ${k.preferredChannel}`].filter(Boolean).join(" · ")}</span></span>
                    <span className="flex shrink-0 items-center">
                      <button className="rounded p-1 text-muted hover:bg-fg/8 hover:text-fg" onClick={() => setContactOpen(k.id)} aria-label={`Editar ${k.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <ConfirmButton className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" label="Excluir?" onConfirm={() => run(() => deleteContactAction(k.id), { ok: "Contato excluído." })}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>
                    </span>
                  </div>
                  {k.optedOut ? <Badge tone="danger">não contatar</Badge> : <div className="mt-1 text-xs text-muted">{[k.whatsapp ?? k.phone, k.email].filter(Boolean).join(" · ")}</div>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Oportunidades" action={<button className="btn btn-ghost btn-sm" onClick={() => setDealOpen(true)}><Plus className="h-4 w-4" /> Nova</button>}>
          {data.deals.length === 0 ? <p className="text-sm text-muted">Sem oportunidades.</p> : (
            <ul className="space-y-1.5">{data.deals.map((d) => <li key={d.id}><Link href={`/crm?deal=${d.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-sm hover:border-fg/25"><span className="min-w-0"><span className="block truncate">{d.title}</span><span className="text-xs text-muted">{brl(d.valueCents)}</span></span><Badge tone={d.stageKind === "won" ? "ok" : d.stageKind === "lost" ? "danger" : "brand"}>{d.stageLabel}</Badge></Link></li>)}</ul>
          )}
        </SectionCard>

        <SectionCard title="Tarefas">
          {data.tasks.length === 0 ? <p className="text-sm text-muted">Sem tarefas.</p> : (
            <ul className="space-y-1.5 text-sm">{data.tasks.slice(0, 6).map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span className={`truncate ${t.status === "concluida" ? "text-muted line-through" : ""}`}>{t.title}</span>{t.status !== "concluida" && <Badge tone={priorityTone(t.priority)}>{labelOf(PRIORITIES, t.priority)}</Badge>}{t.dueAt && <span className="shrink-0 text-xs text-muted">{fmtShort(t.dueAt)}</span>}</li>)}</ul>
          )}
          <Link href="/tarefas" className="mt-2 inline-block text-xs text-brand hover:underline">Ver todas</Link>
        </SectionCard>

        {(data.proposals.length > 0 || data.projects.length > 0) && (
          <SectionCard title="Propostas e projetos">
            <ul className="space-y-1.5 text-sm">
              {data.proposals.map((p) => <li key={p.id}><Link href={`/propostas/${p.id}`} className="flex items-center justify-between gap-2 hover:text-brand"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{p.title} · v{p.version}</span></span><span className="shrink-0 text-xs text-muted">{brl(p.totalCents)} · {labelOf(PROPOSAL_STATUS, p.status)}</span></Link></li>)}
              {data.projects.map((p) => <li key={p.id}><Link href={`/projetos/${p.id}`} className="flex items-center justify-between gap-2 hover:text-brand"><span className="flex min-w-0 items-center gap-2"><FolderKanban className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{p.name}</span></span><span className="shrink-0 text-xs text-muted">{p.status.replace("_", " ")}</span></Link></li>)}
            </ul>
          </SectionCard>
        )}

        {canFinance && (
          <SectionCard title="Financeiro">
            <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted">Cobrado</dt><dd className="font-semibold tabular-nums">{brl(data.finance.billedCents)}</dd></div><div><dt className="text-xs text-muted">Recebido</dt><dd className="font-semibold tabular-nums text-ok">{brl(data.finance.receivedCents)}</dd></div></dl>
          </SectionCard>
        )}
        <p className="px-1 text-xs text-muted">Cadastrada em {fmtDate(c.createdAt)}{c.placeId ? " · vinculada ao Radar" : " · sem vínculo com o Radar"}</p>
      </div>

      <Dialog open={edit} onClose={() => setEdit(false)} title="Editar empresa" wide><CompanyForm company={c} onDone={() => setEdit(false)} /></Dialog>
      <NewDealDialog open={dealOpen} onClose={() => setDealOpen(false)} companies={[{ id: c.id, name: c.name }]} defaultCompanyId={c.id} onCreated={(id) => router.push(`/crm?deal=${id}`)} />
      <ContactDialog companyId={c.id} contact={contactOpen && contactOpen !== "novo" ? data.contacts.find((k) => k.id === contactOpen) : undefined} open={contactOpen !== null} onClose={() => setContactOpen(null)} />
      <OptOutDialog open={optOpen} onClose={() => setOptOpen(false)} onConfirm={(reason) => run(() => optOutCompanyAction(c.id, reason), { ok: "Registrado. Contato bloqueado.", onOk: () => setOptOpen(false) })} />
    </div>
  );
}

type ContactRow = Data["contacts"][number];
function ContactDialog({ companyId, contact, open, onClose }: { companyId: string; contact?: ContactRow; open: boolean; onClose: () => void }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ name: contact?.name ?? "", role: contact?.role ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", whatsapp: contact?.whatsapp ?? "", instagram: contact?.instagram ?? "", preferredChannel: contact?.preferredChannel ?? "", notes: contact?.notes ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={contact ? "Editar contato" : "Novo contato"}>
      <form key={contact?.id ?? "novo"} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const input = { ...f, companyId, preferredChannel: (f.preferredChannel || null) as "whatsapp" | null }; run(() => (contact ? updateContactAction(contact.id, input) : createContactAction(input)), { ok: "Contato salvo.", onOk: onClose }); }}>
        <Field label="Nome *" className="sm:col-span-2"><input required className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Cargo"><input className="input" value={f.role} onChange={set("role")} /></Field>
        <Field label="Canal preferido"><select className="input" value={f.preferredChannel} onChange={set("preferredChannel")}><option value="">—</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="ligacao">Ligação</option><option value="instagram">Instagram</option></select></Field>
        <Field label="WhatsApp"><input className="input" value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></Field>
        <Field label="Telefone"><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label="E-mail"><input type="email" className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Instagram"><input className="input" value={f.instagram} onChange={set("instagram")} /></Field>
        <Field label="Notas" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={pending || !f.name.trim()}>Salvar</button></div>
      </form>
    </Dialog>
  );
}

function OptOutDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("Pediu para não ser contatado");
  return (
    <Dialog open={open} onClose={onClose} title="Não contatar mais" footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-danger" onClick={() => onConfirm(reason)}>Confirmar</button></>}>
      <p className="mb-3 text-sm text-muted">Bloqueia mensagens e botões de contato para esta empresa e todos os contatos, e encerra as oportunidades abertas como perdidas. A decisão fica no histórico.</p>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" />
    </Dialog>
  );
}

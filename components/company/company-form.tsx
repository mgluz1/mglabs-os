"use client";

import { useState } from "react";

import { createCompanyAction, updateCompanyAction } from "@/lib/actions/crm";
import { tagList } from "@/components/crm/common";
import { Field } from "@/components/ui/kit";
import { useRun } from "@/components/ui/overlays";
import { SOURCES } from "@/lib/config/crm";
import type { CompanyRow } from "@/lib/services/companies";

export function CompanyForm({ company, onDone, onCreated }: { company?: CompanyRow; onDone: () => void; onCreated?: (c: { id: string; name: string }) => void }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({
    name: company?.name ?? "",
    status: company?.status ?? "lead",
    category: company?.category ?? "",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    instagram: company?.instagram ?? "",
    website: company?.website ?? "",
    city: company?.city ?? "Goiânia",
    neighborhood: company?.neighborhood ?? "",
    address: company?.address ?? "",
    source: company?.source ?? "manual",
    tags: (company?.tags ?? []).join(", "),
    notes: company?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const input = { ...f, status: f.status as "lead" | "cliente" | "inativo", tags: tagList(f.tags) };
        if (company) run(() => updateCompanyAction(company.id, input), { ok: "Empresa atualizada.", onOk: onDone });
        else run(() => createCompanyAction(input), { ok: "Empresa cadastrada.", onOk: (c) => (onCreated ? onCreated({ id: c.id, name: c.name }) : onDone()) });
      }}
    >
      <Field label="Nome da empresa *" className="sm:col-span-2"><input required autoFocus className="input" value={f.name} onChange={set("name")} /></Field>
      <Field label="Telefone / WhatsApp"><input className="input" value={f.phone} onChange={set("phone")} placeholder="(62) 99999-0000" inputMode="tel" /></Field>
      <Field label="E-mail"><input type="email" className="input" value={f.email} onChange={set("email")} /></Field>
      <Field label="Instagram"><input className="input" value={f.instagram} onChange={set("instagram")} placeholder="@perfil" /></Field>
      <Field label="Site"><input className="input" value={f.website} onChange={set("website")} placeholder="empresa.com.br" /></Field>
      <Field label="Categoria"><input className="input" value={f.category} onChange={set("category")} placeholder="barbearia, clínica…" /></Field>
      <Field label="Cidade"><input className="input" value={f.city} onChange={set("city")} /></Field>
      <Field label="Bairro"><input className="input" value={f.neighborhood} onChange={set("neighborhood")} /></Field>
      <Field label="Origem">
        <select className="input" value={f.source} onChange={set("source")}>
          {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Situação">
        <select className="input" value={f.status} onChange={set("status")}>
          <option value="lead">Lead</option>
          <option value="cliente">Cliente</option>
          <option value="inativo">Inativo</option>
        </select>
      </Field>
      <Field label="Tags (separadas por vírgula)"><input className="input" value={f.tags} onChange={set("tags")} /></Field>
      <Field label="Endereço" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
      <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending || !f.name.trim()}>{pending ? "Salvando…" : company ? "Salvar" : "Cadastrar empresa"}</button>
      </div>
    </form>
  );
}

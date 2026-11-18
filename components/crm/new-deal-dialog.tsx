"use client";

import { useState } from "react";

import { CompanyForm } from "@/components/company/company-form";
import { Field } from "@/components/ui/kit";
import { Dialog, useRun } from "@/components/ui/overlays";
import { MoneyInput } from "@/components/ui/money-input";
import { createDealAction } from "@/lib/actions/crm";
import { SERVICE_TYPES, SOURCES } from "@/lib/config/crm";
import { ymdToInstantSP } from "@/lib/dates";
import { parseMoney } from "@/lib/money";

export type CompanyOption = { id: string; name: string };

/** Cadastro manual de oportunidade — independe do Radar: empresa existente ou nova. */
export function NewDealDialog({ open, onClose, companies, defaultCompanyId, onCreated }: { open: boolean; onClose: () => void; companies: CompanyOption[]; defaultCompanyId?: string; onCreated?: (dealId: string) => void }) {
  const { run, pending } = useRun();
  const [mode, setMode] = useState<"existente" | "nova">(companies.length || defaultCompanyId ? "existente" : "nova");
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [newCompany, setNewCompany] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("manual");
  const [step, setStep] = useState("");
  const [stepDate, setStepDate] = useState("");

  const effectiveCompany = mode === "existente" ? companyId : newCompany?.id ?? "";
  const companyName = mode === "existente" ? companies.find((c) => c.id === companyId)?.name : newCompany?.name;

  return (
    <Dialog open={open} onClose={onClose} title="Nova oportunidade" wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              createDealAction({
                companyId: effectiveCompany,
                deal: {
                  title: title.trim() || `${service || "Oportunidade"} — ${companyName ?? ""}`,
                  serviceType: service || null,
                  estimatedValueCents: parseMoney(value),
                  source: source as "manual",
                  nextStep: step || null,
                  nextStepAt: stepDate ? ymdToInstantSP(stepDate)?.toISOString() : null,
                },
              }),
            { ok: "Oportunidade criada.", onOk: (d) => { onCreated?.(d.id); onClose(); } },
          );
        }}
      >
        <div className="sm:col-span-2">
          <div className="mb-2 flex gap-1 rounded-lg border border-line p-0.5 text-sm" role="tablist">
            {(["existente", "nova"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? "bg-brand/15 font-medium text-brand" : "text-muted"}`}>
                {m === "existente" ? "Empresa já cadastrada" : "Nova empresa"}
              </button>
            ))}
          </div>
          {mode === "existente" ? (
            <select required className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Empresa">
              <option value="">Escolha a empresa…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : newCompany ? (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Empresa “{newCompany.name}” cadastrada. Complete a oportunidade abaixo.</p>
          ) : (
            <div className="rounded-lg border border-line p-3">
              <CompanyForm onDone={() => {}} onCreated={setNewCompany} />
              <p className="mt-2 text-xs text-muted">Cadastre a empresa primeiro; depois a oportunidade.</p>
            </div>
          )}
        </div>
        {effectiveCompany && (
          <>
            <Field label="Título" className="sm:col-span-2"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${service || "Site"} — ${companyName ?? "empresa"}`} /></Field>
            <Field label="Serviço">
              <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
                <option value="">—</option>
                {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Valor previsto"><MoneyInput value={value} onChange={setValue} /></Field>
            <Field label="Origem do lead">
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Próximo passo"><input className="input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Ligar, enviar proposta…" /></Field>
            <Field label="Prazo do acompanhamento"><input type="date" className="input" value={stepDate} onChange={(e) => setStepDate(e.target.value)} /></Field>
          </>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={pending || !effectiveCompany}>{pending ? "Criando…" : "Criar oportunidade"}</button>
        </div>
      </form>
    </Dialog>
  );
}

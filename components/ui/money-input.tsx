"use client";

/** Campo de valor em reais (texto, vírgula decimal). Converta com parseMoney() de lib/money ao enviar. */
export function MoneyInput({ value, onChange, placeholder = "0,00", id, required }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string; required?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
      <input id={id} required={required} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={placeholder} className="input pl-9 tabular-nums" />
    </div>
  );
}

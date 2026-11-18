/* eslint-disable @next/next/no-img-element -- ativos oficiais estáticos da marca */
/** Símbolo oficial (public/brand/mark-mglabs.png) + nome "mglabs." como na logo. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <img src="/brand/mark-mglabs.png" width={size} height={size} alt="" decoding="async" className={`rounded-[22%] ${className}`} />;
}

export function Brand({ compact = false, subtitle = true }: { compact?: boolean; subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={compact ? 32 : 34} />
      {!compact && (
        <span className="leading-tight">
          <span className="block font-heading text-[18px] font-bold tracking-tight">
            mglabs<span className="text-brand">.</span>
          </span>
          {subtitle && <span className="block text-[10.5px] uppercase tracking-[0.14em] text-muted">OS · operação</span>}
        </span>
      )}
    </span>
  );
}

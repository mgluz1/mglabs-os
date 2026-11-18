import { ArrowUpRight, Construction, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-6 sm:px-8">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs text-muted hover:text-fg">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx("mx-auto w-full px-4 pb-10 sm:px-8", wide ? "max-w-[1500px]" : "max-w-6xl")}>{children}</div>;
}

export function SectionCard({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "danger" | "ok" | "warn" }) {
  const body = (
    <div className="card h-full p-4 transition hover:border-fg/25">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {href && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
      </div>
      <div className={cx("mt-1.5 font-heading text-2xl font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <h3 className="font-heading text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Aviso explícito do que ainda falta num módulo em lapidação. Nada de dado fictício. */
export function PendingNote({ items, title = "Em lapidação" }: { items: string[]; title?: string }) {
  return (
    <aside className="mt-6 flex gap-3 rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm">
      <Construction className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-medium text-warn">{title}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="px-4 py-6 sm:px-8" role="status" aria-label="Carregando">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64" />
    </div>
  );
}

type Tone = "neutral" | "brand" | "danger" | "warn" | "info" | "ok";
const TONES: Record<Tone, string> = {
  neutral: "bg-fg/8 text-muted ring-fg/10",
  brand: "bg-brand/12 text-brand ring-brand/25",
  danger: "bg-danger/12 text-danger ring-danger/25",
  warn: "bg-warn/12 text-warn ring-warn/25",
  info: "bg-info/12 text-info ring-info/25",
  ok: "bg-ok/12 text-ok ring-ok/25",
};
export function Badge({ children, tone = "neutral", icon: Icon }: { children: ReactNode; tone?: Tone; icon?: LucideIcon }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1", TONES[tone])}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function priorityTone(p: string): Tone {
  return p === "urgente" ? "danger" : p === "alta" ? "warn" : p === "baixa" ? "neutral" : "info";
}

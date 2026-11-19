"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { COMMAND_LINKS, NAV, QUICK_CREATE } from "@/components/shell/nav";

type Hit = { kind: string; id: string; title: string; subtitle: string | null; href: string };
type Entry = { key: string; label: string; hint?: string; href: string; group: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (r.ok) setHits((await r.json()).hits);
      } catch {
        /* cancelado ou offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const entries: Entry[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const shownHits = term.length < 2 ? [] : hits;
    const nav: Entry[] = NAV.flatMap((g) => g.items.map((i) => ({ key: i.href, label: i.label, hint: `g ${i.shortcut}`, href: i.href, group: "Ir para" })));
    const extra: Entry[] = COMMAND_LINKS.map((c) => ({ key: c.href, label: c.label, hint: c.shortcut ? `${c.hint} · g ${c.shortcut}` : c.hint, href: c.href, group: "Atalhos" }));
    const create: Entry[] = QUICK_CREATE.map((c) => ({ key: c.href, label: c.label, href: c.href, group: "Criar" }));
    const base = [...nav, ...extra, ...create].filter((e) => !term || e.label.toLowerCase().includes(term) || (e.hint?.toLowerCase().includes(term) ?? false));
    const found = shownHits.map((h) => ({ key: `${h.kind}:${h.id}`, label: h.title, hint: `${h.kind}${h.subtitle ? " · " + h.subtitle : ""}`, href: h.href, group: "Resultados" }));
    return [...found, ...base].slice(0, 30);
  }, [q, hits]);

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    router.push(e.href);
  };

  const close = () => {
    setQ("");
    setHits([]);
    setActive(0);
    onClose();
  };

  let lastGroup = "";
  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      aria-label="Busca global"
      className="fade-in mx-auto mt-[12vh] w-[min(94vw,600px)] rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/55"
    >
      {open && (
        <div>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="h-4 w-4 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, entries.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(entries[active]);
                }
              }}
              placeholder="Buscar empresas, contatos, oportunidades, projetos… ou ir para uma tela"
              className="h-12 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none placeholder:text-fg/35"
              aria-label="Buscar"
            />
            {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden />}
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
            {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado para “{q}”.</li>}
            {entries.map((e, i) => {
              const header = e.group !== lastGroup ? (lastGroup = e.group) : null;
              return (
                <li key={e.key} role="presentation">
                  {header && <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{header}</div>}
                  <button
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(e)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-brand/12 text-fg" : "text-fg/85"}`}
                  >
                    <span className="truncate">{e.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                      {e.hint}
                      {i === active && <CornerDownLeft className="h-3 w-3" aria-hidden />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}

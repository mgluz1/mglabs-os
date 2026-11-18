"use client";

import { ChevronsLeft, ChevronsRight, Menu, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Brand, BrandMark } from "@/components/brand";
import { CommandPalette } from "@/components/shell/command-palette";
import { NAV, QUICK_CREATE } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ToastProvider } from "@/components/ui/overlays";

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function AppShell({ children, user }: { children: ReactNode; user: ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const gPending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // preferência do menu recolhido (só conveniência: funciona sem armazenamento)
  useEffect(() => {
    try {
      if (localStorage.getItem("mglabs-sidebar") === "1") setCollapsed(true);
    } catch {
      /* ignorar */
    }
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("mglabs-sidebar", c ? "0" : "1");
      } catch {
        /* ignorar */
      }
      return !c;
    });
  }, []);

  // atalhos: Ctrl/Cmd+K busca · Ctrl/Cmd+B menu · "g" + letra navega
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (gPending.current) {
        clearTimeout(gPending.current);
        gPending.current = null;
        const target = NAV.flatMap((g) => g.items).find((i) => i.shortcut === e.key.toLowerCase());
        if (target) router.push(target.href);
        return;
      }
      if (e.key === "g") gPending.current = setTimeout(() => (gPending.current = null), 900);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggle]);

  return (
    <ToastProvider>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-brand-on">
        Ir para o conteúdo
      </a>
      <div className="flex h-dvh w-full overflow-hidden">
        {/* desktop */}
        <aside className={`hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex ${collapsed ? "w-[68px]" : "w-60"}`}>
          <div className={`flex h-14 items-center ${collapsed ? "justify-center" : "px-4"}`}>
            <Link href="/dashboard" aria-label="mglabs — início">
              <Brand compact={collapsed} />
            </Link>
          </div>
          <Suspense fallback={<NavList compact={collapsed} pathname="" />}><ActiveNav compact={collapsed} /></Suspense>
          <button onClick={toggle} className="m-2 flex items-center justify-center gap-2 rounded-lg p-2 text-xs text-muted hover:bg-fg/6 hover:text-fg" aria-label={collapsed ? "Expandir menu" : "Recolher menu"} title="Ctrl+B">
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Recolher</>}
          </button>
        </aside>

        {/* mobile */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />
            <aside className="slide-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-2xl">
              <div className="flex h-14 items-center justify-between px-4">
                <Brand />
                <button onClick={() => setMobileOpen(false)} className="rounded p-1.5 text-muted hover:bg-fg/8" aria-label="Fechar menu">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Suspense fallback={<NavList compact={false} pathname="" />}><ActiveNav compact={false} onNavigate={() => setMobileOpen(false)} /></Suspense>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur sm:px-4">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted hover:bg-fg/8 md:hidden" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="md:hidden">
              <BrandMark size={26} />
            </span>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-background/60 px-3 text-left text-sm text-muted transition hover:border-fg/25 sm:max-w-md"
              aria-label="Abrir busca global"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">Buscar ou ir para…</span>
              <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:block">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <div className="relative">
                <button onClick={() => setCreateOpen((o) => !o)} onBlur={() => setTimeout(() => setCreateOpen(false), 150)} className="btn btn-primary btn-sm" aria-haspopup="menu" aria-expanded={createOpen}>
                  <Plus className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Novo</span>
                </button>
                {createOpen && (
                  <ul role="menu" className="fade-in absolute right-0 top-full z-40 mt-1.5 w-52 rounded-lg border border-line bg-elevated p-1 shadow-xl">
                    {QUICK_CREATE.map((c) => (
                      <li key={c.href} role="none">
                        <Link role="menuitem" href={c.href} className="block rounded-md px-3 py-1.5 text-sm hover:bg-fg/8">
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ThemeToggle />
              {user}
            </div>
          </header>
          <main id="conteudo" className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </ToastProvider>
  );
}

/** Lê o caminho atual (dado de runtime) fora do shell estático, dentro de <Suspense>. */
function ActiveNav({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList compact={compact} pathname={pathname} onNavigate={onNavigate} />;
}

function NavList({ compact, pathname, onNavigate }: { compact: boolean; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
      {NAV.map((g) => (
        <div key={g.label}>
          {!compact ? <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{g.label}</div> : <div className="mx-3 mb-1 border-t border-line first:hidden" />}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = pathname === i.href || pathname.startsWith(i.href + "/");
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    title={compact ? i.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${compact ? "justify-center" : ""} ${active ? "bg-brand/12 font-medium text-fg" : "text-fg/70 hover:bg-fg/6 hover:text-fg"}`}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-brand" aria-hidden />}
                    <i.icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-brand" : "text-muted group-hover:text-fg"}`} aria-hidden />
                    {!compact && <span className="truncate">{i.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

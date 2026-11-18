"use client";

import { Check, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import type { Result } from "@/lib/result";

// ---------- Toasts ----------
type ToastItem = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="fade-in pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm shadow-xl">
            {t.tone === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Executa uma Server Action com estado de carregamento, aviso de sucesso/erro e atualização da tela. */
export function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(fn: () => Promise<Result<T>>, opts: { ok?: string; refresh?: boolean; onOk?: (data: T) => void; onError?: (msg: string) => void } = {}) => {
      start(async () => {
        const r = await fn();
        if (!r.ok) {
          toast(r.error, "error");
          opts.onError?.(r.error);
          return;
        }
        if (opts.ok) toast(opts.ok, "ok");
        opts.onOk?.(r.data);
        if (opts.refresh !== false) router.refresh();
      });
    },
    [router, toast],
  );
  return { run, pending };
}

// ---------- Dialog / SlideOver (nativos: foco preso, Esc e backdrop de graça) ----------
function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const h = () => onClose();
    d.addEventListener("close", h);
    return () => d.removeEventListener("close", h);
  }, [onClose]);
  return ref;
}

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useNativeDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`fade-in m-auto max-h-[90dvh] rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-[2px]`}
      style={{ width: `min(94vw, ${wide ? 720 : 520}px)` }}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-heading text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-fg/10 hover:text-fg" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function SlideOver({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  const ref = useNativeDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Detalhes"
      className="slide-in m-0 ml-auto h-dvh max-h-dvh w-full max-w-[560px] border-l border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/45"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-semibold">{title}</h2>
              {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-fg/10 hover:text-fg" aria-label="Fechar painel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Botão com confirmação inline para ações destrutivas. */
export function ConfirmButton({ children, onConfirm, label = "Confirmar?", className = "btn btn-danger btn-sm", disabled }: { children: ReactNode; onConfirm: () => void; label?: string; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? label : children}
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth/client";

export function AuthForm({ path }: { path: string }) {
  const router = useRouter();
  const isSignUp = path === "sign-up";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ email, password, name: String(form.get("name") || email) })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 401 || result.error.code === "INVALID_EMAIL_OR_PASSWORD"
            ? "E-mail ou senha inválidos."
            : (result.error.message ?? "Não foi possível entrar."),
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Falha de conexão com o serviço de login.");
    } finally {
      setPending(false);
    }
  }

  const field = "w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-sky-500/60";
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute h-[640px] w-[640px] rounded-full border border-sky-400/10" />
      <div className="radar-sweep pointer-events-none absolute h-[640px] w-[640px] rounded-full opacity-60" />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#0f1219]/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/25">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" /><path d="M4 6h.01" /><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" /><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" /><path d="M12 18h.01" /><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" /><circle cx="12" cy="12" r="2" /><path d="m13.41 10.59 5.66-5.66" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{isSignUp ? "Criar conta" : "Entrar"}</h1>
            <p className="text-xs text-white/45">radarMG · prospecção da MG Labs</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {isSignUp && <input name="name" placeholder="Nome" className={field} autoComplete="name" />}
          <input name="email" type="email" required placeholder="E-mail" className={field} autoComplete="email" />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Senha (mín. 8 caracteres)"
            className={field}
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button
            disabled={pending}
            className="mt-1 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 py-2.5 font-semibold text-white shadow-lg shadow-sky-500/25 hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Aguarde…" : isSignUp ? "Criar conta" : "Entrar"}
          </button>
        </form>
        <a href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"} className="mt-4 block text-center text-sm text-sky-400 hover:underline">
          {isSignUp ? "Já tenho conta" : "Criar conta"}
        </a>
      </div>
    </main>
  );
}

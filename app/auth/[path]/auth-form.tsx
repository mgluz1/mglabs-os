"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Brand } from "@/components/brand";
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
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Falha de conexão com o serviço de login.");
    } finally {
      setPending(false);
    }
  }

  const field = "input py-2.5";
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute h-[640px] w-[640px] rounded-full border border-brand/10" />
      <div className="radar-sweep pointer-events-none absolute h-[640px] w-[640px] rounded-full opacity-60" />
      <div className="relative w-full max-w-sm rounded-2xl bg-surface/90 p-7 shadow-2xl ring-1 ring-fg/10 backdrop-blur-xl">
        <div className="mb-6">
          <Brand />
          <h1 className="mt-5 text-lg font-semibold leading-tight">{isSignUp ? "Criar conta" : "Entrar"}</h1>
          <p className="text-xs text-fg/50">Acesso privado ao MGLABS OS</p>
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
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            disabled={pending}
            className="btn btn-primary mt-1 py-2.5"
          >
            {pending ? "Aguarde…" : isSignUp ? "Criar conta" : "Entrar"}
          </button>
        </form>
        <a href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"} className="mt-4 block text-center text-sm text-brand hover:underline">
          {isSignUp ? "Já tenho conta" : "Criar conta"}
        </a>
      </div>
    </main>
  );
}

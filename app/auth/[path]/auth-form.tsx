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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{isSignUp ? "Criar conta" : "Entrar no radarMGLABS"}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {isSignUp && (
          <input name="name" placeholder="Nome" className="rounded border px-3 py-2" autoComplete="name" />
        )}
        <input
          name="email"
          type="email"
          required
          placeholder="E-mail"
          className="rounded border px-3 py-2"
          autoComplete="email"
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Senha (mín. 8 caracteres)"
          className="rounded border px-3 py-2"
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">
          {pending ? "Aguarde…" : isSignUp ? "Criar conta" : "Entrar"}
        </button>
      </form>
      <a href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"} className="text-sm text-blue-600">
        {isSignUp ? "Já tenho conta" : "Criar conta"}
      </a>
    </main>
  );
}

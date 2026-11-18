"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="w-full rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/auth/sign-in");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}

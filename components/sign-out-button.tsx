"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="flex items-center gap-1.5 rounded-lg p-2 text-sm text-muted transition hover:bg-fg/8 hover:text-fg"
      aria-label="Sair da conta"
      title="Sair"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/auth/sign-in");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
